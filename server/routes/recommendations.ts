/*
 * Module/Script Name: recommendations.ts
 * Path: server/routes/recommendations.ts
 *
 * Description:
 * REST API routes for recommendation classifications (YLG defensibility
 * slice d): per-response listing enriched with brand names, and the
 * analyst human-status override. The machine classification is always
 * retained; the override drives reporting (FR-11).
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-15
 * Last Modified Date: 2026-07-15
 * Comments:
 * - v1.00 slice d initial implementation
 */

import type { Express } from "express";
import {
  recommendationStore,
  responseStore,
  runStore,
  brandStore,
} from "../storage";
import { recommendationOverrideSchema } from "@shared/schema";
import { requireAuth, requireRole } from "../auth";
import { ok } from "../response";
import { AppError } from "../errors";

const ANALYST_ROLES = ["super_admin", "agency_admin", "analyst"] as const;

export function registerRecommendationRoutes(app: Express): void {
  // --- Per-response classifications -----------------------------------------

  app.get("/api/responses/:id/recommendations", requireAuth, async (req, res) => {
    const responseId = Number(req.params.id);
    if (Number.isNaN(responseId))
      throw new AppError(400, "Invalid response id", "INVALID_ID");

    const response = await responseStore.get(responseId);
    if (!response)
      throw new AppError(404, "Response not found", "RESPONSE_NOT_FOUND");

    const [recommendations, run] = await Promise.all([
      recommendationStore.listByResponse(responseId),
      runStore.get(response.runId),
    ]);
    const brands = run ? await brandStore.listByClient(run.clientId) : [];
    const nameById = new Map(brands.map((b) => [b.id, b.canonicalName]));

    ok(
      res,
      recommendations.map((r) => ({
        ...r,
        brandName: nameById.get(r.brandId) ?? `Brand #${r.brandId}`,
      }))
    );
  });

  // --- Human override --------------------------------------------------------

  app.patch(
    "/api/response-recommendations/:id",
    requireRole(...ANALYST_ROLES),
    async (req, res) => {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");

      const parsed = recommendationOverrideSchema.safeParse(req.body);
      if (!parsed.success)
        throw new AppError(400, "Validation failed", "VALIDATION_ERROR");

      const updated = await recommendationStore.setHumanStatus(
        id,
        parsed.data.status,
        req.session.user!.id
      );
      if (!updated)
        throw new AppError(404, "Recommendation not found", "RECOMMENDATION_NOT_FOUND");
      ok(res, updated);
    }
  );
}
