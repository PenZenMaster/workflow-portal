/*
 * Module/Script Name: integrations.ts
 * Path: server/routes/integrations.ts
 *
 * Description:
 * REST API routes for the integrations domain. GA4 uses OAuth 2.0 —
 * no service accounts required. Clients connect a normal Google account
 * that has been granted Viewer access to their GA4 property.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-10
 * Last Modified Date: 2026-05-10
 * Comments:
 * - v1.00 Sprint 7 initial implementation
 * - v2.00 Refactored to OAuth 2.0
 */

import type { Express } from "express";
import { z } from "zod";
import { integrationStore } from "../storage";
import { requireAuth, requireRole } from "../auth";
import { ok, noContent } from "../response";
import { AppError } from "../errors";
import { Ga4Service, buildAuthUrl, buildOAuthState, listAccountProperties } from "../services/ga4";
import { logger } from "../logger";

const ADMIN_ROLES = ["super_admin", "agency_admin"] as const;

const updatePropertySchema = z.object({
  propertyId: z.string().min(1, "Property ID is required"),
});

function periodToDates(period: string): { fromDate: string; toDate: string } {
  const toDate = new Date().toISOString().slice(0, 10);
  const days = period === "90d" ? 90 : period === "365d" ? 365 : 30;
  const from = new Date();
  from.setDate(from.getDate() - days);
  return { fromDate: from.toISOString().slice(0, 10), toDate };
}

export function registerIntegrationRoutes(app: Express): void {
  // --- List integrations ---------------------------------------------------

  app.get("/api/clients/:id/integrations", requireAuth, async (req, res) => {
    const clientId = Number(req.params.id);
    if (Number.isNaN(clientId))
      throw new AppError(400, "Invalid client id", "INVALID_ID");
    const list = await integrationStore.listByClient(clientId);
    ok(res, list);
  });

  // --- Initiate GA4 OAuth --------------------------------------------------
  // Redirects the browser to Google's consent screen.
  // This is a full-page redirect, not an XHR call.

  app.get(
    "/api/clients/:id/integrations/ga4/auth",
    requireRole(...ADMIN_ROLES),
    (req, res) => {
      const clientId = Number(req.params.id);
      if (Number.isNaN(clientId))
        throw new AppError(400, "Invalid client id", "INVALID_ID");

      const clientId_ = process.env.GOOGLE_CLIENT_ID;
      const clientSecret_ = process.env.GOOGLE_CLIENT_SECRET;
      const redirectUri_ = process.env.GOOGLE_REDIRECT_URI;

      if (!clientId_ || !clientSecret_ || !redirectUri_) {
        throw new AppError(
          503,
          "Google OAuth is not configured. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI to your environment variables.",
          "OAUTH_NOT_CONFIGURED"
        );
      }

      const state = buildOAuthState(clientId, req.session.user!.id);
      const authUrl = buildAuthUrl(state);
      res.redirect(authUrl);
    }
  );

  // --- Delete integration --------------------------------------------------

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

  // --- Update GA4 property ID ---------------------------------------------
  // Called after OAuth connection to set/change the target GA4 property.

  app.patch(
    "/api/integrations/:id/property",
    requireRole(...ADMIN_ROLES),
    async (req, res) => {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");

      const parsed = updatePropertySchema.safeParse(req.body);
      if (!parsed.success)
        throw new AppError(400, "Validation failed", "VALIDATION_ERROR");

      const integration = await integrationStore.get(id);
      if (!integration)
        throw new AppError(404, "Integration not found", "INTEGRATION_NOT_FOUND");

      const updatedConfig = {
        ...(integration.config as Record<string, unknown>),
        propertyId: parsed.data.propertyId,
      };
      await integrationStore.updateConfig(id, updatedConfig);
      await integrationStore.updateStatus(id, "active");

      ok(res, { ok: true, propertyId: parsed.data.propertyId });
    }
  );

  // --- List GA4 properties accessible to the connected account ------------

  app.get(
    "/api/clients/:id/integrations/:integrationId/ga4/properties",
    requireRole(...ADMIN_ROLES),
    async (req, res) => {
      const id = Number(req.params.integrationId);
      if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");

      const integration = await integrationStore.get(id);
      if (!integration)
        throw new AppError(404, "Integration not found", "INTEGRATION_NOT_FOUND");
      if (integration.kind !== "ga4")
        throw new AppError(400, "Integration is not a GA4 integration", "NOT_GA4");

      try {
        const config = integration.config as Record<string, unknown>;
        const properties = await listAccountProperties(config, async (updated) => {
          await integrationStore.updateConfig(id, updated);
        });
        ok(res, { properties });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn("ga4 properties list failed", { integrationId: id, error: msg });
        ok(res, { properties: [], error: msg });
      }
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
          const today = new Date().toISOString().slice(0, 10);
          const ga4 = new Ga4Service();
          const config = integration.config as Record<string, unknown>;
          await ga4.getAiTraffic(config, today, today, async (updated) => {
            await integrationStore.updateConfig(id, updated);
          });
          testOk = true;
          await integrationStore.updateStatus(id, "active", {
            lastSyncedAt: Date.now(),
            lastError: null,
          });
        } catch (err) {
          errorMsg = err instanceof Error ? err.message : String(err);
          await integrationStore.updateStatus(id, "failing", { lastError: errorMsg });
          logger.warn("integration test failed", { integrationId: id, error: errorMsg });
        }
      } else {
        testOk = true;
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
      const config = ga4Integration.config as Record<string, unknown>;
      const traffic = await ga4.getAiTraffic(config, fromDate, toDate, async (updated) => {
        await integrationStore.updateConfig(ga4Integration.id, updated);
      });
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

  // --- Monthly AI traffic (stacked bar chart data) -------------------------

  app.get("/api/clients/:id/traffic/monthly", requireAuth, async (req, res) => {
    const clientId = Number(req.params.id);
    if (Number.isNaN(clientId)) throw new AppError(400, "Invalid client id", "INVALID_ID");

    const period = typeof req.query.period === "string" ? req.query.period : "6m";
    const months = period === "12m" ? 12 : period === "3m" ? 3 : 6;
    const toDate = new Date().toISOString().slice(0, 10);
    const from = new Date();
    from.setMonth(from.getMonth() - months);
    const fromDate = from.toISOString().slice(0, 10);

    const allIntegrations = await integrationStore.listByClient(clientId);
    const ga4Integration = allIntegrations.find((i) => i.kind === "ga4" && i.status === "active");

    if (!ga4Integration) {
      ok(res, { noIntegration: true, months: [], allSources: [], fromDate, toDate });
      return;
    }

    try {
      const ga4 = new Ga4Service();
      const config = ga4Integration.config as Record<string, unknown>;
      const data = await ga4.getMonthlyAiTraffic(config, fromDate, toDate, async (updated) => {
        await integrationStore.updateConfig(ga4Integration.id, updated);
      });
      ok(res, { noIntegration: false, ...data });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ok(res, { noIntegration: false, error: msg, months: [], allSources: [], fromDate, toDate });
    }
  });
}
