/*
 * Module/Script Name: metrics.ts
 * Path: server/routes/metrics.ts
 *
 * Description:
 * REST API routes for the AI Visibility metrics domain: overview KPIs,
 * trend data, Share of Voice, mention lists, on-demand response parsing,
 * and scoring configuration.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-10
 * Last Modified Date: 2026-07-08
 * Comments:
 * - v1.00 Sprint 4 initial implementation
 * - v1.01 B-26: mentions list paginated (limit/offset, newest first),
 *   response envelope now { mentions, total }
 * - v1.02 Epic 5 slice 1 (issue #29): GET .../metrics/by-platform - per-
 *   platform breakdown of the core live metrics, plus platform-balanced
 *   and response-weighted combined rollups, both labeled
 * - v1.03 Epic 5 slice 2 (issue #29): GET .../metrics/non-branded/by-
 *   platform - same per-platform + dual-rollup pattern for the
 *   non-branded mention rate, recommendation rate, and recommendation SoV
 * - v1.04 Epic 5 slice 3 (issue #29): strongRecommendationRate,
 *   firstChoiceRate, and rankDistribution added to both non-branded
 *   routes (definitions locked 2026-07-31)
 * - v1.05 Epic 5 slice 4 (issue #29): trustedThirdPartySupportRate,
 *   clientOwnedCitationRate, competitorOwnedCitationRate added to
 *   GET .../metrics/overview and GET .../metrics/by-platform
 *   (definitions locked 2026-07-31)
 */

import type { Express } from "express";
import {
  metricStore,
  mentionStore,
  responseStore,
} from "../storage";
import { requireAuth, requireRole } from "../auth";
import { ok } from "../response";
import { AppError } from "../errors";
import { jobRunner } from "../jobs/runner";
import {
  computeCitationFrequency,
  computeMentionRate,
  computeAISoV,
  computeRecommendationRate,
  DEFAULT_WEIGHTS,
} from "../services/scoring";

const ANALYST_ROLES = ["super_admin", "agency_admin", "analyst"] as const;

function parsePageParam(raw: unknown, name: string): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (typeof raw !== "string" || !Number.isInteger(n) || n < 0)
    throw new AppError(400, `Invalid ${name}`, "INVALID_PAGINATION");
  return n;
}

// Epic 5 (issue #29) slice 3, definitions locked 2026-07-31: avg/median
// rank computed only over ranked (non-null) responses; the frequency
// metrics use mentionedCount (all non-branded responses where the client
// brand was mentioned at all) as their denominator, so unrankedFrequency
// includes mentioned-but-never-in-a-numbered-list responses.
function computeRankDistribution(
  clientRanks: number[],
  mentionedCount: number
): {
  avgRank: number | null;
  medianRank: number | null;
  rank1Frequency: number;
  top3Frequency: number;
  unrankedFrequency: number;
  mentionedCount: number;
} {
  const rankedCount = clientRanks.length;
  const pct = (n: number): number => (mentionedCount > 0 ? (n / mentionedCount) * 100 : 0);
  const sorted = [...clientRanks].sort((a, b) => a - b);
  const mid = Math.floor(rankedCount / 2);
  const medianRank =
    rankedCount === 0 ? null : rankedCount % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  return {
    avgRank: rankedCount > 0 ? clientRanks.reduce((s, r) => s + r, 0) / rankedCount : null,
    medianRank,
    rank1Frequency: pct(clientRanks.filter((r) => r === 1).length),
    top3Frequency: pct(clientRanks.filter((r) => r <= 3).length),
    unrankedFrequency: pct(mentionedCount - rankedCount),
    mentionedCount,
  };
}

function periodToDates(period: string): { fromDate: string; toDate: string } {
  const toDate = new Date().toISOString().slice(0, 10);
  const days = period === "90d" ? 90 : period === "365d" ? 365 : 30;
  const from = new Date();
  from.setDate(from.getDate() - days);
  return { fromDate: from.toISOString().slice(0, 10), toDate };
}

