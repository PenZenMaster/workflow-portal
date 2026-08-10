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
 * Last Modified Date: 2026-07-24
 * Comments:
 * - v1.00 Sprint 3 initial implementation
 * - v1.01 issue #2 F6: monthly token budget guard on run creation and
 *   retry-failed
 * - v1.02 issue #3 Epic 3 slice 1 (issue #30): GET .../measurement-health
 *   rolls up completion/failure rate, platform coverage, and run
 *   comparability into a healthy/healthy_with_warnings/degraded/
 *   invalid_for_reporting status; degrades gracefully (no 404) when a
 *   manifest or baseline is missing, unlike /comparability
 * - v1.03 issue #30 slice 2: measurement-health also folds in prompt-
 *   metadata completeness (reuses computeCollectionDiagnostics) and
 *   brand-alias coverage (reuses computeReadiness)
 * - v1.04 issue #30 slice 3: measurement-health also folds in source-
 *   classification completeness (reuses sourceDomainStore.
 *   countClassificationCompletenessForRun, scoped to the run)
 * - v1.05 issue #30 slice 5: per-run health assembly extracted into
 *   assembleRunHealth, reused by the new client-scoped
 *   GET .../measurement-health period rollup ("N of M runs healthy")
 */

import type { Express } from "express";
import crypto from "node:crypto";
import {
  runStore,
  responseStore,
  scheduleStore,
  promptStore,
  jobStore,
  clientStore,
  brandStore,
  aliasStore,
  promptCollectionStore,
  promptMethodologyStore,
  manifestStore,
  sourceDomainStore,
} from "../storage";
import { JOB_STATUSES } from "@shared/schema";
import { triggerRunSchema, insertScheduleSchema } from "@shared/schema";
import { requireAuth, requireRole } from "../auth";
import { ok, created, noContent } from "../response";
import { AppError } from "../errors";
import { jobRunner } from "../jobs/runner";
import { computeNextFireAt } from "../services/scheduling";
import { buildPromptTokenContext, expandPromptText, type ClientBrandContext } from "../services/promptTokens";
import { assembleManifest } from "../services/manifest";
import { compareManifests } from "../services/comparability";
import { computeMeasurementHealth, computeHealthRollup } from "../services/measurementHealth";
import type { MeasurementHealthResult } from "../services/measurementHealth";
import type { PromptRun, MeasurementRunManifest } from "@shared/schema";
import { computeCollectionDiagnostics } from "../services/collectionDiagnostics";
import { computeReadiness } from "../services/clientReadiness";
import { SCORING_VERSION } from "../services/scoring";
import { PARSER_VERSION } from "../services/parser";
import { RECOMMENDATION_CLASSIFIER_VERSION } from "../services/recommendation";
import { checkClientBudget } from "../services/budgetGuard";
import { logger } from "../logger";

const ADMIN_ROLES = ["super_admin", "agency_admin"] as const;
const EDITOR_ROLES = ["super_admin", "agency_admin", "analyst"] as const;

// issue #30 slice 5: shared per-run health assembly, reused by both the
// single-run endpoint and the client-scoped period rollup below.
// explicitBaseline lets the single-run endpoint's ?against= override
// pass its own resolved manifest in; when omitted, the default
// nearest-previous-run baseline is resolved here - the only mode the
// period rollup ever uses, since ?against= doesn't make sense across
// many runs at once.
async function assembleRunHealth(
  run: PromptRun,
  explicitBaseline?: MeasurementRunManifest | null
): Promise<MeasurementHealthResult> {
  const manifest = await manifestStore.getByRunId(run.id);

  const baseline = manifest
    ? explicitBaseline !== undefined
      ? explicitBaseline
      : await manifestStore.getPreviousManifest(manifest.clientId, manifest.collectionId, manifest.runId)
    : null;

  const comparability = manifest && baseline ? compareManifests(baseline, manifest) : null;

  const responses = await responseStore.listByRun(run.id);
  const completedPlatformIds = Array.from(
    new Set(responses.filter((r) => r.status === "complete").map((r) => r.platformId))
  );

  const collection = await promptCollectionStore.get(run.collectionId);
  const collectionDiagnostics = collection
    ? computeCollectionDiagnostics(await promptStore.listByCollection(run.collectionId), collection.panelType)
    : null;
  const clientReadiness = await computeReadiness(run.clientId);

  const sourceClassificationCompleteness =
    await sourceDomainStore.countClassificationCompletenessForRun(run.id);
  const parseSuccessCompleteness = await responseStore.countParseFailuresForRun(run.id);

  return computeMeasurementHealth({
    run,
    manifest: manifest ?? null,
    comparability,
    completedPlatformIds,
    collectionDiagnostics,
    clientReadiness,
    sourceClassificationCompleteness,
    parseSuccessCompleteness,
  });
}

