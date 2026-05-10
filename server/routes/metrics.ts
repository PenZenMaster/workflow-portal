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
 * Last Modified Date: 2026-05-10
 * Comments:
 * - v1.00 Sprint 4 initial implementation
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
  DEFAULT_WEIGHTS,
} from "../services/scoring";

const ANALYST_ROLES = ["super_admin", "agency_admin", "analyst"] as const;

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
    const agg = await metricStore.aggregateForPeriod(clientId, fromDate, toDate);

    ok(res, {
      citationFrequency: computeCitationFrequency(agg.totalCitations, agg.totalResponses),
      mentionRate: computeMentionRate(agg.totalMentions, agg.totalResponses),
      aiSoV: computeAISoV(agg.totalMentions, agg.totalAllBrandMentions),
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
        value = computeAISoV(s.mentionCount, s.allBrandMentions);
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
    const agg = await metricStore.aggregateForPeriod(clientId, fromDate, toDate);

    ok(res, {
      aiSoV: computeAISoV(agg.totalMentions, agg.totalAllBrandMentions),
      clientMentions: agg.totalMentions,
      allBrandMentions: agg.totalAllBrandMentions,
      fromDate,
      toDate,
    });
  });

  // --- Mentions list -------------------------------------------------------

  app.get("/api/clients/:id/mentions", requireAuth, async (req, res) => {
    const clientId = Number(req.params.id);
    if (Number.isNaN(clientId))
      throw new AppError(400, "Invalid client id", "INVALID_ID");

    const mentions = await mentionStore.listByClient(clientId);
    ok(res, mentions);
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
