/*
 * Module/Script Name: clients.ts
 * Path: server/routes/clients.ts
 *
 * Description:
 * REST API routes for the AI Visibility client-management domain:
 * clients, brands, brand aliases, competitors, and client-user access grants.
 * All responses use the { data } envelope from server/response.ts.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-09
 * Last Modified Date: 2026-05-09
 * Comments:
 * - v1.00 Sprint 1 initial implementation
 */

import type { Express } from "express";
import {
  clientStore,
  brandStore,
  aliasStore,
  competitorStore,
  clientUserStore,
} from "../storage";
import {
  insertClientSchema,
  insertBrandSchema,
  insertBrandAliasSchema,
  insertCompetitorSchema,
  grantClientUserSchema,
} from "@shared/schema";
import { requireAuth, requireRole } from "../auth";
import { ok, created, noContent } from "../response";
import { AppError } from "../errors";

const ADMIN_ROLES = ["super_admin", "agency_admin"] as const;
const EDITOR_ROLES = ["super_admin", "agency_admin", "analyst"] as const;

export function registerClientRoutes(app: Express): void {
  // --- Clients -----------------------------------------------------------

  app.get("/api/clients", requireAuth, async (_req, res) => {
    const data = await clientStore.list();
    ok(res, data);
  });

  app.post(
    "/api/clients",
    requireRole(...ADMIN_ROLES),
    async (req, res) => {
      const parsed = insertClientSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "Validation failed", "VALIDATION_ERROR");
      }
      const client = await clientStore.create(parsed.data);
      created(res, client);
    }
  );

  app.get("/api/clients/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");
    const client = await clientStore.get(id);
    if (!client) throw new AppError(404, "Client not found", "CLIENT_NOT_FOUND");
    ok(res, client);
  });

  app.patch(
    "/api/clients/:id",
    requireRole(...ADMIN_ROLES),
    async (req, res) => {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");
      const parsed = insertClientSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "Validation failed", "VALIDATION_ERROR");
      }
      const client = await clientStore.update(id, parsed.data);
      if (!client) throw new AppError(404, "Client not found", "CLIENT_NOT_FOUND");
      ok(res, client);
    }
  );

  app.delete(
    "/api/clients/:id",
    requireRole(...ADMIN_ROLES),
    async (req, res) => {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");
      const deleted = await clientStore.delete(id);
      if (!deleted) throw new AppError(404, "Client not found", "CLIENT_NOT_FOUND");
      noContent(res);
    }
  );

  // --- Brands ------------------------------------------------------------

  app.get("/api/clients/:id/brands", requireAuth, async (req, res) => {
    const clientId = Number(req.params.id);
    if (Number.isNaN(clientId))
      throw new AppError(400, "Invalid client id", "INVALID_ID");
    const data = await brandStore.listByClient(clientId);
    ok(res, data);
  });

  app.post(
    "/api/clients/:id/brands",
    requireRole(...EDITOR_ROLES),
    async (req, res) => {
      const clientId = Number(req.params.id);
      if (Number.isNaN(clientId))
        throw new AppError(400, "Invalid client id", "INVALID_ID");
      const parsed = insertBrandSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "Validation failed", "VALIDATION_ERROR");
      }
      const brand = await brandStore.create(clientId, parsed.data);
      created(res, brand);
    }
  );

  app.patch(
    "/api/brands/:id",
    requireRole(...EDITOR_ROLES),
    async (req, res) => {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");
      const parsed = insertBrandSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "Validation failed", "VALIDATION_ERROR");
      }
      const brand = await brandStore.update(id, parsed.data);
      if (!brand) throw new AppError(404, "Brand not found", "BRAND_NOT_FOUND");
      ok(res, brand);
    }
  );

  app.delete(
    "/api/brands/:id",
    requireRole(...ADMIN_ROLES),
    async (req, res) => {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");
      const deleted = await brandStore.delete(id);
      if (!deleted) throw new AppError(404, "Brand not found", "BRAND_NOT_FOUND");
      noContent(res);
    }
  );

  // --- Brand Aliases -----------------------------------------------------

  app.post(
    "/api/brands/:id/aliases",
    requireRole(...EDITOR_ROLES),
    async (req, res) => {
      const brandId = Number(req.params.id);
      if (Number.isNaN(brandId))
        throw new AppError(400, "Invalid brand id", "INVALID_ID");
      const parsed = insertBrandAliasSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "Validation failed", "VALIDATION_ERROR");
      }
      const alias = await aliasStore.create(brandId, parsed.data);
      created(res, alias);
    }
  );

  app.delete(
    "/api/brand-aliases/:id",
    requireRole(...EDITOR_ROLES),
    async (req, res) => {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");
      const deleted = await aliasStore.delete(id);
      if (!deleted) throw new AppError(404, "Alias not found", "ALIAS_NOT_FOUND");
      noContent(res);
    }
  );

  // --- Competitors -------------------------------------------------------

  app.get("/api/clients/:id/competitors", requireAuth, async (req, res) => {
    const clientId = Number(req.params.id);
    if (Number.isNaN(clientId))
      throw new AppError(400, "Invalid client id", "INVALID_ID");
    const data = await competitorStore.listByClient(clientId);
    ok(res, data);
  });

  // Creates a competitor brand + competitor entry in one step.
  app.post(
    "/api/clients/:id/competitors",
    requireRole(...EDITOR_ROLES),
    async (req, res) => {
      const clientId = Number(req.params.id);
      if (Number.isNaN(clientId))
        throw new AppError(400, "Invalid client id", "INVALID_ID");
      const parsed = insertCompetitorSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "Validation failed", "VALIDATION_ERROR");
      }
      const brand = await brandStore.create(clientId, {
        canonicalName: parsed.data.canonicalName,
        kind: "competitor",
        primaryDomain: parsed.data.primaryDomain,
      });
      const competitor = await competitorStore.create(
        clientId,
        brand.id,
        parsed.data.priority ?? 0
      );
      created(res, { competitor, brand });
    }
  );

  app.delete(
    "/api/clients/:id/competitors/:competitorId",
    requireRole(...ADMIN_ROLES),
    async (req, res) => {
      const id = Number(req.params.competitorId);
      if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");
      const deleted = await competitorStore.delete(id);
      if (!deleted)
        throw new AppError(404, "Competitor not found", "COMPETITOR_NOT_FOUND");
      noContent(res);
    }
  );

  // --- Client User Access -----------------------------------------------

  app.get(
    "/api/clients/:id/users",
    requireRole(...ADMIN_ROLES),
    async (req, res) => {
      const clientId = Number(req.params.id);
      if (Number.isNaN(clientId))
        throw new AppError(400, "Invalid client id", "INVALID_ID");
      const data = await clientUserStore.listByClient(clientId);
      ok(res, data);
    }
  );

  app.post(
    "/api/clients/:id/users",
    requireRole(...ADMIN_ROLES),
    async (req, res) => {
      const clientId = Number(req.params.id);
      if (Number.isNaN(clientId))
        throw new AppError(400, "Invalid client id", "INVALID_ID");
      const parsed = grantClientUserSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "Validation failed", "VALIDATION_ERROR");
      }
      await clientUserStore.grant(
        clientId,
        parsed.data.userId,
        parsed.data.roleOverride
      );
      created(res, { ok: true });
    }
  );

  app.delete(
    "/api/clients/:id/users/:userId",
    requireRole(...ADMIN_ROLES),
    async (req, res) => {
      const clientId = Number(req.params.id);
      const userId = Number(req.params.userId);
      if (Number.isNaN(clientId) || Number.isNaN(userId))
        throw new AppError(400, "Invalid id", "INVALID_ID");
      const revoked = await clientUserStore.revoke(clientId, userId);
      if (!revoked)
        throw new AppError(404, "User access not found", "CLIENT_USER_NOT_FOUND");
      noContent(res);
    }
  );
}