function healthPeriodToRangeMs(period: string): { fromMs: number; toMs: number } {
  const days = period === "90d" ? 90 : period === "365d" ? 365 : 30;
  const toMs = Date.now();
  return { fromMs: toMs - days * 86_400_000, toMs };
}

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

      const client = await clientStore.get(clientId);
      if (!client) throw new AppError(404, "Client not found", "CLIENT_NOT_FOUND");

      // F6: monthly per-client token budget guard - stops a runaway
      // {{competitor}} fan-out or accidental repeat trigger from spending
      // without limit. No-op unless BUDGET_MONTHLY_TOKEN_* env vars are set.
      const budget = await checkClientBudget(responseStore, clientId);
      if (budget.status === "block") {
        logger.warn("run creation blocked by monthly token budget", {
          clientId,
          monthToDateTokens: budget.monthToDateTokens,
          blockThreshold: budget.thresholds.block,
        });
        throw new AppError(429, "Monthly token budget exceeded", "BUDGET_EXCEEDED");
      }
      if (budget.status === "warn") {
        logger.warn("run creation approaching monthly token budget", {
          clientId,
          monthToDateTokens: budget.monthToDateTokens,
          warnThreshold: budget.thresholds.warn,
        });
      }

      const brands = await brandStore.listByClient(clientId);
      const brandContext: ClientBrandContext = {
        brand: brands.find((b) => b.kind === "client")?.canonicalName ?? client.name,
        competitors: brands.filter((b) => b.kind === "competitor").map((b) => b.canonicalName),
        geographies: client.geographies,
      };

      const { collectionId, platformIds } = parsed.data;
      const prompts = await promptStore.listByCollection(collectionId);
      const expandedPrompts = prompts.map((prompt) => ({
        prompt,
        queryTexts: expandPromptText(prompt.text, buildPromptTokenContext(brandContext, prompt.geo)),
      }));
      const totalPrompts = expandedPrompts.reduce((sum, p) => sum + p.queryTexts.length, 0) * platformIds.length;

      const batchId = crypto.randomUUID();
      const run = await runStore.create({
        clientId,
        collectionId,
        batchId,
        totalPrompts,
        triggeredBy: "manual",
        triggeredByUserId: req.session.user?.id ?? null,
      });

      // E2a: immutable manifest of what this run was configured to execute.
      const [collection, methodology, aliasLists] = await Promise.all([
        promptCollectionStore.get(collectionId),
        promptMethodologyStore.getActive(),
        Promise.all(brands.map((b) => aliasStore.listByBrand(b.id))),
      ]);
      await manifestStore.create(
        assembleManifest({
          runId: run.id,
          clientId,
          collectionId,
          purpose: "ad_hoc",
          expectedResponseCount: totalPrompts,
          replicateCount: 1,
          config: {
            methodologyVersion: methodology?.version ?? "unknown",
            panelVersion: collection?.version != null ? String(collection.version) : null,
            scoringVersion: SCORING_VERSION,
            parserVersion: PARSER_VERSION,
            classifierVersion: RECOMMENDATION_CLASSIFIER_VERSION,
            platformIds,
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
          for (const platformId of platformIds) {
            const response = await responseStore.create({
              runId: run.id,
              promptId: prompt.id,
              platformId,
              queryText,
              geo: prompt.geo,
            });
            jobRunner.enqueue("prompt-run", { responseId: response.id });
          }
        }
      }

      res.status(202).json({
        data: { runId: run.id, batchId, totalJobs: totalPrompts, budgetStatus: budget.status },
      });
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

  app.get("/api/runs/:id/manifest", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");
    const manifest = await manifestStore.getByRunId(id);
    if (!manifest)
      throw new AppError(404, "Manifest not found", "MANIFEST_NOT_FOUND");
    ok(res, manifest);
  });

  // E2b: methodology comparability of this run versus a baseline run.
  // Default baseline is the previous run of the same client+collection
  // that has a manifest; ?against=<runId> compares an explicit pair.
  app.get("/api/runs/:id/comparability", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");

    const manifest = await manifestStore.getByRunId(id);
    if (!manifest)
      throw new AppError(404, "Manifest not found", "MANIFEST_NOT_FOUND");

    let baseline;
    if (req.query.against !== undefined) {
      const againstId = Number(req.query.against);
      if (Number.isNaN(againstId))
        throw new AppError(400, "Invalid against run id", "INVALID_AGAINST");
      baseline = await manifestStore.getByRunId(againstId);
      if (!baseline)
        throw new AppError(404, "Baseline manifest not found", "BASELINE_MANIFEST_NOT_FOUND");
    } else {
      baseline = await manifestStore.getPreviousManifest(
        manifest.clientId,
        manifest.collectionId,
        manifest.runId
      );
      if (!baseline)
        throw new AppError(404, "No earlier run with a manifest", "NO_BASELINE");
    }

    ok(res, compareManifests(baseline, manifest));
  });

  // issue #3 Epic 3 slice 1 (issue #30): measurement health is a
  // best-effort rollup, not solely about comparability like the route
  // above - a missing manifest or baseline degrades gracefully (null
  // inputs to computeMeasurementHealth) rather than 404ing the whole
  // response. An explicit ?against= that doesn't resolve is still a real
  // user error, so that case keeps the same 404 as /comparability.
  app.get("/api/runs/:id/measurement-health", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");

    const run = await runStore.get(id);
    if (!run) throw new AppError(404, "Run not found", "RUN_NOT_FOUND");

    let explicitBaseline: MeasurementRunManifest | null | undefined;
    if (req.query.against !== undefined) {
      const againstId = Number(req.query.against);
      if (Number.isNaN(againstId))
        throw new AppError(400, "Invalid against run id", "INVALID_AGAINST");
      explicitBaseline = await manifestStore.getByRunId(againstId);
      if (!explicitBaseline)
        throw new AppError(404, "Baseline manifest not found", "BASELINE_MANIFEST_NOT_FOUND");
    }

    ok(res, await assembleRunHealth(run, explicitBaseline));
  });

  // issue #30 slice 5: period-level rollup - "N of M runs healthy/
  // degraded/invalid" across a client's runs in a date window, using the
  // same per-run assembly as the single-run endpoint above (always with
  // default baseline resolution - ?against= doesn't make sense across
  // many runs at once).
  app.get("/api/clients/:id/measurement-health", requireAuth, async (req, res) => {
    const clientId = Number(req.params.id);
    if (Number.isNaN(clientId))
      throw new AppError(400, "Invalid client id", "INVALID_ID");

    const period = typeof req.query.period === "string" ? req.query.period : "30d";
    const { fromMs, toMs } = healthPeriodToRangeMs(period);

    const runs = await runStore.listByClientInRange(clientId, fromMs, toMs);
    const results = await Promise.all(runs.map((run) => assembleRunHealth(run)));

    ok(res, {
      period,
      fromMs,
      toMs,
      runs: results.map((r) => ({ runId: r.runId, status: r.status, reasons: r.reasons })),
      rollup: computeHealthRollup(results),
    });
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

      // F6: repeated Retry-failed clicks are one of the spend vectors the
      // budget guard is meant to catch.
      const budget = await checkClientBudget(responseStore, run.clientId);
      if (budget.status === "block") {
        logger.warn("retry-failed blocked by monthly token budget", {
          clientId: run.clientId,
          runId: id,
          monthToDateTokens: budget.monthToDateTokens,
          blockThreshold: budget.thresholds.block,
        });
        throw new AppError(429, "Monthly token budget exceeded", "BUDGET_EXCEEDED");
      }

      const failed = await responseStore.listFailedByRun(id);
      for (const resp of failed) {
        await runStore.decrementFailed(id);
        await responseStore.updateResult(resp.id, { status: "queued" });
        jobRunner.enqueue("prompt-run", { responseId: resp.id });
      }

      if (failed.length > 0) {
        await runStore.updateStatus(id, "running");
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
      const data = {
        ...parsed.data,
        nextFireAt: parsed.data.nextFireAt ?? computeNextFireAt(parsed.data),
      };
      const schedule = await scheduleStore.create(clientId, data);
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

      const data: Partial<typeof parsed.data> = { ...parsed.data };
      const timingChanged = ["cadence", "hourUtc", "dayOfWeek", "dayOfMonth"].some(
        (key) => key in data
      );
      if (timingChanged && data.nextFireAt === undefined) {
        const existing = await scheduleStore.get(id);
        if (!existing) throw new AppError(404, "Schedule not found", "SCHEDULE_NOT_FOUND");
        data.nextFireAt = computeNextFireAt({
          cadence: data.cadence ?? existing.cadence,
          hourUtc: data.hourUtc ?? existing.hourUtc,
          dayOfWeek: data.dayOfWeek ?? existing.dayOfWeek,
          dayOfMonth: data.dayOfMonth ?? existing.dayOfMonth,
        });
      }

      const schedule = await scheduleStore.update(id, data);
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
