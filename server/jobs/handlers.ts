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
 * Last Modified Date: 2026-08-06
 * Comments:
 * - v1.00 Sprint 3 initial implementation
 * - v1.01 issue #2 F6: monthly token budget guard on schedule-tick run
 *   creation
 * - v1.02 issue #30 slice 4: parse-response now sets responses_raw
 *   parseStatus/parsedAt on success or PERMANENT failure only - a
 *   transient failure that still has retries left (checked via jobStore
 *   against this invocation's jobId) leaves parseStatus untouched and
 *   still rethrows for JobRunner's own retry/fail bookkeeping
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
  recommendationStore,
  metricStore,
  sentimentStore,
  exportStore,
  integrationStore,
  brandStore,
  aliasStore,
  clientStore,
  promptMethodologyStore,
  sourceDomainStore,
  manifestStore,
  promptCollectionStore,
  jobStore,
} from "../storage";
import { getAdapter } from "../adapters/registry";
import { parseResponse, PARSER_VERSION } from "../services/parser";
import { classifyRecommendation, RECOMMENDATION_CLASSIFIER_VERSION } from "../services/recommendation";
import { classifyCitationSource, isTrustedSourceClass, type CitationOwnerKind } from "../services/sourceClassifier";
import { computeVisibilityScore, SCORING_VERSION } from "../services/scoring";
import { assembleManifest } from "../services/manifest";
import { classifySentiment } from "../services/sentiment";
import { generateCsvLines } from "../services/csv";
import { Ga4Service } from "../services/ga4";
import { computeNextFireAt, SCHEDULE_TICK_INTERVAL_MS } from "../services/scheduling";
import { buildPromptTokenContext, expandPromptText, type ClientBrandContext } from "../services/promptTokens";
import { checkClientBudget } from "../services/budgetGuard";
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
            inputTokens: result.usage?.inputTokens ?? null,
            outputTokens: result.usage?.outputTokens ?? null,
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
    async handle(payload, jobId) {
      const { responseId } = payload as { responseId: number };
      const response = await responseStore.get(responseId);
      if (!response || !response.responseText) {
        logger.warn("parse-response: response not found or empty", { responseId });
        return;
      }

      try {
        // Get the run to find the client.
        const run = await runStore.get(response.runId);
        if (!run) return;

        // Load all brands + aliases for this client.
        const allBrands = await brandStore.listByClient(run.clientId);
        const brandInputs = await Promise.all(
          allBrands.map(async (b) => ({
            id: b.id,
            canonicalName: b.canonicalName,
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
        await recommendationStore.deleteByResponse(responseId);

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
          // Classify each citation's source (spec 6.3): brand ownership wins,
          // then the source-domain registry, then unknown_or_low_trust.
          // isTrustedThirdParty is derived from the class (T score component).
          const registry = await sourceDomainStore.getMapForDomains(
            Array.from(new Set(citations.map((c) => c.rootDomain)))
          );
          const brandKindById = new Map(allBrands.map((b) => [b.id, b.kind]));
          await citationStore.bulkCreate(
            citations.map((c) => {
              let ownerKind: CitationOwnerKind = null;
              if (c.ownedByBrandId !== null) {
                ownerKind = brandKindById.get(c.ownedByBrandId) === "client" ? "client" : "competitor";
              }
              const sourceClass = classifyCitationSource(ownerKind, c.rootDomain, registry);
              return {
                ...c,
                responseId,
                sourceClass,
                isTrustedThirdParty: isTrustedSourceClass(sourceClass),
              };
            })
          );
        }

        // Classify one recommendation row per mentioned brand. Absence of
        // a row means not_mentioned - no rows are stored for unmentioned
        // brands.
        const mentionedBrandIds = Array.from(new Set(mentions.map((m) => m.brandId)));
        const recommendationRows = mentionedBrandIds.map((brandId) => {
          const classification = classifyRecommendation(
            mentions.filter((m) => m.brandId === brandId)
          );
          return {
            responseId,
            brandId,
            status: classification.status,
            rank: classification.rank,
            confidence: classification.confidence,
            evidenceExcerpt: classification.evidenceExcerpt,
            classifierVersion: RECOMMENDATION_CLASSIFIER_VERSION,
          };
        });
        if (recommendationRows.length > 0) {
          await recommendationStore.bulkCreate(recommendationRows);
        }

        // Chain downstream jobs.
        runner.enqueue("sentiment-classify", { responseId });
        runner.enqueue("aggregate-snapshot-daily", { clientId: run.clientId });

        logger.info("parse-response: complete", {
          responseId,
          mentions: mentions.length,
          citations: citations.length,
          recommendations: recommendationRows.length,
        });

        // issue #30 slice 4: persist the parse outcome directly on the
        // response row so it's cheaply joinable, instead of only being
        // reconstructable via an expensive lookup against the jobs table.
        await responseStore.updateParseStatus(responseId, {
          parseStatus: "parsed",
          parsedAt: Date.now(),
        });
      } catch (err) {
        // Only stamp a terminal parseStatus once retries are exhausted -
        // a transient failure about to retry must not look permanently
        // unparsed. job.attempts still reflects prior attempts (the
        // runner increments it only after this throw propagates), so
        // +1 here predicts whether THIS failure is the one that exhausts
        // the budget.
        const job = await jobStore.get(jobId);
        const isPermanent = !job || job.attempts + 1 >= job.maxAttempts;
        if (isPermanent) {
          await responseStore.updateParseStatus(responseId, {
            parseStatus: "failed",
            parsedAt: Date.now(),
          });
        }
        throw err;
      }
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

      const methodology = await promptMethodologyStore.getActive();

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
        methodologyVersion: methodology?.version ?? "1.0",
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

        if (prompts.length === 0) {
          await scheduleStore.markFired(schedule.id, now, nextFireAt);
          continue;
        }

        const client = await clientStore.get(schedule.clientId);
        const brands = await brandStore.listByClient(schedule.clientId);
        const brandContext: ClientBrandContext = {
          brand: brands.find((b) => b.kind === "client")?.canonicalName ?? client?.name ?? "",
          competitors: brands.filter((b) => b.kind === "competitor").map((b) => b.canonicalName),
          geographies: client?.geographies ?? [],
        };

        const expandedPrompts = prompts.map((prompt) => ({
          prompt,
          queryTexts: expandPromptText(prompt.text, buildPromptTokenContext(brandContext, prompt.geo)),
        }));
        const totalPrompts = expandedPrompts.reduce((sum, p) => sum + p.queryTexts.length, 0) * schedule.platformIds.length;

        if (totalPrompts === 0) {
          await scheduleStore.markFired(schedule.id, now, nextFireAt);
          continue;
        }

        // F6: a misconfigured schedule (e.g. accidentally hourly) is one of
        // the spend vectors the budget guard is meant to catch. schedule-tick
        // has no caller to return an error to, so a block just skips this
        // schedule's run and marks it fired so the next tick doesn't
        // immediately retry the same over-budget client.
        const budget = await checkClientBudget(responseStore, schedule.clientId, new Date(now));
        if (budget.status === "block") {
          logger.warn("schedule-tick: run skipped, monthly token budget exceeded", {
            scheduleId: schedule.id,
            clientId: schedule.clientId,
            monthToDateTokens: budget.monthToDateTokens,
            blockThreshold: budget.thresholds.block,
          });
          await scheduleStore.markFired(schedule.id, now, nextFireAt);
          continue;
        }
        if (budget.status === "warn") {
          logger.warn("schedule-tick: approaching monthly token budget", {
            scheduleId: schedule.id,
            clientId: schedule.clientId,
            monthToDateTokens: budget.monthToDateTokens,
            warnThreshold: budget.thresholds.warn,
          });
        }

        const batchId = crypto.randomUUID();
        const run = await runStore.create({
          clientId: schedule.clientId,
          collectionId: schedule.collectionId,
          batchId,
          totalPrompts,
          triggeredBy: "schedule",
        });

        // E2a: immutable manifest. Weekly cadence is the sentinel panel;
        // monthly is the full panel.
        const [collection, methodology, aliasLists] = await Promise.all([
          promptCollectionStore.get(schedule.collectionId),
          promptMethodologyStore.getActive(),
          Promise.all(brands.map((b) => aliasStore.listByBrand(b.id))),
        ]);
        await manifestStore.create(
          assembleManifest({
            runId: run.id,
            clientId: schedule.clientId,
            collectionId: schedule.collectionId,
            purpose: schedule.cadence === "weekly" ? "sentinel" : "full_panel",
            expectedResponseCount: totalPrompts,
            replicateCount: 1,
            config: {
              methodologyVersion: methodology?.version ?? "unknown",
              panelVersion: collection?.version != null ? String(collection.version) : null,
              scoringVersion: SCORING_VERSION,
              parserVersion: PARSER_VERSION,
              classifierVersion: RECOMMENDATION_CLASSIFIER_VERSION,
              platformIds: schedule.platformIds,
              prompts: prompts.map((p) => ({
                id: p.id,
                text: p.text,
                intentType: p.intentType ?? null,
                brandInPrompt: p.brandInPrompt ?? null,
                geo: p.geo ?? null,
                service: p.service ?? null,
              })),
              brands: brands.map((b, i) => ({
                id: b.id,
                canonicalName: b.canonicalName,
                kind: b.kind,
                primaryDomain: b.primaryDomain,
                aliases: (aliasLists[i] ?? []).map((a) => a.aliasText),
              })),
            },
          })
        );

        for (const { prompt, queryTexts } of expandedPrompts) {
          for (const queryText of queryTexts) {
            for (const platformId of schedule.platformIds) {
              const response = await responseStore.create({
                runId: run.id,
                promptId: prompt.id,
                platformId,
                queryText,
                geo: prompt.geo,
              });
              runner.enqueue("prompt-run", { responseId: response.id });
            }
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
