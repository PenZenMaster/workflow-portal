/*
 * Module/Script Name: rankrocketAdmin.ts
 * Path: server/routes/rankrocketAdmin.ts
 *
 * Description:
 * Admin CRUD for the RankRocket Site Insights card's configuration.
 * Part C: the "What do you want to know about this site?" question
 * options (formerly a hardcoded RANKROCKET_QUESTION_OPTIONS const array)
 * - GET available to any authenticated role (consumed by
 * LaunchInputsDialog.tsx's question dropdown); POST/PATCH/DELETE require
 * ADMIN_ROLES, same pattern as /api/platforms (server/routes/prompts.ts).
 * Part B: site credentials - every route requires ADMIN_ROLES (unlike
 * Part C's GET, these expose real WordPress credentials on write and
 * site metadata on read). Thin passthroughs to server/mcp/sitesAdmin.ts,
 * which calls rankrocket-mcp's rankrocket_sites_detail/
 * rankrocket_sites_write tools directly - workflow-portal never
 * persists the appPassword at rest, and a failure there is translated
 * to a generic 502 rather than leaking the underlying MCP error message
 * (which can include connection details).
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-17
 * Last Modified Date: 2026-08-17
 * Comments:
 * - v1.00 RankRocket Site Insights admin CRUD, Part C
 * - v1.01 Part B: site-credential admin routes
 */

import type { Express } from "express";
import { rankrocketQuestionOptionStore } from "../storage";
import {
  insertRankrocketQuestionOptionSchema,
  updateRankrocketQuestionOptionSchema,
  insertRankrocketSiteSchema,
  updateRankrocketSiteSchema,
} from "@shared/schema";
import { requireAuth, requireRole } from "../auth";
import { ok, created, noContent } from "../response";
import { AppError } from "../errors";
import { listSitesDetail, upsertSite, deleteSite } from "../mcp/sitesAdmin";
import { logger } from "../logger";

const ADMIN_ROLES = ["super_admin", "agency_admin"] as const;

export function registerRankrocketAdminRoutes(app: Express): void {
  app.get("/api/rankrocket-question-options", requireAuth, async (_req, res) => {
    const data = await rankrocketQuestionOptionStore.list();
    ok(res, data);
  });

  app.post("/api/rankrocket-question-options", requireRole(...ADMIN_ROLES), async (req, res) => {
    const parsed = insertRankrocketQuestionOptionSchema.safeParse(req.body);
    if (!parsed.success)
      throw new AppError(400, "Validation failed", "VALIDATION_ERROR");
    const option = await rankrocketQuestionOptionStore.create(parsed.data);
    created(res, option);
  });

  app.patch("/api/rankrocket-question-options/:id", requireRole(...ADMIN_ROLES), async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");
    const parsed = updateRankrocketQuestionOptionSchema.safeParse(req.body);
    if (!parsed.success)
      throw new AppError(400, "Validation failed", "VALIDATION_ERROR");
    const option = await rankrocketQuestionOptionStore.update(id, parsed.data);
    if (!option)
      throw new AppError(404, "Question option not found", "OPTION_NOT_FOUND");
    ok(res, option);
  });

  app.delete("/api/rankrocket-question-options/:id", requireRole(...ADMIN_ROLES), async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");
    const deleted = await rankrocketQuestionOptionStore.delete(id);
    if (!deleted)
      throw new AppError(404, "Question option not found", "OPTION_NOT_FOUND");
    noContent(res);
  });

  // --- Site credentials (Part B) --------------------------------------------

  app.get("/api/rankrocket-mcp/sites/admin", requireRole(...ADMIN_ROLES), async (_req, res) => {
    try {
      const data = await listSitesDetail();
      ok(res, data);
    } catch (err) {
      logger.error("rankrocket-mcp sites/admin list failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      throw new AppError(502, "Could not reach RankRocket MCP", "RANKROCKET_MCP_ERROR");
    }
  });

  app.post("/api/rankrocket-mcp/sites", requireRole(...ADMIN_ROLES), async (req, res) => {
    const parsed = insertRankrocketSiteSchema.safeParse(req.body);
    if (!parsed.success)
      throw new AppError(400, "Validation failed", "VALIDATION_ERROR");
    const { key, ...credentials } = parsed.data;
    try {
      await upsertSite("add", key, credentials);
    } catch (err) {
      logger.error("rankrocket-mcp site add failed", {
        key,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new AppError(502, "Could not reach RankRocket MCP", "RANKROCKET_MCP_ERROR");
    }
    created(res, { key });
  });

  app.patch("/api/rankrocket-mcp/sites/:key", requireRole(...ADMIN_ROLES), async (req, res) => {
    const key = String(req.params.key);
    const parsed = updateRankrocketSiteSchema.safeParse(req.body);
    if (!parsed.success)
      throw new AppError(400, "Validation failed", "VALIDATION_ERROR");
    try {
      await upsertSite("update", key, parsed.data);
    } catch (err) {
      logger.error("rankrocket-mcp site update failed", {
        key,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new AppError(502, "Could not reach RankRocket MCP", "RANKROCKET_MCP_ERROR");
    }
    ok(res, { key });
  });

  app.delete("/api/rankrocket-mcp/sites/:key", requireRole(...ADMIN_ROLES), async (req, res) => {
    const key = String(req.params.key);
    try {
      await deleteSite(key);
    } catch (err) {
      logger.error("rankrocket-mcp site delete failed", {
        key,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new AppError(502, "Could not reach RankRocket MCP", "RANKROCKET_MCP_ERROR");
    }
    noContent(res);
  });
}