export function registerMetricRoutes(app: Express): void {
  // --- Overview dashboard --------------------------------------------------

  app.get("/api/clients/:id/metrics/overview", requireAuth, async (req, res) => {
    const clientId = Number(req.params.id);
    if (Number.isNaN(clientId))
      throw new AppError(400, "Invalid client id", "INVALID_ID");

    const { fromDate, toDate } = periodToDates(
      typeof req.query.period === "string" ? req.query.period : "30d"
    );
    // TD-24: live aggregate over raw tables — snapshot deltas break when
    // re-parses or brand pruning rewrite cumulative history.
    const agg = await metricStore.aggregateLiveForPeriod(clientId, fromDate, toDate);

    ok(res, {
      citationFrequency: computeCitationFrequency(agg.totalCitations, agg.totalResponses),
      mentionRate: computeMentionRate(agg.totalMentions, agg.totalResponses),
      aiSoV: computeAISoV(agg.totalClientBrandMentions, agg.totalAllBrandMentions),
      avgVisibilityScore:
        agg.totalResponses > 0
          ? agg.totalVisibilityScore / agg.totalResponses
          : 0,
      // Epic 5 slice 4, definitions locked 2026-07-31: response-level rate
      // for trust support, citation-level share for ownership (mirrors how
      // AI SoV already relates to Mention Rate).
      trustedThirdPartySupportRate: computeMentionRate(agg.totalTrustedResponses, agg.totalResponses),
      clientOwnedCitationRate: computeAISoV(agg.totalClientOwnedCitations, agg.totalAllCitations),
      competitorOwnedCitationRate: computeAISoV(agg.totalCompetitorOwnedCitations, agg.totalAllCitations),
      totalResponses: agg.totalResponses,
      period: req.query.period ?? "30d",
      fromDate,
      toDate,
    });
  });

  // --- Platform breakdown (Epic 5 slice 1, issue #29) -----------------------

  function computeAggregateMetrics(agg: {
    totalCitations: number;
    totalMentions: number;
    totalAllBrandMentions: number;
    totalClientBrandMentions: number;
    totalVisibilityScore: number;
    totalResponses: number;
    totalAllCitations: number;
    totalClientOwnedCitations: number;
    totalCompetitorOwnedCitations: number;
    totalTrustedResponses: number;
  }) {
    return {
      mentionRate: computeMentionRate(agg.totalMentions, agg.totalResponses),
      citationFrequency: computeCitationFrequency(agg.totalCitations, agg.totalResponses),
      aiSoV: computeAISoV(agg.totalClientBrandMentions, agg.totalAllBrandMentions),
      avgVisibilityScore: agg.totalResponses > 0 ? agg.totalVisibilityScore / agg.totalResponses : 0,
      trustedThirdPartySupportRate: computeMentionRate(agg.totalTrustedResponses, agg.totalResponses),
      clientOwnedCitationRate: computeAISoV(agg.totalClientOwnedCitations, agg.totalAllCitations),
      competitorOwnedCitationRate: computeAISoV(agg.totalCompetitorOwnedCitations, agg.totalAllCitations),
    };
  }

  app.get("/api/clients/:id/metrics/by-platform", requireAuth, async (req, res) => {
    const clientId = Number(req.params.id);
    if (Number.isNaN(clientId))
      throw new AppError(400, "Invalid client id", "INVALID_ID");

    const period = typeof req.query.period === "string" ? req.query.period : "30d";
    const { fromDate, toDate } = periodToDates(period);
    const byPlatform = await metricStore.aggregateLiveForPeriodByPlatform(clientId, fromDate, toDate);

    const platformMetrics = byPlatform.map((p) => ({
      platformId: p.platformId,
      slug: p.slug,
      displayName: p.displayName,
      totalResponses: p.totalResponses,
      ...computeAggregateMetrics(p),
    }));

    // responseWeighted: pool every platform's raw counts back together —
    // must equal GET .../metrics/overview for the same client/period.
    const pooled = byPlatform.reduce(
      (acc, p) => ({
        totalCitations: acc.totalCitations + p.totalCitations,
        totalMentions: acc.totalMentions + p.totalMentions,
        totalAllBrandMentions: acc.totalAllBrandMentions + p.totalAllBrandMentions,
        totalClientBrandMentions: acc.totalClientBrandMentions + p.totalClientBrandMentions,
        totalVisibilityScore: acc.totalVisibilityScore + p.totalVisibilityScore,
        totalResponses: acc.totalResponses + p.totalResponses,
        totalAllCitations: acc.totalAllCitations + p.totalAllCitations,
        totalClientOwnedCitations: acc.totalClientOwnedCitations + p.totalClientOwnedCitations,
        totalCompetitorOwnedCitations: acc.totalCompetitorOwnedCitations + p.totalCompetitorOwnedCitations,
        totalTrustedResponses: acc.totalTrustedResponses + p.totalTrustedResponses,
      }),
      {
        totalCitations: 0,
        totalMentions: 0,
        totalAllBrandMentions: 0,
        totalClientBrandMentions: 0,
        totalVisibilityScore: 0,
        totalResponses: 0,
        totalAllCitations: 0,
        totalClientOwnedCitations: 0,
        totalCompetitorOwnedCitations: 0,
        totalTrustedResponses: 0,
      }
    );
    const responseWeighted = computeAggregateMetrics(pooled);

    // platformBalanced: unweighted mean of each platform's own rate — a
    // high-volume platform can't drown out a low-volume one.
    const platformBalanced =
      platformMetrics.length === 0
        ? {
            mentionRate: 0, citationFrequency: 0, aiSoV: 0, avgVisibilityScore: 0,
            trustedThirdPartySupportRate: 0, clientOwnedCitationRate: 0, competitorOwnedCitationRate: 0,
          }
        : {
            mentionRate: platformMetrics.reduce((s, p) => s + p.mentionRate, 0) / platformMetrics.length,
            citationFrequency:
              platformMetrics.reduce((s, p) => s + p.citationFrequency, 0) / platformMetrics.length,
            aiSoV: platformMetrics.reduce((s, p) => s + p.aiSoV, 0) / platformMetrics.length,
            avgVisibilityScore:
              platformMetrics.reduce((s, p) => s + p.avgVisibilityScore, 0) / platformMetrics.length,
            trustedThirdPartySupportRate:
              platformMetrics.reduce((s, p) => s + p.trustedThirdPartySupportRate, 0) / platformMetrics.length,
            clientOwnedCitationRate:
              platformMetrics.reduce((s, p) => s + p.clientOwnedCitationRate, 0) / platformMetrics.length,
            competitorOwnedCitationRate:
              platformMetrics.reduce((s, p) => s + p.competitorOwnedCitationRate, 0) / platformMetrics.length,
          };

    ok(res, {
      platforms: platformMetrics,
      combined: { platformBalanced, responseWeighted },
      defaultRollup: "platform_balanced",
      period,
      fromDate,
      toDate,
    });
  });

  // --- Trend ---------------------------------------------------------------

  app.get("/api/clients/:id/metrics/trend", requireAuth, async (req, res) => {
    const clientId = Number(req.params.id);
    if (Number.isNaN(clientId))
      throw new AppError(400, "Invalid client id", "INVALID_ID");

    const { fromDate, toDate } = periodToDates(
      typeof req.query.period === "string" ? req.query.period : "30d"
    );
    const metric =
      typeof req.query.metric === "string" ? req.query.metric : "mentionRate";

    const snapshots = await metricStore.listByClient(clientId, fromDate, toDate);

    const trend = snapshots.map((s) => {
      let value = 0;
      if (metric === "mentionRate")
        value = computeMentionRate(s.mentionCount, s.promptResponseCount);
      else if (metric === "citationFrequency")
        value = computeCitationFrequency(s.citationCount, s.promptResponseCount);
      else if (metric === "aiSoV")
        value = computeAISoV(s.clientBrandMentions, s.allBrandMentions);
      else if (metric === "avgVisibilityScore")
        value = s.promptResponseCount > 0 ? s.visibilityScoreSum / s.promptResponseCount : 0;
      return { date: s.dateIso, value: Math.round(value * 100) / 100 };
    });

    ok(res, trend);
  });

  // --- Share of Voice ------------------------------------------------------

  app.get("/api/clients/:id/metrics/sov", requireAuth, async (req, res) => {
    const clientId = Number(req.params.id);
    if (Number.isNaN(clientId))
      throw new AppError(400, "Invalid client id", "INVALID_ID");

    const { fromDate, toDate } = periodToDates(
      typeof req.query.period === "string" ? req.query.period : "30d"
    );
    // TD-24: live aggregate — see the overview endpoint note.
    const agg = await metricStore.aggregateLiveForPeriod(clientId, fromDate, toDate);

    ok(res, {
      aiSoV: computeAISoV(agg.totalClientBrandMentions, agg.totalAllBrandMentions),
      clientMentions: agg.totalClientBrandMentions,
      allBrandMentions: agg.totalAllBrandMentions,
      fromDate,
      toDate,
    });
  });

  // --- Token usage (issue #2 F1) --------------------------------------------
  // Spend data is internal ops: analyst roles and up only.

  app.get(
    "/api/clients/:id/metrics/token-usage",
    requireRole(...ANALYST_ROLES),
    async (req, res) => {
      const clientId = Number(req.params.id);
      if (Number.isNaN(clientId))
        throw new AppError(400, "Invalid client id", "INVALID_ID");

      const { fromDate, toDate } = periodToDates(
        typeof req.query.period === "string" ? req.query.period : "30d"
      );
      const agg = await responseStore.aggregateTokensByClient(clientId, fromDate, toDate);

      ok(res, {
        ...agg,
        period: req.query.period ?? "30d",
        fromDate,
        toDate,
      });
    }
  );

  // --- Non-branded panel metrics (YLG slice b) ------------------------------
  // Rates over responses to non-branded prompts only (brand_context =
  // 'unbranded', deterministically derived - issue #4 Phase 1 slice 5;
  // competitor-only prompts no longer count as non-branded). Recommendation
  // SoV counts effective (human-override-first) statuses at
  // recommended-and-up.

  app.get("/api/clients/:id/metrics/non-branded", requireAuth, async (req, res) => {
    const clientId = Number(req.params.id);
    if (Number.isNaN(clientId))
      throw new AppError(400, "Invalid client id", "INVALID_ID");

    const { fromDate, toDate } = periodToDates(
      typeof req.query.period === "string" ? req.query.period : "30d"
    );
    const agg = await metricStore.aggregateNonBranded(clientId, fromDate, toDate);

    ok(res, {
      nonBrandedResponses: agg.nonBrandedResponses,
      mentionRate: computeMentionRate(agg.mentionedNonBranded, agg.nonBrandedResponses),
      recommendationRate: computeRecommendationRate(
        agg.recommendedNonBranded,
        agg.nonBrandedResponses
      ),
      recommendationSoV: computeAISoV(agg.clientRecommended, agg.allBrandRecommended),
      strongRecommendationRate: computeRecommendationRate(
        agg.strongRecommendedNonBranded,
        agg.nonBrandedResponses
      ),
      firstChoiceRate: computeRecommendationRate(agg.firstChoiceNonBranded, agg.nonBrandedResponses),
      rankDistribution: computeRankDistribution(agg.clientRanks, agg.mentionedNonBranded),
      clientRecommended: agg.clientRecommended,
      allBrandRecommended: agg.allBrandRecommended,
      period: req.query.period ?? "30d",
      fromDate,
      toDate,
    });
  });

  // --- Non-branded panel metrics, by platform (Epic 5 slice 2, issue #29) --

  app.get(
    "/api/clients/:id/metrics/non-branded/by-platform",
    requireAuth,
    async (req, res) => {
      const clientId = Number(req.params.id);
      if (Number.isNaN(clientId))
        throw new AppError(400, "Invalid client id", "INVALID_ID");

      const period = typeof req.query.period === "string" ? req.query.period : "30d";
      const { fromDate, toDate } = periodToDates(period);
      const byPlatform = await metricStore.aggregateNonBrandedByPlatform(clientId, fromDate, toDate);

      const computeNonBrandedMetrics = (agg: {
        nonBrandedResponses: number;
        mentionedNonBranded: number;
        recommendedNonBranded: number;
        clientRecommended: number;
        allBrandRecommended: number;
        strongRecommendedNonBranded: number;
        firstChoiceNonBranded: number;
        clientRanks: number[];
      }) => ({
        mentionRate: computeMentionRate(agg.mentionedNonBranded, agg.nonBrandedResponses),
        recommendationRate: computeRecommendationRate(agg.recommendedNonBranded, agg.nonBrandedResponses),
        recommendationSoV: computeAISoV(agg.clientRecommended, agg.allBrandRecommended),
        strongRecommendationRate: computeRecommendationRate(
          agg.strongRecommendedNonBranded,
          agg.nonBrandedResponses
        ),
        firstChoiceRate: computeRecommendationRate(agg.firstChoiceNonBranded, agg.nonBrandedResponses),
        rankDistribution: computeRankDistribution(agg.clientRanks, agg.mentionedNonBranded),
      });

      const platformMetrics = byPlatform.map((p) => ({
        platformId: p.platformId,
        slug: p.slug,
        displayName: p.displayName,
        nonBrandedResponses: p.nonBrandedResponses,
        ...computeNonBrandedMetrics(p),
      }));

      // responseWeighted: pool every platform's raw counts back together —
      // must equal GET .../metrics/non-branded for the same client/period.
      const pooled = byPlatform.reduce(
        (acc, p) => ({
          nonBrandedResponses: acc.nonBrandedResponses + p.nonBrandedResponses,
          mentionedNonBranded: acc.mentionedNonBranded + p.mentionedNonBranded,
          recommendedNonBranded: acc.recommendedNonBranded + p.recommendedNonBranded,
          clientRecommended: acc.clientRecommended + p.clientRecommended,
          allBrandRecommended: acc.allBrandRecommended + p.allBrandRecommended,
          strongRecommendedNonBranded: acc.strongRecommendedNonBranded + p.strongRecommendedNonBranded,
          firstChoiceNonBranded: acc.firstChoiceNonBranded + p.firstChoiceNonBranded,
          clientRanks: [...acc.clientRanks, ...p.clientRanks],
        }),
        {
          nonBrandedResponses: 0,
          mentionedNonBranded: 0,
          recommendedNonBranded: 0,
          clientRecommended: 0,
          allBrandRecommended: 0,
          strongRecommendedNonBranded: 0,
          firstChoiceNonBranded: 0,
          clientRanks: [] as number[],
        }
      );
      const responseWeighted = computeNonBrandedMetrics(pooled);

      // platformBalanced: unweighted mean of each platform's own rate.
      // avgRank/medianRank average only over platforms that have ranked
      // data at all - a platform with no client mentions contributes no
      // opinion to "how does the client rank when listed."
      const meanOr = (values: (number | null)[]): number | null => {
        const defined = values.filter((v): v is number => v !== null);
        return defined.length > 0 ? defined.reduce((s, v) => s + v, 0) / defined.length : null;
      };
      const mean = (values: number[]): number =>
        values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;

      const platformBalanced =
        platformMetrics.length === 0
          ? {
              mentionRate: 0, recommendationRate: 0, recommendationSoV: 0,
              strongRecommendationRate: 0, firstChoiceRate: 0,
              rankDistribution: computeRankDistribution([], 0),
            }
          : {
              mentionRate: mean(platformMetrics.map((p) => p.mentionRate)),
              recommendationRate: mean(platformMetrics.map((p) => p.recommendationRate)),
              recommendationSoV: mean(platformMetrics.map((p) => p.recommendationSoV)),
              strongRecommendationRate: mean(platformMetrics.map((p) => p.strongRecommendationRate)),
              firstChoiceRate: mean(platformMetrics.map((p) => p.firstChoiceRate)),
              rankDistribution: {
                avgRank: meanOr(platformMetrics.map((p) => p.rankDistribution.avgRank)),
                medianRank: meanOr(platformMetrics.map((p) => p.rankDistribution.medianRank)),
                rank1Frequency: mean(platformMetrics.map((p) => p.rankDistribution.rank1Frequency)),
                top3Frequency: mean(platformMetrics.map((p) => p.rankDistribution.top3Frequency)),
                unrankedFrequency: mean(platformMetrics.map((p) => p.rankDistribution.unrankedFrequency)),
                mentionedCount: platformMetrics.reduce((s, p) => s + p.rankDistribution.mentionedCount, 0),
              },
            };

      ok(res, {
        platforms: platformMetrics,
        combined: { platformBalanced, responseWeighted },
        defaultRollup: "platform_balanced",
        period,
        fromDate,
        toDate,
      });
    }
  );

  // --- Mentions list -------------------------------------------------------

  app.get("/api/clients/:id/mentions", requireAuth, async (req, res) => {
    const clientId = Number(req.params.id);
    if (Number.isNaN(clientId))
      throw new AppError(400, "Invalid client id", "INVALID_ID");

    const limit = parsePageParam(req.query.limit, "limit");
    const offset = parsePageParam(req.query.offset, "offset");

    const [mentions, total] = await Promise.all([
      mentionStore.listByClient(clientId, { limit, offset }),
      mentionStore.countByClient(clientId),
    ]);
    ok(res, { mentions, total });
  });

  // --- On-demand re-parse --------------------------------------------------

  app.post(
    "/api/responses/:id/parse",
    requireRole(...ANALYST_ROLES),
    async (req, res) => {
      const responseId = Number(req.params.id);
      if (Number.isNaN(responseId))
        throw new AppError(400, "Invalid id", "INVALID_ID");

      const response = await responseStore.get(responseId);
      if (!response)
        throw new AppError(404, "Response not found", "RESPONSE_NOT_FOUND");

      jobRunner.enqueue("parse-response", { responseId });
      res.status(202).json({ data: { queued: true, responseId } });
    }
  );

  // --- Scoring config ------------------------------------------------------

  app.get(
    "/api/clients/:id/scoring-config",
    requireRole("super_admin"),
    (_req, res) => {
      ok(res, DEFAULT_WEIGHTS);
    }
  );

  app.patch(
    "/api/clients/:id/scoring-config",
    requireRole("super_admin"),
    (_req, res) => {
      // Sprint 5+ will persist per-client weights. For MVP, return the defaults.
      ok(res, DEFAULT_WEIGHTS);
    }
  );
}
