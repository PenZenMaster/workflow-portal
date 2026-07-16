import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { platforms, responsesRaw } from "@shared/schema";
import { SCHEMA_SQL } from "../../../server/storage";
import { RunStore } from "../../../server/storage/runStore";
import { ResponseStore } from "../../../server/storage/responseStore";
import { ScheduleStore } from "../../../server/storage/scheduleStore";

function makeDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(SCHEMA_SQL);
  return drizzle(sqlite);
}

const SAMPLE_RUN_DATA = {
  clientId: 1,
  collectionId: 10,
  batchId: "batch-001",
  totalPrompts: 3,
  triggeredBy: "manual" as const,
  triggeredByUserId: 1,
};

const SAMPLE_RESPONSE_DATA = {
  runId: 1,
  promptId: 100,
  platformId: 1,
  queryText: "Best SEO agency in Seattle",
};

// ---------------------------------------------------------------------------
describe("RunStore", () => {
  let store: RunStore;

  beforeEach(() => { store = new RunStore(makeDb()); });

  it("creates a run and returns it", async () => {
    const run = await store.create(SAMPLE_RUN_DATA);
    expect(run.id).toBeTypeOf("number");
    expect(run.status).toBe("queued");
    expect(run.batchId).toBe("batch-001");
    expect(run.totalPrompts).toBe(3);
    expect(run.completedPrompts).toBe(0);
  });

  it("lists runs by client", async () => {
    await store.create(SAMPLE_RUN_DATA);
    await store.create({ ...SAMPLE_RUN_DATA, clientId: 99 }); // different client
    const list = await store.listByClient(1);
    expect(list).toHaveLength(1);
  });

  it("gets a run by id", async () => {
    const run = await store.create(SAMPLE_RUN_DATA);
    const found = await store.get(run.id);
    expect(found?.batchId).toBe("batch-001");
  });

  it("returns undefined for unknown id", async () => {
    expect(await store.get(9999)).toBeUndefined();
  });

  it("updates status", async () => {
    const run = await store.create(SAMPLE_RUN_DATA);
    await store.updateStatus(run.id, "running");
    const updated = await store.get(run.id);
    expect(updated?.status).toBe("running");
  });

  it("increments completedPrompts", async () => {
    const run = await store.create(SAMPLE_RUN_DATA);
    await store.incrementCompleted(run.id);
    await store.incrementCompleted(run.id);
    const updated = await store.get(run.id);
    expect(updated?.completedPrompts).toBe(2);
  });

  it("increments failedPrompts", async () => {
    const run = await store.create(SAMPLE_RUN_DATA);
    await store.incrementFailed(run.id);
    const updated = await store.get(run.id);
    expect(updated?.failedPrompts).toBe(1);
  });

  it("decrements failedPrompts", async () => {
    const run = await store.create(SAMPLE_RUN_DATA);
    await store.incrementFailed(run.id);
    await store.incrementFailed(run.id);
    await store.decrementFailed(run.id);
    const updated = await store.get(run.id);
    expect(updated?.failedPrompts).toBe(1);
  });

  it("does not decrement failedPrompts below zero", async () => {
    const run = await store.create(SAMPLE_RUN_DATA);
    await store.decrementFailed(run.id);
    const updated = await store.get(run.id);
    expect(updated?.failedPrompts).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe("ResponseStore", () => {
  let db: ReturnType<typeof drizzle>;
  let runStore: RunStore;
  let store: ResponseStore;

  beforeEach(async () => {
    db = makeDb();
    runStore = new RunStore(db);
    store = new ResponseStore(db);
  });

  it("creates a response and returns it", async () => {
    const run = await runStore.create(SAMPLE_RUN_DATA);
    const resp = await store.create({ ...SAMPLE_RESPONSE_DATA, runId: run.id });
    expect(resp.id).toBeTypeOf("number");
    expect(resp.status).toBe("queued");
    expect(resp.queryText).toBe("Best SEO agency in Seattle");
  });

  it("lists responses by run", async () => {
    const run = await runStore.create(SAMPLE_RUN_DATA);
    await store.create({ ...SAMPLE_RESPONSE_DATA, runId: run.id });
    await store.create({ ...SAMPLE_RESPONSE_DATA, runId: run.id, promptId: 101 });
    const list = await store.listByRun(run.id);
    expect(list).toHaveLength(2);
  });

  it("updates result with response text and citations", async () => {
    const run = await runStore.create(SAMPLE_RUN_DATA);
    const resp = await store.create({ ...SAMPLE_RESPONSE_DATA, runId: run.id });
    await store.updateResult(resp.id, {
      status: "complete",
      responseText: "Acme SEO is the top agency...",
      modelVariant: "sonar",
      latencyMs: 1234,
      rawPayload: { model: "sonar" },
    });
    const updated = await store.get(resp.id);
    expect(updated?.status).toBe("complete");
    expect(updated?.responseText).toBe("Acme SEO is the top agency...");
    expect(updated?.latencyMs).toBe(1234);
  });

  it("lists only failed responses for a run", async () => {
    const run = await runStore.create(SAMPLE_RUN_DATA);
    await store.create({ ...SAMPLE_RESPONSE_DATA, runId: run.id });
    const r2 = await store.create({ ...SAMPLE_RESPONSE_DATA, runId: run.id, promptId: 101 });
    await store.updateResult(r2.id, { status: "failed", errorMessage: "timeout" });
    const failed = await store.listFailedByRun(run.id);
    expect(failed).toHaveLength(1);
    expect(failed[0].errorMessage).toBe("timeout");
  });

  it("aggregateTokensByClient sums tokens per platform for one client within the period", async () => {
    db.insert(platforms).values([
      { id: 1, slug: "openai", displayName: "OpenAI" },
      { id: 2, slug: "mistral", displayName: "Mistral" },
    ]).run();

    const run = await runStore.create(SAMPLE_RUN_DATA); // clientId from SAMPLE_RUN_DATA
    const otherRun = await runStore.create({ ...SAMPLE_RUN_DATA, clientId: 99, batchId: "other" });

    async function completed(runId: number, platformId: number, input: number, output: number) {
      const r = await store.create({ ...SAMPLE_RESPONSE_DATA, runId, platformId });
      await store.updateResult(r.id, { status: "complete", responseText: "t", inputTokens: input, outputTokens: output });
    }
    await completed(run.id, 1, 10, 100);
    await completed(run.id, 1, 20, 200);
    await completed(run.id, 2, 5, 50);
    await completed(otherRun.id, 1, 999, 999); // other client — excluded

    const agg = await store.aggregateTokensByClient(SAMPLE_RUN_DATA.clientId, "2000-01-01", "2100-01-01");
    expect(agg.totalInputTokens).toBe(35);
    expect(agg.totalOutputTokens).toBe(350);
    expect(agg.byPlatform).toEqual([
      { platformId: 1, platformSlug: "openai", responses: 2, inputTokens: 30, outputTokens: 300 },
      { platformId: 2, platformSlug: "mistral", responses: 1, inputTokens: 5, outputTokens: 50 },
    ]);
  });

  it("aggregateTokensByClient ignores responses without token data and outside the period", async () => {
    db.insert(platforms).values([{ id: 1, slug: "openai", displayName: "OpenAI" }]).run();
    const run = await runStore.create(SAMPLE_RUN_DATA);

    const noTokens = await store.create({ ...SAMPLE_RESPONSE_DATA, runId: run.id });
    await store.updateResult(noTokens.id, { status: "complete", responseText: "t" });

    const outOfRange = await store.create({ ...SAMPLE_RESPONSE_DATA, runId: run.id });
    await store.updateResult(outOfRange.id, { status: "complete", responseText: "t", inputTokens: 7, outputTokens: 70 });
    db.update(responsesRaw)
      .set({ capturedAt: Date.parse("2020-01-01T00:00:00Z") })
      .where(eq(responsesRaw.id, outOfRange.id))
      .run();

    const agg = await store.aggregateTokensByClient(SAMPLE_RUN_DATA.clientId, "2026-01-01", "2100-01-01");
    expect(agg.totalInputTokens).toBe(0);
    expect(agg.totalOutputTokens).toBe(0);
    expect(agg.byPlatform).toEqual([]);
  });

  it("persists token usage on updateResult and defaults it to null", async () => {
    const run = await runStore.create(SAMPLE_RUN_DATA);
    const resp = await store.create({ ...SAMPLE_RESPONSE_DATA, runId: run.id });
    expect(resp.inputTokens).toBeNull();
    expect(resp.outputTokens).toBeNull();

    await store.updateResult(resp.id, {
      status: "complete",
      responseText: "text",
      inputTokens: 42,
      outputTokens: 117,
    });
    const updated = await store.get(resp.id);
    expect(updated?.inputTokens).toBe(42);
    expect(updated?.outputTokens).toBe(117);
  });
});

// ---------------------------------------------------------------------------
describe("ScheduleStore", () => {
  let store: ScheduleStore;

  beforeEach(() => { store = new ScheduleStore(makeDb()); });

  const SAMPLE_SCHEDULE = {
    clientId: 1,
    collectionId: 10,
    platformIds: [1],
    cadence: "weekly" as const,
    dayOfWeek: 1, // Monday
    hourUtc: 8,
    nextFireAt: Date.now() + 86_400_000,
    enabled: true,
  };

  it("creates a schedule", async () => {
    const s = await store.create(1, SAMPLE_SCHEDULE);
    expect(s.clientId).toBe(1);
    expect(s.cadence).toBe("weekly");
    expect(s.platformIds).toEqual([1]);
    expect(s.enabled).toBe(true);
  });

  it("lists schedules by client", async () => {
    await store.create(1, SAMPLE_SCHEDULE);
    await store.create(1, { ...SAMPLE_SCHEDULE, dayOfWeek: 3 });
    await store.create(2, SAMPLE_SCHEDULE); // different client
    expect(await store.listByClient(1)).toHaveLength(2);
    expect(await store.listByClient(2)).toHaveLength(1);
  });

  it("deletes a schedule", async () => {
    const s = await store.create(1, SAMPLE_SCHEDULE);
    expect(await store.delete(s.id)).toBe(true);
    expect(await store.listByClient(1)).toHaveLength(0);
  });

  it("listDue returns schedules where nextFireAt <= now", async () => {
    const past = Date.now() - 1000;
    const future = Date.now() + 86_400_000;
    await store.create(1, { ...SAMPLE_SCHEDULE, nextFireAt: past });
    await store.create(1, { ...SAMPLE_SCHEDULE, nextFireAt: future });
    const due = await store.listDue(Date.now());
    expect(due).toHaveLength(1);
  });

  it("listDue excludes disabled schedules", async () => {
    await store.create(1, { ...SAMPLE_SCHEDULE, nextFireAt: Date.now() - 1000, enabled: false });
    expect(await store.listDue(Date.now())).toHaveLength(0);
  });

  it("markFired updates lastFiredAt and nextFireAt", async () => {
    const s = await store.create(1, { ...SAMPLE_SCHEDULE, nextFireAt: Date.now() - 1000 });
    const newNext = Date.now() + 604_800_000;
    await store.markFired(s.id, Date.now(), newNext);
    const updated = await store.get(s.id);
    expect(updated?.lastFiredAt).not.toBeNull();
    expect(updated?.nextFireAt).toBeGreaterThan(Date.now());
  });
});
