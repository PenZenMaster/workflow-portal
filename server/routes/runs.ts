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
  clientStore,
  brandStore,
  aliasStore,
  promptCollectionStore,
  promptMethodologyStore,
  manifestStore,
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
import { SCORING_VERSION } from "../services/scoring";
import { PARSER_VERSION } from "../services/parser";
import { RECOMMENDATION_CLASSIFIER_VERSION } from "../services/recommendation";

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

      const client = await clientStore.get(clientId);
      if (!client) throw new AppError(404, "Client not found", "CLIENT_NOT_FOUND");

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
