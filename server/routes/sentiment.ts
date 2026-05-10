/*
 * Module/Script Name: sentiment.ts
 * Path: server/routes/sentiment.ts
 *
 * Description:
 * REST API routes for the AI Visibility sentiment domain: summary by
 * label, analyst review queue, manual override, and annotation CRUD.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-10
 * Last Modified Date: 2026-05-10
 * Comments:
 * - v1.00 Sprint 5 initial implementation
 */

import type { Express } from "express";
import { sentimentStore, annotationStore } from "../storage";
import { sentimentOverrideSchema, insertAnnotationSchema } from "@shared/schema";
import { requireAuth, requireRole } from "../auth";
import { ok, created, noContent } from "../response";
import { AppError } from "../errors";

const ANALYST_ROLES = ["super_admin", "agency_admin", "analyst"] as const;

export function registerSentimentRoutes(app: Express): void {
  // --- Sentiment summary ---------------------------------------------------

  app.get("/api/clients/:id/sentiment/summary", requireAuth, async (req, res) => {
    const clientId = Number(req.params.id);
    if (Number.isNaN(clientId))
      throw new AppError(400, "Invalid client id", "INVALID_ID");

    const all = await sentimentStore.listByClient(clientId);
    const summary: Record<string, number> = {
      positive: 0, neutral: 0, negative: 0, mixed: 0,
    };
    for (const s of all) {
      const key = s.overrideLabel ?? s.label;
      summary[key] = (summary[key] ?? 0) + 1;
    }
    ok(res, summary);
  });

  // --- Review queue --------------------------------------------------------

  app.get(
    "/api/clients/:id/sentiment/review-queue",
    requireRole(...ANALYST_ROLES),
    async (req, res) => {
      const clientId = Number(req.params.id);
      if (Number.isNaN(clientId))
        throw new AppError(400, "Invalid client id", "INVALID_ID");
      const queue = await sentimentStore.getReviewQueue(clientId);
      ok(res, queue);
    }
  );

  // --- Override ------------------------------------------------------------

  app.patch(
    "/api/sentiment/:id",
    requireRole(...ANALYST_ROLES),
    async (req, res) => {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");
      const parsed = sentimentOverrideSchema.safeParse(req.body);
      if (!parsed.success)
        throw new AppError(400, "Validation failed", "VALIDATION_ERROR");
      const updated = await sentimentStore.override(
        id,
        parsed.data.label,
        req.session.user!.id
      );
      if (!updated)
        throw new AppError(404, "Sentiment record not found", "SENTIMENT_NOT_FOUND");
      ok(res, updated);
    }
  );

  // --- Annotations ---------------------------------------------------------

  app.get("/api/annotations", requireAuth, async (req, res) => {
    const scopeKind = req.query.scopeKind as string;
    const scopeId = Number(req.query.scopeId);
    if (!scopeKind || Number.isNaN(scopeId))
      throw new AppError(400, "scopeKind and scopeId are required", "INVALID_PARAMS");
    const list = await annotationStore.listByScope(
      scopeKind as Parameters<typeof annotationStore.listByScope>[0],
      scopeId
    );
    ok(res, list);
  });

  app.post(
    "/api/annotations",
    requireRole(...ANALYST_ROLES),
    async (req, res) => {
      const parsed = insertAnnotationSchema.safeParse(req.body);
      if (!parsed.success)
        throw new AppError(400, "Validation failed", "VALIDATION_ERROR");
      const annotation = await annotationStore.create({
        ...parsed.data,
        authorUserId: req.session.user!.id,
      });
      created(res, annotation);
    }
  );

  app.delete(
    "/api/annotations/:id",
    requireRole(...ANALYST_ROLES),
    async (req, res) => {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");
      const deleted = await annotationStore.delete(id);
      if (!deleted)
        throw new AppError(404, "Annotation not found", "ANNOTATION_NOT_FOUND");
      noContent(res);
    }
  );
}
