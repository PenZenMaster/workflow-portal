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
import fs from "node:fs";
import path from "node:path";
import {
  runStore,
  responseStore,
  scheduleStore,
  platformStore,
  promptStore,
  mentionStore,
  citationStore,
  metricStore,
  sentimentStore,
  exportStore,
  integrationStore,
  brandStore,
  aliasStore,
} from "../storage";
import { getAdapter } from "../adapters/registry";
import { parseResponse } from "../services/parser";
import { computeVisibilityScore } from "../services/scoring";
import { classifySentiment } from "../services/sentiment";
import { generateCsvLines } from "../services/csv";
import { Ga4Service } from "../services/ga4";
import { computeNextFireAt, SCHEDULE_TICK_INTERVAL_MS } from "../services/scheduling";
import { logger } from "../logger";

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
          errorMessage: `No adapter configured for platform: ${platform.slug}. Set the corresponding API key in your environment variables.`,
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
          // Chain: parse the response for mentions, citations, and metrics.
          runner.enqueue("parse-response", { responseId });
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

      // Chain downstream jobs.
      runner.enqueue("sentiment-classify", { responseId });
      runner.enqueue("aggregate-snapshot-daily", { clientId: run.clientId });

      logger.info("parse-response: complete", {
        responseId,
        mentions: mentions.length,
        citations: citations.length,
      });
    },
  });

  // ---- sentiment-classify -------------------------------------------------
  runner.register({
    kind: "sentiment-classify",
    async handle(payload) {
      const { responseId } = payload as { responseId: number };
      const response = await responseStore.get(responseId);
      if (!response || !response.responseText) return;

      const run = await runStore.get(response.runId);
      if (!run) return;

      const allBrands = await brandStore.listByClient(run.clientId);

      await sentimentStore.deleteByResponse(responseId);

      const mentions = await mentionStore.listByResponse(responseId);
      const brandIds = Array.from(new Set(mentions.map((m) => m.brandId)));

      for (const brandId of brandIds) {
        const brandMentions = mentions.filter((m) => m.brandId === brandId);
        const excerpts = brandMentions
          .map((m) => m.evidenceExcerpt ?? "")
          .filter(Boolean)
          .join(" ");

        const brand = allBrands.find((b) => b.id === brandId);
        const context = [brand?.canonicalName ?? "", excerpts, response.responseText.slice(0, 400)].join(" ");

        const result = classifySentiment(context);
        await sentimentStore.create({
          responseId,
          brandId,
          label: result.label,
          score: result.score,
          confidence: result.confidence,
          evidenceExcerpt: result.evidenceExcerpt,
          facetLabels: result.facetLabels,
        });
      }

      logger.info("sentiment-classify: complete", { responseId, brands: brandIds.length });
    },
  });

  // ---- build-export -------------------------------------------------------
  runner.register({
    kind: "build-export",
    async handle(payload) {
      const { exportId } = payload as { exportId: number };
      const exportRecord = await exportStore.get(exportId);
      if (!exportRecord) return;

      const exportsDir = path.resolve("exports");
      if (!fs.existsSync(exportsDir)) {
        fs.mkdirSync(exportsDir, { recursive: true });
      }
      const filePath = path.join(exportsDir, `export-${exportId}.csv`);

      try {
        const { metricStore: ms, mentionStore: mns, sentimentStore: ss } = await import("../storage");

        let lines: string[];

        if (exportRecord.kind === "csv-executive") {
          const snapshots = await ms.listByClient(
            exportRecord.clientId,
            exportRecord.periodStart,
            exportRecord.periodEnd
          );
          lines = generateCsvLines("csv-executive", { snapshots });
        } else {
          // csv-analyst and csv-mentions: export mentions with sentiment
          const rawMentions = await mns.listByClient(exportRecord.clientId);
          const sentiments = await ss.listByClient(exportRecord.clientId);
          const sentMap = new Map(sentiments.map((s) => [s.responseId, s]));
          const mentions = rawMentions.map((m) => ({
            id: m.id,
            responseId: m.responseId,
            brandId: m.brandId,
            matchedText: m.matchedText,
            section: m.section,
            recommendationRank: m.recommendationRank,
            evidenceExcerpt: m.evidenceExcerpt,
            sentimentLabel: sentMap.get(m.responseId)?.label ?? "unknown",
            sentimentScore: sentMap.get(m.responseId)?.score ?? 0,
          }));
          lines = generateCsvLines(exportRecord.kind, { mentions });
        }

        fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf-8");
        await exportStore.updateStatus(exportId, "ready", { filePath });
        logger.info("build-export: complete", { exportId, filePath });
      } catch (err) {
        await exportStore.updateStatus(exportId, "failed", {
          lastError: err instanceof Error ? err.message : String(err),
        });
        logger.error("build-export: failed", { exportId, error: String(err) });
      }
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
      let clientBrandMentions = 0;
      let visibilityScoreSum = 0;
      let promptResponseCount = 0;

      // Recompute lifetime cumulative totals across all completed responses
      // and store them as today's snapshot row. metricStore.aggregateForPeriod
      // derives period totals as a delta between two cumulative snapshots.
      for (const run of runs) {
        const responses = await responseStore.listByRun(run.id);
        const completeResponses = responses.filter((r) => r.status === "complete");

        for (const resp of completeResponses) {
          promptResponseCount++;
          const mentions = await mentionStore.listByResponse(resp.id);
          const citations = await citationStore.listByResponse(resp.id);

          const hasMention = mentions.some((m) => m.brandId === clientBrand.id);
          const hasCitation = citations.some((c) => c.ownedByBrandId === clientBrand.id);

          if (hasMention || hasCitation) mentionCount++;
          if (hasCitation) citationCount++;
          allBrandMentions += mentions.length;
          clientBrandMentions += mentions.filter((m) => m.brandId === clientBrand.id).length;
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
        clientBrandMentions,
        visibilityScoreSum,
        promptResponseCount,
      });

      logger.info("aggregate-snapshot-daily: complete", { clientId, today });
    },
  });

  // ---- refresh-ga4 --------------------------------------------------------
  runner.register({
    kind: "refresh-ga4",
    async handle(payload) {
      const { integrationId } = payload as { integrationId: number };
      const integration = await integrationStore.get(integrationId);
      if (!integration || integration.kind !== "ga4") return;

      const ga4 = new Ga4Service();
      const today = new Date().toISOString().slice(0, 10);

      try {
        const config = integration.config as Record<string, unknown>;
        await ga4.getAiTraffic(config, today, today, async (updated) => {
          await integrationStore.updateConfig(integration.id, updated);
        });
        await integrationStore.updateStatus(integration.id, "active", {
          lastSyncedAt: Date.now(),
          lastError: null,
        });
        logger.info("refresh-ga4: sync complete", { integrationId });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await integrationStore.updateStatus(integration.id, "failing", { lastError: msg });
        logger.error("refresh-ga4: sync failed", { integrationId, error: msg });
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
        const nextFireAt = computeNextFireAt(
          {
            cadence: schedule.cadence,
            hourUtc: schedule.hourUtc,
            dayOfWeek: schedule.dayOfWeek,
            dayOfMonth: schedule.dayOfMonth,
          },
          new Date(now)
        );

        const prompts = await promptStore.listByCollection(schedule.collectionId);
        const totalPrompts = prompts.length * schedule.platformIds.length;

        if (totalPrompts === 0) {
          await scheduleStore.markFired(schedule.id, now, nextFireAt);
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

        await scheduleStore.markFired(schedule.id, now, nextFireAt);

        logger.info("schedule-tick: created run", {
          scheduleId: schedule.id,
          runId: run.id,
          totalPrompts,
        });
      }

      // Self-perpetuate: schedule the next check one tick interval out.
      runner.enqueue("schedule-tick", {}, now + SCHEDULE_TICK_INTERVAL_MS);
    },
  });
}
