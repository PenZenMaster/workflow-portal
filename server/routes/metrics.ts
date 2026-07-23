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
      totalResponses: agg.totalResponses,
      period: req.query.period ?? "30d",
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
      clientRecommended: agg.clientRecommended,
      allBrandRecommended: agg.allBrandRecommended,
      period: req.query.period ?? "30d",
      fromDate,
      toDate,
    });
  });

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
