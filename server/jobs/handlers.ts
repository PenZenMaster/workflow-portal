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
  mentionStore,
  citationStore,
  metricStore,
  brandStore,
  aliasStore,
} from "../storage";
import { getAdapter } from "../adapters/registry";
import { parseResponse } from "../services/parser";
import { computeVisibilityScore } from "../services/scoring";
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

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
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

  // ---- parse-response -----------------------------------------------------
  runner.register({
    kind: "parse-response",
    async handle(payload) {
      const { responseId } = payload as { responseId: number };
      const response = await responseStore.get(responseId);
      if (!response || !response.responseText) {
        logger.warn("parse-response: response not found or empty", { responseId });
        return;
      }

      // Get the run to find the client.
      const run = await runStore.get(response.runId);
      if (!run) return;

      // Load all brands + aliases for this client.
      const allBrands = await brandStore.listByClient(run.clientId);
      const brandInputs = await Promise.all(
        allBrands.map(async (b) => ({
          id: b.id,
          primaryDomain: b.primaryDomain,
          aliases: await aliasStore.listByBrand(b.id),
        }))
      );

      // Parse citations from rawPayload if available.
      const rawPayload = response.rawPayload as { citations?: string[] } | null;
      const citationUrls: Array<{ url: string; position: number }> =
        (rawPayload?.citations ?? []).map((url, idx) => ({ url, position: idx + 1 }));

      // Clear old parse results (for re-runs).
      await mentionStore.deleteByResponse(responseId);
      await citationStore.deleteByResponse(responseId);

      const { mentions, citations } = parseResponse(
        response.responseText,
        citationUrls,
        brandInputs
      );

      if (mentions.length > 0) {
        await mentionStore.bulkCreate(
          mentions.map((m) => ({ ...m, responseId }))
        );
      }

      if (citations.length > 0) {
        await citationStore.bulkCreate(
          citations.map((c) => ({ ...c, responseId }))
        );
      }

      // Compute and store today's metric snapshot for this client.
      runner.enqueue("aggregate-snapshot-daily", { clientId: run.clientId });

      logger.info("parse-response: complete", {
        responseId,
        mentions: mentions.length,
        citations: citations.length,
      });
    },
  });

  // ---- aggregate-snapshot-daily -------------------------------------------
  runner.register({
    kind: "aggregate-snapshot-daily",
    async handle(payload) {
      const { clientId } = payload as { clientId: number };

      // Get all brands for this client to identify the "client" brand.
      const allBrands = await brandStore.listByClient(clientId);
      const clientBrand = allBrands.find((b) => b.kind === "client");
      if (!clientBrand) return;

      // Find all client runs to aggregate across.
      const runs = await runStore.listByClient(clientId);
      const today = todayIso();

      let citationCount = 0;
      let mentionCount = 0;
      let allBrandMentions = 0;
      let visibilityScoreSum = 0;
      let promptResponseCount = 0;

      // Aggregate today's completed responses.
      for (const run of runs) {
        const responses = await responseStore.listByRun(run.id);
        const todayComplete = responses.filter((r) => r.status === "complete");

        for (const resp of todayComplete) {
          promptResponseCount++;
          const mentions = await mentionStore.listByResponse(resp.id);
          const citations = await citationStore.listByResponse(resp.id);

          const hasMention = mentions.some((m) => m.brandId === clientBrand.id);
          const hasCitation = citations.some((c) => c.ownedByBrandId === clientBrand.id);

          if (hasMention || hasCitation) mentionCount++;
          if (hasCitation) citationCount++;
          allBrandMentions += mentions.length;
          visibilityScoreSum += computeVisibilityScore(mentions, citations, clientBrand.id);
        }
      }

      await metricStore.upsert({
        clientId,
        dateIso: today,
        scopeKind: "overall",
        scopeValue: null,
        citationCount,
        mentionCount,
        allBrandMentions,
        visibilityScoreSum,
        promptResponseCount,
      });

      logger.info("aggregate-snapshot-daily: complete", { clientId, today });
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
