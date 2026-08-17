/*
 * Module/Script Name: rankrocketAdmin.ts
 * Path: server/routes/rankrocketAdmin.ts
 *
 * Description:
 * Admin CRUD for the RankRocket Site Insights card's configuration.
 * Part C: the "What do you want to know about this site?" question
 * options (formerly a hardcoded RANKROCKET_QUESTION_OPTIONS const array).
 * Part B (site credentials) lands in this same file in a later slice.
 * GET is available to any authenticated role (consumed by
 * LaunchInputsDialog.tsx's question dropdown); POST/PATCH/DELETE require
 * ADMIN_ROLES, same pattern as /api/platforms (server/routes/prompts.ts).
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-17
 * Last Modified Date: 2026-08-17
 * Comments:
 * - v1.00 RankRocket Site Insights admin CRUD, Part C
 */

import type { Express } from "express";
import { rankrocketQuestionOptionStore } from "../storage";
import {
  insertRankrocketQuestionOptionSchema,
  updateRankrocketQuestionOptionSchema,
} from "@shared/schema";
import { requireAuth, requireRole } from "../auth";
import { ok, created, noContent } from "../response";
import { AppError } from "../errors";

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
}
