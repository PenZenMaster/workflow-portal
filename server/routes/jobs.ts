/*
 * Module/Script Name: jobs.ts
 * Path: server/routes/jobs.ts
 *
 * Description:
 * Admin job-monitoring routes. Exposes the background job queue (list,
 * status counts, runner health/heartbeat) and manual recovery actions
 * (requeue a failed/cancelled job, cancel a queued/running job, rescue
 * orphaned jobs immediately). Super-admin only.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-06-11
 * Last Modified Date: 2026-06-11
 * Comments:
 * - v1.00 Job runner monitoring feature initial implementation
 */

import type { Express } from "express";
import { JOB_STATUSES } from "@shared/schema";
import type { JobStatus } from "@shared/schema";
import { jobStore } from "../storage";
import { jobRunner } from "../jobs/runner";
import { requireRole } from "../auth";
import { ok } from "../response";
import { AppError } from "../errors";

const STALL_THRESHOLD_MULTIPLIER = 3;

function isJobStatus(value: unknown): value is JobStatus {
  return typeof value === "string" && (JOB_STATUSES as readonly string[]).includes(value);
}

export function registerJobRoutes(app: Express): void {
  app.get("/api/jobs", requireRole("super_admin"), async (req, res) => {
    const status = isJobStatus(req.query.status) ? req.query.status : undefined;
    const kind = typeof req.query.kind === "string" ? req.query.kind : undefined;
    const limit =
      typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;

    const [jobsList, counts] = await Promise.all([
      jobStore.list({ status, kind, limit }),
      jobStore.countByStatus(),
    ]);
    ok(res, { jobs: jobsList, counts });
  });

  app.get("/api/jobs/health", requireRole("super_admin"), async (_req, res) => {
    const health = jobRunner.getHealth();
    const now = Date.now();
    const isStalled =
      health.lastTickAt === null ||
      health.intervalMs === null ||
      now - health.lastTickAt > health.intervalMs * STALL_THRESHOLD_MULTIPLIER;

    const [counts, hung] = await Promise.all([
      jobStore.countByStatus(),
      jobStore.listHung(now),
    ]);

    ok(res, {
      lastTickAt: health.lastTickAt,
      secondsSinceTick:
        health.lastTickAt === null ? null : Math.floor((now - health.lastTickAt) / 1000),
      intervalMs: health.intervalMs,
      running: health.running,
      isStalled,
      counts,
      hungCount: hung.length,
    });
  });

  app.post("/api/jobs/:id/requeue", requireRole("super_admin"), async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");

    const job = await jobStore.requeue(id);
    if (!job) throw new AppError(404, "Job not found", "JOB_NOT_FOUND");
    ok(res, job);
  });

  app.post("/api/jobs/:id/cancel", requireRole("super_admin"), async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");

    const existing = await jobStore.get(id);
    if (!existing) throw new AppError(404, "Job not found", "JOB_NOT_FOUND");
    if (existing.status === "done" || existing.status === "failed" || existing.status === "cancelled") {
      throw new AppError(409, "Job is already in a terminal state", "JOB_TERMINAL");
    }

    const job = await jobStore.cancel(id);
    ok(res, job);
  });

  app.post("/api/jobs/rescue", requireRole("super_admin"), async (_req, res) => {
    const rescued = jobRunner.rescueOrphans();
    const counts = await jobStore.countByStatus();
    ok(res, { rescued, counts });
  });
}
