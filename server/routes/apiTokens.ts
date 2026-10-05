/*
 * Module/Script Name: apiTokens.ts
 * Path: server/routes/apiTokens.ts
 *
 * Description:
 * Admin endpoints to create, list and revoke machine API tokens for a
 * client. The raw token is returned once, at creation; only its hash is
 * stored and list responses never include it.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-10-05
 * Last Modified Date: 2026-10-05
 * Comments:
 * - v1.00 Initial implementation (Reporting Suite API access)
 */

import type { Express } from "express";
import { apiTokenStore, clientStore } from "../storage";
import { createApiTokenSchema } from "@shared/schema";
import type { ApiToken } from "@shared/schema";
import { requireRole } from "../auth";
import { created, noContent, ok } from "../response";
import { AppError } from "../errors";
import { createApiToken } from "../services/apiToken";

const ADMIN_ROLES = ["super_admin", "agency_admin"] as const;

function parseId(raw: string | string[], label: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new AppError(400, `Invalid ${label}`, "INVALID_ID");
  return n;
}

function toPublic(t: ApiToken) {
  return {
    id: t.id,
    clientId: t.clientId,
    name: t.name,
    tokenPrefix: t.tokenPrefix,
    expiresAt: t.expiresAt,
    lastUsedAt: t.lastUsedAt,
    revokedAt: t.revokedAt,
    createdAt: t.createdAt,
  };
}

export function registerApiTokenRoutes(app: Express): void {
  app.post("/api/clients/:id/api-tokens", requireRole(...ADMIN_ROLES), async (req, res) => {
    const clientId = parseId(req.params.id, "client id");
    const parsed = createApiTokenSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, "Validation failed", "VALIDATION_ERROR");
    if (!(await clientStore.get(clientId)))
      throw new AppError(404, "Client not found", "CLIENT_NOT_FOUND");

    const { rawToken, tokenHash, tokenPrefix, expiresAt } = createApiToken({
      ttlDays: parsed.data.ttlDays,
    });
    const record = await apiTokenStore.create({
      clientId,
      name: parsed.data.name,
      tokenHash,
      tokenPrefix,
      expiresAt,
      createdByUserId: req.session.user!.id,
    });

    created(res, { ...toPublic(record), token: rawToken });
  });

  app.get("/api/clients/:id/api-tokens", requireRole(...ADMIN_ROLES), async (req, res) => {
    const clientId = parseId(req.params.id, "client id");
    const tokens = await apiTokenStore.listByClient(clientId);
    ok(res, tokens.map(toPublic));
  });

  app.delete(
    "/api/clients/:id/api-tokens/:tokenId",
    requireRole(...ADMIN_ROLES),
    async (req, res) => {
      const clientId = parseId(req.params.id, "client id");
      const tokenId = parseId(req.params.tokenId, "token id");
      if (!(await apiTokenStore.revoke(tokenId, clientId)))
        throw new AppError(404, "API token not found", "API_TOKEN_NOT_FOUND");
      noContent(res);
    }
  );
}
