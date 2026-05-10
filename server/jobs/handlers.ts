/*
 * Module/Script Name: handlers.ts
 * Path: server/jobs/handlers.ts
 *
 * Description:
 * Registers all job kinds with the JobRunner. Call registerJobHandlers()
 * once after the runner is started in server/index.ts.
 *
 * prompt-run: executes one prompt against one platform, stores the raw
 * response, and updates run progress counters.
 *
 * schedule-tick: fires due run schedules, creates runs + response rows,
 * enqueues prompt-run jobs, and re-schedules itself.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-09
 * Last Modified Date: 2026-05-09
 * Comments:
 * - v1.00 Sprint 3 initial implementation
 */

import crypto from "node:crypto";
import type { JobRunner } from "./runner";
import {
  runStore,
  responseStore,
  scheduleStore,
  platformStore,
  promptStore,
} from "../storage";
import { getAdapter } from "../adapters/registry";
import { logger } from "../logger";

function computeNextFireAt(cadence: "weekly" | "monthly", hourUtc: number): number {
  const next = new Date();
  next.setUTCHours(hourUtc, 0, 0, 0);
  if (cadence === "weekly") {
    next.setUTCDate(next.getUTCDate() + 7);
  } else {
    next.setUTCMonth(next.getUTCMonth() + 1);
  }
  return next.getTime();
}

export function registerJobHandlers(runner: JobRunner): void {
  // ---- prompt-run ---------------------------------------------------------
  runner.register({
    kind: "prompt-run",
    async handle(payload) {
      const { responseId } = payload as { responseId: number };
      const response = await responseStore.get(responseId);
      if (!response) {
        logger.warn("prompt-run: response row not found", { responseId });
        return;
      }

      const platform = await platformStore.get(response.platformId);
      if (!platform) {
        await responseStore.updateResult(responseId, {
          status: "failed",
          errorMessage: `Platform ${response.platformId} not found`,
        });
        await runStore.incrementFailed(response.runId);
        return;
      }

      const adapter = getAdapter(platform.slug);
      if (!adapter) {
        await responseStore.updateResult(responseId, {
          status: "failed",
          errorMessage: `No adapter configured for platform: ${platform.slug}. Set PERPLEXITY_API_KEY in .env`,
        });
        await runStore.incrementFailed(response.runId);
      } else {
        try {
          const result = await adapter.run(response.queryText, {
            geo: response.geo ?? undefined,
            locale: response.locale ?? undefined,
          });
          await responseStore.updateResult(responseId, {
            status: "complete",
            responseText: result.text,
            responseSummaryBlock: result.summaryBlock,
            modelVariant: result.modelVariant,
            latencyMs: result.latencyMs,
            rawPayload: result.rawPayload,
          });
          await runStore.incrementCompleted(response.runId);
        } catch (err) {
          await responseStore.updateResult(responseId, {
            status: "failed",
            errorMessage: err instanceof Error ? err.message : String(err),
          });
          await runStore.incrementFailed(response.runId);
        }
      }

      // Finalise run status when all prompts are terminal.
      const run = await runStore.get(response.runId);
      if (run && run.completedPrompts + run.failedPrompts >= run.totalPrompts) {
        const finalStatus =
          run.failedPrompts === run.totalPrompts
            ? "failed"
            : run.failedPrompts > 0
            ? "partial"
            : "complete";
        await runStore.updateStatus(run.id, finalStatus);
      }
    },
  });

  // ---- schedule-tick ------------------------------------------------------
  runner.register({
    kind: "schedule-tick",
    async handle() {
      const now = Date.now();
      const due = await scheduleStore.listDue(now);

      for (const schedule of due) {
        const prompts = await promptStore.listByCollection(schedule.collectionId);
        const totalPrompts = prompts.length * schedule.platformIds.length;

        if (totalPrompts === 0) {
          await scheduleStore.markFired(
            schedule.id,
            now,
            computeNextFireAt(schedule.cadence, schedule.hourUtc)
          );
          continue;
        }

        const batchId = crypto.randomUUID();
        const run = await runStore.create({
          clientId: schedule.clientId,
          collectionId: schedule.collectionId,
          batchId,
          totalPrompts,
          triggeredBy: "schedule",
        });

        for (const prompt of prompts) {
          for (const platformId of schedule.platformIds) {
            const response = await responseStore.create({
              runId: run.id,
              promptId: prompt.id,
              platformId,
              queryText: prompt.text,
              geo: prompt.geo,
            });
            runner.enqueue("prompt-run", { responseId: response.id });
          }
        }

        await scheduleStore.markFired(
          schedule.id,
          now,
          computeNextFireAt(schedule.cadence, schedule.hourUtc)
        );

        logger.info("schedule-tick: created run", {
          scheduleId: schedule.id,
          runId: run.id,
          totalPrompts,
        });
      }
    },
  });
}
