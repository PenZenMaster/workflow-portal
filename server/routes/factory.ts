/*
 * Module/Script Name: factory.ts
 * Path: server/routes/factory.ts
 *
 * Description:
 * Lights-Out SEO Factory intake routes. Accepts Factory Job Contract v1
 * payloads, persists them as factory_jobs, and releases them to the job
 * runner as factory-run jobs. Jobs whose contract requires approval are
 * held in awaiting_approval until an admin releases them via the approve
 * endpoint, which records the approving user for the audit trail.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-07
 * Last Modified Date: 2026-07-07
 * Comments:
 * - v1.00 Slice 1: intake, approval release, and admin list endpoints
 */

import type { Express } from "express";
import { FACTORY_JOB_STATUSES } from "@shared/schema";
import type { FactoryJobStatus } from "@shared/schema";
import { factoryJobSchema } from "@shared/factory/job-contract";
import { factoryJobStore, clientStore } from "../storage";
import { jobRunner } from "../jobs/runner";
import { requireRole } from "../auth";
import { ok, created } from "../response";
import { AppError } from "../errors";

const ADMIN_ROLES = ["super_admin", "agency_admin"] as const;

function isFactoryJobStatus(value: unknown): value is FactoryJobStatus {
  return (
    typeof value === "string" &&
    (FACTORY_JOB_STATUSES as readonly string[]).includes(value)
  );
}

export function registerFactoryRoutes(app: Express): void {
  app.post(
    "/api/factory/jobs",
    requireRole(...ADMIN_ROLES),
    async (req, res) => {
      const parsed = factoryJobSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid factory job contract",
          code: "INVALID_CONTRACT",
          details: parsed.error.flatten(),
        });
      }
      const contract = parsed.data;

      const client = await clientStore.get(contract.clientId);
      if (!client) {
        throw new AppError(404, "Client not found", "CLIENT_NOT_FOUND");
      }

      const existing = await factoryJobStore.getByJobId(contract.jobId);
      if (existing) {
        throw new AppError(
          409,
          `A factory job with jobId ${contract.jobId} already exists`,
          "DUPLICATE_JOB_ID"
        );
      }

      const record = await factoryJobStore.create(contract);
      if (record.status === "queued") {
        jobRunner.enqueue("factory-run", { factoryJobId: record.id });
      }
      return created(res, record);
    }
  );

  app.post(
    "/api/factory/jobs/:id/approve",
    requireRole(...ADMIN_ROLES),
    async (req, res) => {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");

      const job = await factoryJobStore.get(id);
      if (!job) {
        throw new AppError(404, "Factory job not found", "FACTORY_JOB_NOT_FOUND");
      }
      if (job.status !== "awaiting_approval") {
        throw new AppError(
          409,
          "Factory job is not awaiting approval",
          "NOT_AWAITING_APPROVAL"
        );
      }

      const userId = req.session.user!.id;
      const approved = await factoryJobStore.approve(id, userId);
      jobRunner.enqueue("factory-run", { factoryJobId: id });
      return ok(res, approved);
    }
  );

  app.get(
    "/api/factory/jobs",
    requireRole(...ADMIN_ROLES),
    async (req, res) => {
      const clientId =
        typeof req.query.clientId === "string" && req.query.clientId !== ""
          ? Number(req.query.clientId)
          : undefined;
      if (clientId !== undefined && Number.isNaN(clientId)) {
        throw new AppError(400, "Invalid clientId", "INVALID_CLIENT_ID");
      }
      const status = isFactoryJobStatus(req.query.status)
        ? req.query.status
        : undefined;
      const limit =
        typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;

      const jobs = await factoryJobStore.list({ clientId, status, limit });
      return ok(res, jobs);
    }
  );
}
