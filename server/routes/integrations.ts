/*
 * Module/Script Name: integrations.ts
 * Path: server/routes/integrations.ts
 *
 * Description:
 * REST API routes for the integrations domain: GA4, GSC, and future CRM
 * connectors. Includes CRUD, a connectivity test endpoint, and the AI
 * traffic view that aggregates data from a client's GA4 integration.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-10
 * Last Modified Date: 2026-05-10
 * Comments:
 * - v1.00 Sprint 7 initial implementation
 */

import type { Express } from "express";
import { integrationStore } from "../storage";
import { insertIntegrationSchema } from "@shared/schema";
import { requireAuth, requireRole } from "../auth";
import { ok, created, noContent } from "../response";
import { AppError } from "../errors";
import { Ga4Service } from "../services/ga4";
import { logger } from "../logger";

const ADMIN_ROLES = ["super_admin", "agency_admin"] as const;

function periodToDates(period: string): { fromDate: string; toDate: string } {
  const toDate = new Date().toISOString().slice(0, 10);
  const days = period === "90d" ? 90 : period === "365d" ? 365 : 30;
  const from = new Date();
  from.setDate(from.getDate() - days);
  return { fromDate: from.toISOString().slice(0, 10), toDate };
}

export function registerIntegrationRoutes(app: Express): void {
  // --- CRUD ----------------------------------------------------------------

  app.get("/api/clients/:id/integrations", requireAuth, async (req, res) => {
    const clientId = Number(req.params.id);
    if (Number.isNaN(clientId))
      throw new AppError(400, "Invalid client id", "INVALID_ID");
    const list = await integrationStore.listByClient(clientId);
    ok(res, list);
  });

  app.post(
    "/api/clients/:id/integrations",
    requireRole(...ADMIN_ROLES),
    async (req, res) => {
      const clientId = Number(req.params.id);
      if (Number.isNaN(clientId))
        throw new AppError(400, "Invalid client id", "INVALID_ID");
      const parsed = insertIntegrationSchema.safeParse(req.body);
      if (!parsed.success)
        throw new AppError(400, "Validation failed", "VALIDATION_ERROR");
      const integration = await integrationStore.create(clientId, parsed.data);
      created(res, integration);
    }
  );

  app.delete(
    "/api/clients/:id/integrations/:integrationId",
    requireRole(...ADMIN_ROLES),
    async (req, res) => {
      const id = Number(req.params.integrationId);
      if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");
      const deleted = await integrationStore.delete(id);
      if (!deleted)
        throw new AppError(404, "Integration not found", "INTEGRATION_NOT_FOUND");
      noContent(res);
    }
  );

  // --- Connectivity test ---------------------------------------------------

  app.post(
    "/api/clients/:id/integrations/:integrationId/test",
    requireRole(...ADMIN_ROLES),
    async (req, res) => {
      const id = Number(req.params.integrationId);
      if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");
      const integration = await integrationStore.get(id);
      if (!integration)
        throw new AppError(404, "Integration not found", "INTEGRATION_NOT_FOUND");

      let testOk = false;
      let errorMsg: string | null = null;

      if (integration.kind === "ga4") {
        try {
          const ga4 = new Ga4Service();
          const today = new Date().toISOString().slice(0, 10);
          await ga4.getAiTraffic(integration.config, today, today);
          testOk = true;
          await integrationStore.updateStatus(integration.id, "active", {
            lastSyncedAt: Date.now(),
            lastError: null,
          });
        } catch (err) {
          errorMsg = err instanceof Error ? err.message : String(err);
          await integrationStore.updateStatus(integration.id, "failing", {
            lastError: errorMsg,
          });
          logger.warn("integration test failed", { integrationId: id, error: errorMsg });
        }
      } else {
        testOk = true; // other kinds: stub as passing for MVP
      }

      ok(res, { ok: testOk, error: errorMsg });
    }
  );

  // --- AI traffic view -----------------------------------------------------

  app.get("/api/clients/:id/traffic", requireAuth, async (req, res) => {
    const clientId = Number(req.params.id);
    if (Number.isNaN(clientId))
      throw new AppError(400, "Invalid client id", "INVALID_ID");

    const { fromDate, toDate } = periodToDates(
      typeof req.query.period === "string" ? req.query.period : "30d"
    );

    const allIntegrations = await integrationStore.listByClient(clientId);
    const ga4Integration = allIntegrations.find(
      (i) => i.kind === "ga4" && i.status === "active"
    );

    if (!ga4Integration) {
      ok(res, {
        noIntegration: true,
        sessions: 0,
        engagementRate: 0,
        pagesPerSession: 0,
        conversionRate: 0,
        referrers: [],
        fromDate,
        toDate,
      });
      return;
    }

    try {
      const ga4 = new Ga4Service();
      const traffic = await ga4.getAiTraffic(ga4Integration.config, fromDate, toDate);
      ok(res, { noIntegration: false, ...traffic });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await integrationStore.updateStatus(ga4Integration.id, "failing", { lastError: msg });
      ok(res, {
        noIntegration: false,
        error: msg,
        sessions: 0,
        engagementRate: 0,
        pagesPerSession: 0,
        conversionRate: 0,
        referrers: [],
        fromDate,
        toDate,
      });
    }
  });
}
