/*
 * Module/Script Name: runs.ts
 * Path: server/routes/runs.ts
 *
 * Description:
 * REST API routes for the AI Visibility run-engine domain: triggering
 * prompt runs, viewing results, retrying failures, and managing schedules.
 * All responses use the { data } envelope.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-09
 * Last Modified Date: 2026-05-09
 * Comments:
 * - v1.00 Sprint 3 initial implementation
 */

import type { Express } from "express";
import crypto from "node:crypto";
import {
  runStore,
  responseStore,
  scheduleStore,
  promptStore,
  jobStore,
} from "../storage";
import { JOB_STATUSES } from "@shared/schema";
import { triggerRunSchema, insertScheduleSchema } from "@shared/schema";
import { requireAuth, requireRole } from "../auth";
import { ok, created, noContent } from "../response";
import { AppError } from "../errors";
import { jobRunner } from "../jobs/runner";

const ADMIN_ROLES = ["super_admin", "agency_admin"] as const;
const EDITOR_ROLES = ["super_admin", "agency_admin", "analyst"] as const;

export function registerRunRoutes(app: Express): void {
  // --- Run trigger ---------------------------------------------------------

  app.post(
    "/api/clients/:id/runs",
    requireRole(...EDITOR_ROLES),
    async (req, res) => {
      const clientId = Number(req.params.id);
      if (Number.isNaN(clientId))
        throw new AppError(400, "Invalid client id", "INVALID_ID");

      const parsed = triggerRunSchema.safeParse(req.body);
      if (!parsed.success)
        throw new AppError(400, "Validation failed", "VALIDATION_ERROR");

      const { collectionId, platformIds } = parsed.data;
      const prompts = await promptStore.listByCollection(collectionId);
      const totalPrompts = prompts.length * platformIds.length;

      const batchId = crypto.randomUUID();
      const run = await runStore.create({
        clientId,
        collectionId,
        batchId,
        totalPrompts,
        triggeredBy: "manual",
        triggeredByUserId: req.session.user?.id ?? null,
      });

      for (const prompt of prompts) {
        for (const platformId of platformIds) {
          const response = await responseStore.create({
            runId: run.id,
            promptId: prompt.id,
            platformId,
            queryText: prompt.text,
            geo: prompt.geo,
          });
          jobRunner.enqueue("prompt-run", { responseId: response.id });
        }
      }

      res.status(202).json({ data: { runId: run.id, batchId, totalJobs: totalPrompts } });
    }
  );

  // --- Run list + detail ---------------------------------------------------

  app.get("/api/clients/:id/runs", requireAuth, async (req, res) => {
    const clientId = Number(req.params.id);
    if (Number.isNaN(clientId))
      throw new AppError(400, "Invalid client id", "INVALID_ID");
    const runs = await runStore.listByClient(clientId);
    ok(res, runs);
  });

  app.get("/api/runs/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");
    const run = await runStore.get(id);
    if (!run) throw new AppError(404, "Run not found", "RUN_NOT_FOUND");
    const responses = await responseStore.listByRun(id);
    ok(res, { run, responses });
  });

  app.get(
    "/api/runs/:id/responses/:responseId",
    requireAuth,
    async (req, res) => {
      const responseId = Number(req.params.responseId);
      if (Number.isNaN(responseId))
        throw new AppError(400, "Invalid id", "INVALID_ID");
      const response = await responseStore.get(responseId);
      if (!response)
        throw new AppError(404, "Response not found", "RESPONSE_NOT_FOUND");
      ok(res, response);
    }
  );

  // --- Re-parse all completed responses in a run --------------------------
  // Useful when brands/aliases are added after a run completed.

  app.post(
    "/api/runs/:id/reparse",
    requireRole(...EDITOR_ROLES),
    async (req, res) => {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");
      const run = await runStore.get(id);
      if (!run) throw new AppError(404, "Run not found", "RUN_NOT_FOUND");

      const responses = await responseStore.listByRun(id);
      const completed = responses.filter((r) => r.status === "complete");
      for (const resp of completed) {
        jobRunner.enqueue("parse-response", { responseId: resp.id });
      }

      res.status(202).json({ data: { reparsedCount: completed.length } });
    }
  );

  // --- Re-parse progress ----------------------------------------------------
  // Polled by the UI after triggering /reparse to show live progress.

  app.get(
    "/api/runs/:id/reparse-status",
    requireRole(...EDITOR_ROLES),
    async (req, res) => {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");
      const run = await runStore.get(id);
      if (!run) throw new AppError(404, "Run not found", "RUN_NOT_FOUND");

      const since = Number(req.query.since);
      if (Number.isNaN(since))
        throw new AppError(400, "Invalid or missing since", "INVALID_SINCE");

      const responses = await responseStore.listByRun(id);
      const responseIds = responses.map((r) => r.id);

      const jobs = await jobStore.listByKindAndResponseIds(
        "parse-response",
        responseIds,
        since
      );

      const counts = { total: jobs.length, queued: 0, running: 0, done: 0, failed: 0, cancelled: 0 };
      for (const status of JOB_STATUSES) {
        counts[status] = jobs.filter((j) => j.status === status).length;
      }

      ok(res, counts);
    }
  );

  // --- Retry failed --------------------------------------------------------

  app.post(
    "/api/runs/:id/retry-failed",
    requireRole(...EDITOR_ROLES),
    async (req, res) => {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");
      const run = await runStore.get(id);
      if (!run) throw new AppError(404, "Run not found", "RUN_NOT_FOUND");

      const failed = await responseStore.listFailedByRun(id);
      for (const resp of failed) {
        await responseStore.updateResult(resp.id, { status: "queued" });
        jobRunner.enqueue("prompt-run", { responseId: resp.id });
      }

      res.status(202).json({ data: { retriedCount: failed.length } });
    }
  );

  // --- Schedules -----------------------------------------------------------

  app.get("/api/clients/:id/schedules", requireAuth, async (req, res) => {
    const clientId = Number(req.params.id);
    if (Number.isNaN(clientId))
      throw new AppError(400, "Invalid client id", "INVALID_ID");
    const schedules = await scheduleStore.listByClient(clientId);
    ok(res, schedules);
  });

  app.post(
    "/api/clients/:id/schedules",
    requireRole(...ADMIN_ROLES),
    async (req, res) => {
      const clientId = Number(req.params.id);
      if (Number.isNaN(clientId))
        throw new AppError(400, "Invalid client id", "INVALID_ID");
      const parsed = insertScheduleSchema.safeParse(req.body);
      if (!parsed.success)
        throw new AppError(400, "Validation failed", "VALIDATION_ERROR");
      const schedule = await scheduleStore.create(clientId, parsed.data);
      created(res, schedule);
    }
  );

  app.patch(
    "/api/schedules/:id",
    requireRole(...ADMIN_ROLES),
    async (req, res) => {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");
      const parsed = insertScheduleSchema.partial().safeParse(req.body);
      if (!parsed.success)
        throw new AppError(400, "Validation failed", "VALIDATION_ERROR");
      const schedule = await scheduleStore.update(id, parsed.data);
      if (!schedule)
        throw new AppError(404, "Schedule not found", "SCHEDULE_NOT_FOUND");
      ok(res, schedule);
    }
  );

  app.delete(
    "/api/schedules/:id",
    requireRole(...ADMIN_ROLES),
    async (req, res) => {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");
      const deleted = await scheduleStore.delete(id);
      if (!deleted)
        throw new AppError(404, "Schedule not found", "SCHEDULE_NOT_FOUND");
      noContent(res);
    }
  );
}
