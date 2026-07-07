/*
 * Module/Script Name: factory.ts
 * Path: server/jobs/factory.ts
 *
 * Description:
 * Factory job dispatcher. Registers the factory-run job kind with the
 * JobRunner: loads the factory_jobs record, routes it to the production
 * cell registered for its jobType, and writes lifecycle status and output
 * back to the factory record. Cell errors mark the record failed and are
 * rethrown so the runner's retry/backoff applies; a retried job is moved
 * back to running and re-executed.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-07
 * Last Modified Date: 2026-07-07
 * Comments:
 * - v1.00 Slice 1: dispatcher + production cell interface
 */

import type { FactoryJobRecord } from "@shared/schema";
import type { JobRunner } from "./runner";
import { factoryJobStore } from "../storage";
import { logger } from "../logger";

// Statuses the dispatcher refuses to execute: held for approval, or terminal
// in a way that retrying makes no sense. "failed" is intentionally absent so
// the runner's retry path can re-execute a failed job.
const SKIPPED_STATUSES = ["awaiting_approval", "done", "cancelled"] as const;

export interface FactoryCell {
  jobType: string;
  run(job: FactoryJobRecord): Promise<Record<string, unknown>>;
}

export function registerFactoryJobHandlers(
  runner: JobRunner,
  cells: FactoryCell[]
): void {
  const registry = new Map(cells.map((cell) => [cell.jobType, cell]));

  runner.register({
    kind: "factory-run",
    async handle(payload) {
      const { factoryJobId } = payload as { factoryJobId: number };
      const job = await factoryJobStore.get(factoryJobId);
      if (!job) {
        logger.warn("factory-run: factory job not found", { factoryJobId });
        return;
      }

      if ((SKIPPED_STATUSES as readonly string[]).includes(job.status)) {
        logger.warn("factory-run: job not executable in its current status", {
          factoryJobId,
          status: job.status,
        });
        return;
      }

      const cell = registry.get(job.jobType);
      if (!cell) {
        await factoryJobStore.updateStatus(
          job.id,
          "failed",
          `No production cell registered for job type: ${job.jobType}`
        );
        logger.warn("factory-run: no production cell for job type", {
          factoryJobId,
          jobType: job.jobType,
        });
        return;
      }

      await factoryJobStore.updateStatus(job.id, "running");
      try {
        const output = await cell.run(job);
        await factoryJobStore.setOutput(job.id, output);
        await factoryJobStore.updateStatus(job.id, "done");
        logger.info("factory-run: job complete", {
          factoryJobId,
          jobType: job.jobType,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await factoryJobStore.updateStatus(job.id, "failed", message);
        logger.error("factory-run: cell execution failed", {
          factoryJobId,
          jobType: job.jobType,
          error: message,
        });
        throw err;
      }
    },
  });
}
