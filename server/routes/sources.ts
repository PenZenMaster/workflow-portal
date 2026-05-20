/*
 * Module/Script Name: sources.ts
 * Path: server/routes/sources.ts
 *
 * Description:
 * REST API routes for the AI Visibility sources domain: citation domain
 * analysis, rule-based recommendations, and signed share-link management
 * (create, revoke, and the unauthenticated public token endpoint).
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-10
 * Last Modified Date: 2026-05-10
 * Comments:
 * - v1.00 Sprint 6 initial implementation
 */

import type { Express } from "express";
import {
  citationStore,
  mentionStore,
  sentimentStore,
  shareTokenStore,
  exportStore,
} from "../storage";
import { createShareLinkSchema } from "@shared/schema";
import { requireAuth, requireRole } from "../auth";
import { ok, created, noContent } from "../response";
import { AppError } from "../errors";
import { analyzeSources } from "../services/sources";
import { generateRecommendations } from "../services/recommendations";
import { createShareToken, hashToken, isTokenExpired, isTokenRevoked } from "../services/shareLink";

const ADMIN_ROLES = ["super_admin", "agency_admin"] as const;

export function registerSourceRoutes(app: Express): void {
  // --- Sources (citation domain analysis) ----------------------------------

  app.get("/api/clients/:id/sources", requireAuth, async (req, res) => {
    const clientId = Number(req.params.id);
    if (Number.isNaN(clientId))
      throw new AppError(400, "Invalid client id", "INVALID_ID");

    const citations = await citationStore.listByClient(clientId);
    const analysis = analyzeSources(citations, clientId);
    ok(res, analysis);
  });

  // --- Recommendations -----------------------------------------------------

  app.get("/api/clients/:id/recommendations", requireAuth, async (req, res) => {
    const clientId = Number(req.params.id);
    if (Number.isNaN(clientId))
      throw new AppError(400, "Invalid client id", "INVALID_ID");

    const [mentions, citations, sentiments] = await Promise.all([
      mentionStore.listByClient(clientId),
      citationStore.listByClient(clientId),
      sentimentStore.listByClient(clientId),
    ]);

    const recs = generateRecommendations({
      mentions,
      citations,
      sentiments,
      clientBrandId: clientId,
      totalResponses: new Set(mentions.map((m) => m.responseId)).size,
    });

    ok(res, recs);
  });

  // --- Share links ---------------------------------------------------------

  app.post(
    "/api/clients/:id/share-links",
    requireRole(...ADMIN_ROLES),
    async (req, res) => {
      const parsed = createShareLinkSchema.safeParse(req.body);
      if (!parsed.success)
        throw new AppError(400, "Validation failed", "VALIDATION_ERROR");

      const { rawToken, tokenHash, expiresAt } = createShareToken({
        ttlDays: parsed.data.ttlDays ?? 30,
      });

      const record = await shareTokenStore.create({
        kind: parsed.data.kind,
        resourceId: parsed.data.resourceId,
        tokenHash,
        expiresAt,
        createdByUserId: req.session.user!.id,
      });

      created(res, { id: record.id, shareToken: rawToken, expiresAt });
    }
  );

  app.delete(
    "/api/share-links/:id",
    requireRole(...ADMIN_ROLES),
    async (req, res) => {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");
      const revoked = await shareTokenStore.revoke(id);
      if (!revoked)
        throw new AppError(404, "Share link not found", "SHARE_TOKEN_NOT_FOUND");
      noContent(res);
    }
  );

  // --- Public token endpoint (no auth) -------------------------------------

  app.get("/api/share/:token/data", async (req, res) => {
    const rawToken = req.params.token;
    const tokenHash = hashToken(rawToken);

    const record = await shareTokenStore.findByHash(tokenHash);
    if (!record) throw new AppError(404, "Share link not found", "SHARE_TOKEN_NOT_FOUND");

    if (isTokenRevoked(record.revokedAt) || isTokenExpired(record.expiresAt)) {
      throw new AppError(410, "Share link has expired or been revoked", "SHARE_TOKEN_EXPIRED");
    }

    // Build a PII-free public payload depending on the resource kind.
    let payload: Record<string, unknown>;

    if (record.kind === "export") {
      const exportRecord = await exportStore.get(record.resourceId);
      if (!exportRecord)
        throw new AppError(404, "Resource not found", "RESOURCE_NOT_FOUND");
      payload = {
        kind: exportRecord.kind,
        periodStart: exportRecord.periodStart,
        periodEnd: exportRecord.periodEnd,
        status: exportRecord.status,
        // Deliberately omit filePath, requestedByUserId, lastError
      };
    } else {
      payload = { kind: record.kind, resourceId: record.resourceId };
    }

    ok(res, payload);
  });
}
