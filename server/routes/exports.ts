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
 * Last Modified Date: 2026-10-05
 * Comments:
 * - v1.00 Sprint 5 initial implementation
 * - v1.01 GET /api/exports/overview.csv: all-clients 30-day Overview metrics
 * - v1.02 GET /api/clients/:id/exports/executive.csv: single-client snapshot series
 * - v1.03 executive.csv also accepts a client-bound API token (Bearer)
 */

import type { Express, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { exportStore, clientStore, clientUserStore, metricStore } from "../storage";
import { triggerExportSchema } from "@shared/schema";
import { requireAuth, requireRole } from "../auth";
import { requireRoleOrApiToken } from "../apiTokenAuth";
import { ok } from "../response";
import { AppError } from "../errors";
import { jobRunner } from "../jobs/runner";
import { periodToDates } from "../services/period";
import {
  computeCitationFrequency,
  computeMentionRate,
  computeAISoV,
} from "../services/scoring";
import { generateCsvLines, generateOverviewCsvLines } from "../services/csv";

const EDITOR_ROLES = ["super_admin", "agency_admin", "analyst"] as const;
const ALL_ROLES = [...EDITOR_ROLES, "account_manager", "client_viewer"] as const;

const EXECUTIVE_MAX_RANGE_DAYS = 366;
const DAY_MS = 86_400_000;

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const t = Date.parse(`${v}T00:00:00Z`);
    return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v;
  });

const executiveQuerySchema = z
  .object({ from: isoDateSchema.optional(), to: isoDateSchema.optional() })
  .refine((q) => (q.from === undefined) === (q.to === undefined), {
    message: "from and to must be supplied together",
  })
  .refine((q) => q.from === undefined || q.to === undefined || q.from <= q.to, {
    message: "from must not be after to",
  })
  .refine(
    (q) =>
      q.from === undefined ||
      q.to === undefined ||
      (Date.parse(q.to) - Date.parse(q.from)) / DAY_MS <= EXECUTIVE_MAX_RANGE_DAYS,
    { message: `range must not exceed ${EXECUTIVE_MAX_RANGE_DAYS} days` }
  );

export function registerExportRoutes(app: Express): void {
  // One client's daily snapshot series (same shape as the csv-executive
  // export job), synchronous so tools can fetch it in a single request.
  // Agency roles may read any client; other roles only assigned clients.
  app.get(
    "/api/clients/:id/exports/executive.csv",
    requireRoleOrApiToken(ALL_ROLES),
    async (req: Request, res: Response) => {
      const clientId = Number(req.params.id);
      if (!Number.isInteger(clientId) || clientId <= 0)
        throw new AppError(400, "Invalid client id", "INVALID_ID");

      // An API token is already bound to this client by the guard; session
      // callers need an agency role or an assignment to the client.
      if (!req.apiToken) {
        const { id: userId, role } = req.session.user!;
        const isAgencyRole = (EDITOR_ROLES as readonly string[]).includes(role);
        if (!isAgencyRole && !(await clientUserStore.canAccess(userId, clientId)))
          throw new AppError(403, "Forbidden", "FORBIDDEN");
      }

      const client = await clientStore.get(clientId);
      if (!client) throw new AppError(404, "Client not found", "CLIENT_NOT_FOUND");

      const parsed = executiveQuerySchema.safeParse(req.query);
      if (!parsed.success)
        throw new AppError(400, "Invalid date range", "INVALID_DATE_RANGE");
      const { fromDate, toDate } =
        parsed.data.from !== undefined && parsed.data.to !== undefined
          ? { fromDate: parsed.data.from, toDate: parsed.data.to }
          : periodToDates("30d");

      const snapshots = (await metricStore.listByClient(clientId, fromDate, toDate))
        .filter((s) => s.scopeKind === "overall")
        .sort((a, b) => a.dateIso.localeCompare(b.dateIso));

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="executive-${clientId}-${fromDate}-${toDate}.csv"`
      );
      res.send(generateCsvLines("csv-executive", { snapshots }).join("\n") + "\n");
    }
  );

  // All active clients, last 30 days, same aggregate as the Overview tab.
  // Agency roles only: this spans every client.
  // Registered before /api/exports/:id/download so the literal path wins.
  app.get("/api/exports/overview.csv", requireRole(...EDITOR_ROLES), async (_req, res) => {
    const { fromDate, toDate } = periodToDates("30d");
    const clients = await clientStore.list();
    const rows = [];
    for (const c of clients) {
      const agg = await metricStore.aggregateLiveForPeriod(c.id, fromDate, toDate);
      rows.push({
        clientId: c.id,
        clientName: c.name,
        primaryDomain: c.primaryDomain,
        periodFrom: fromDate,
        periodTo: toDate,
        totalResponses: agg.totalResponses,
        citationFrequency: computeCitationFrequency(agg.totalCitations, agg.totalResponses),
        mentionRate: computeMentionRate(agg.totalMentions, agg.totalResponses),
        aiSoV: computeAISoV(agg.totalClientBrandMentions, agg.totalAllBrandMentions),
        avgVisibilityScore:
          agg.totalResponses > 0 ? agg.totalVisibilityScore / agg.totalResponses : 0,
      });
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="overview-all-clients-${toDate}.csv"`
    );
    res.send(generateOverviewCsvLines(rows).join("\n") + "\n");
  });

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
