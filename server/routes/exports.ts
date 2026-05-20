/*
 * Module/Script Name: exports.ts
 * Path: server/routes/exports.ts
 *
 * Description:
 * REST API routes for the report export domain: trigger CSV generation,
 * list export history, and stream the generated file for download.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-10
 * Last Modified Date: 2026-05-10
 * Comments:
 * - v1.00 Sprint 5 initial implementation
 */

import type { Express } from "express";
import fs from "node:fs";
import path from "node:path";
import { exportStore } from "../storage";
import { triggerExportSchema } from "@shared/schema";
import { requireAuth, requireRole } from "../auth";
import { ok } from "../response";
import { AppError } from "../errors";
import { jobRunner } from "../jobs/runner";

const EDITOR_ROLES = ["super_admin", "agency_admin", "analyst"] as const;

export function registerExportRoutes(app: Express): void {
  app.post(
    "/api/clients/:id/exports",
    requireRole(...EDITOR_ROLES),
    async (req, res) => {
      const clientId = Number(req.params.id);
      if (Number.isNaN(clientId))
        throw new AppError(400, "Invalid client id", "INVALID_ID");

      const parsed = triggerExportSchema.safeParse(req.body);
      if (!parsed.success)
        throw new AppError(400, "Validation failed", "VALIDATION_ERROR");

      const exportRecord = await exportStore.create({
        clientId,
        kind: parsed.data.kind,
        periodStart: parsed.data.periodStart,
        periodEnd: parsed.data.periodEnd,
        requestedByUserId: req.session.user?.id ?? null,
      });

      jobRunner.enqueue("build-export", { exportId: exportRecord.id });

      res.status(202).json({ data: { exportId: exportRecord.id, status: "queued" } });
    }
  );

  app.get("/api/clients/:id/exports", requireAuth, async (req, res) => {
    const clientId = Number(req.params.id);
    if (Number.isNaN(clientId))
      throw new AppError(400, "Invalid client id", "INVALID_ID");
    const exports = await exportStore.listByClient(clientId);
    ok(res, exports);
  });

  app.get("/api/exports/:id/download", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");

    const exportRecord = await exportStore.get(id);
    if (!exportRecord)
      throw new AppError(404, "Export not found", "EXPORT_NOT_FOUND");

    if (exportRecord.status !== "ready" || !exportRecord.filePath) {
      throw new AppError(409, "Export is not ready yet", "EXPORT_NOT_READY");
    }

    const absPath = path.isAbsolute(exportRecord.filePath)
      ? exportRecord.filePath
      : path.resolve(exportRecord.filePath);

    if (!fs.existsSync(absPath)) {
      throw new AppError(404, "Export file not found", "EXPORT_FILE_MISSING");
    }

    const filename = `${exportRecord.kind}-${exportRecord.periodStart}-${exportRecord.periodEnd}.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    fs.createReadStream(absPath).pipe(res);
  });
}
