/*
 * Module/Script Name: responses.test.ts
 * Path: tests/server/storage/responses.test.ts
 *
 * Description:
 * ResponseStore tests: countParseFailuresForRun, the run-scoped parser
 * success aggregation feeding computeMeasurementHealth (issue #30 slice
 * 5, parseStatus fold-in deferred from slice 4).
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-10
 * Last Modified Date: 2026-08-10
 * Comments:
 * - v1.00 issue #30 slice 5
 */

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { SCHEMA_SQL } from "../../../server/storage";
import { RunStore } from "../../../server/storage/runStore";
import { ResponseStore } from "../../../server/storage/responseStore";

function makeDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(SCHEMA_SQL);
  return drizzle(sqlite);
}

describe("ResponseStore", () => {
  let db: ReturnType<typeof makeDb>;
  let runStore: RunStore;
  let store: ResponseStore;

  beforeEach(() => {
    db = makeDb();
    runStore = new RunStore(db);
    store = new ResponseStore(db);
  });

  describe("countParseFailuresForRun", () => {
    it("counts completed responses and permanent parse failures scoped to one run", async () => {
      const run = await runStore.create({
        clientId: 1, collectionId: 10, batchId: "batch-a", totalPrompts: 3, triggeredBy: "manual",
      });

      const ok1 = await store.create({ runId: run.id, promptId: 100, platformId: 1, queryText: "q1" });
      const ok2 = await store.create({ runId: run.id, promptId: 101, platformId: 1, queryText: "q2" });
      const bad = await store.create({ runId: run.id, promptId: 102, platformId: 1, queryText: "q3" });

      await store.updateResult(ok1.id, { status: "complete" });
      await store.updateResult(ok2.id, { status: "complete" });
      await store.updateResult(bad.id, { status: "complete" });

      await store.updateParseStatus(ok1.id, { parseStatus: "parsed", parsedAt: Date.now() });
      await store.updateParseStatus(ok2.id, { parseStatus: "parsed", parsedAt: Date.now() });
      await store.updateParseStatus(bad.id, { parseStatus: "failed", parsedAt: Date.now() });

      const result = await store.countParseFailuresForRun(run.id);
      expect(result).toEqual({ completedResponseCount: 3, parseFailedCount: 1 });
    });

    it("does not count a still-null parseStatus as a failure (not yet parsed, or mid-retry)", async () => {
      const run = await runStore.create({
        clientId: 1, collectionId: 10, batchId: "batch-b", totalPrompts: 1, triggeredBy: "manual",
      });
      const resp = await store.create({ runId: run.id, promptId: 200, platformId: 1, queryText: "q" });
      await store.updateResult(resp.id, { status: "complete" });
      // parseStatus left null - job hasn't run yet, or a transient retry is in flight.

      const result = await store.countParseFailuresForRun(run.id);
      expect(result).toEqual({ completedResponseCount: 1, parseFailedCount: 0 });
    });

    it("excludes non-complete responses from the completed count", async () => {
      const run = await runStore.create({
        clientId: 1, collectionId: 10, batchId: "batch-c", totalPrompts: 2, triggeredBy: "manual",
      });
      const complete = await store.create({ runId: run.id, promptId: 300, platformId: 1, queryText: "q1" });
      const failed = await store.create({ runId: run.id, promptId: 301, platformId: 1, queryText: "q2" });
      await store.updateResult(complete.id, { status: "complete" });
      await store.updateResult(failed.id, { status: "failed" });

      const result = await store.countParseFailuresForRun(run.id);
      expect(result).toEqual({ completedResponseCount: 1, parseFailedCount: 0 });
    });

    it("excludes responses belonging to other runs", async () => {
      const runA = await runStore.create({ clientId: 1, collectionId: 10, batchId: "batch-d", totalPrompts: 1, triggeredBy: "manual" });
      const runB = await runStore.create({ clientId: 1, collectionId: 10, batchId: "batch-e", totalPrompts: 1, triggeredBy: "manual" });

      const inA = await store.create({ runId: runA.id, promptId: 400, platformId: 1, queryText: "q" });
      await store.updateResult(inA.id, { status: "complete" });
      await store.updateParseStatus(inA.id, { parseStatus: "failed", parsedAt: Date.now() });

      const inB = await store.create({ runId: runB.id, promptId: 401, platformId: 1, queryText: "q" });
      await store.updateResult(inB.id, { status: "complete" });
      await store.updateParseStatus(inB.id, { parseStatus: "parsed", parsedAt: Date.now() });

      const result = await store.countParseFailuresForRun(runB.id);
      expect(result).toEqual({ completedResponseCount: 1, parseFailedCount: 0 });
    });
  });

  // issue #35 slice 2: requestedModel (the model the adapter was configured
  // to call) is stored alongside the existing modelVariant (the actual
  // model the provider reported) - the two are captured independently.
  describe("requestedModel", () => {
    it("stores and retrieves requestedModel alongside modelVariant", async () => {
      const run = await runStore.create({
        clientId: 1, collectionId: 10, batchId: "batch-f", totalPrompts: 1, triggeredBy: "manual",
      });
      const resp = await store.create({ runId: run.id, promptId: 500, platformId: 1, queryText: "q" });
      await store.updateResult(resp.id, {
        status: "complete",
        requestedModel: "gpt-4o-mini",
        modelVariant: "gpt-4o-2026-01-01",
      });

      const fetched = await store.get(resp.id);
      expect(fetched?.requestedModel).toBe("gpt-4o-mini");
      expect(fetched?.modelVariant).toBe("gpt-4o-2026-01-01");
    });

    it("defaults requestedModel to null when not provided (e.g. a response that failed before an adapter call)", async () => {
      const run = await runStore.create({
        clientId: 1, collectionId: 10, batchId: "batch-g", totalPrompts: 1, triggeredBy: "manual",
      });
      const resp = await store.create({ runId: run.id, promptId: 501, platformId: 1, queryText: "q" });
      await store.updateResult(resp.id, { status: "failed", errorMessage: "no adapter configured" });

      const fetched = await store.get(resp.id);
      expect(fetched?.requestedModel).toBeNull();
    });
  });

  // issue #35 slice 3: a timeout is a distinct status from "failed", but
  // retry-failed must still pick up timed-out responses - they are just as
  // eligible for a retry as any other non-completion.
  describe("listFailedByRun (issue #35 slice 3: includes timeout rows)", () => {
    it("returns both failed and timeout responses for the run", async () => {
      const run = await runStore.create({
        clientId: 1, collectionId: 10, batchId: "batch-h", totalPrompts: 3, triggeredBy: "manual",
      });
      const failed = await store.create({ runId: run.id, promptId: 600, platformId: 1, queryText: "q1" });
      const timedOut = await store.create({ runId: run.id, promptId: 601, platformId: 1, queryText: "q2" });
      const complete = await store.create({ runId: run.id, promptId: 602, platformId: 1, queryText: "q3" });

      await store.updateResult(failed.id, { status: "failed", errorMessage: "invalid API key" });
      await store.updateResult(timedOut.id, { status: "timeout", errorMessage: "request timed out after 30000ms" });
      await store.updateResult(complete.id, { status: "complete" });

      const result = await store.listFailedByRun(run.id);
      const ids = result.map((r) => r.id).sort();
      expect(ids).toEqual([failed.id, timedOut.id].sort());
    });
  });
});
