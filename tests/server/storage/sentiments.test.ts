import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { SCHEMA_SQL } from "../../../server/storage";
import { SentimentStore } from "../../../server/storage/sentimentStore";
import { AnnotationStore } from "../../../server/storage/annotationStore";
import { ExportStore } from "../../../server/storage/exportStore";
import { RunStore } from "../../../server/storage/runStore";
import { ResponseStore } from "../../../server/storage/responseStore";

function makeDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(SCHEMA_SQL);
  return drizzle(sqlite);
}

async function seedResponse(db: ReturnType<typeof makeDb>, clientId: number): Promise<number> {
  const runStore = new RunStore(db);
  const responseStore = new ResponseStore(db);
  const run = await runStore.create({
    clientId, collectionId: 10, batchId: `batch-${clientId}`, totalPrompts: 1, triggeredBy: "manual",
  });
  const resp = await responseStore.create({ runId: run.id, promptId: 100, platformId: 1, queryText: "q" });
  return resp.id;
}

const SAMPLE_SENTIMENT = {
  responseId: 1,
  brandId: 10,
  label: "positive" as const,
  score: 0.75,
  confidence: 0.8,
  evidenceExcerpt: "best trusted agency",
  facetLabels: ["trust", "quality"],
};

const SAMPLE_EXPORT = {
  clientId: 1,
  kind: "csv-executive" as const,
  periodStart: "2026-05-01",
  periodEnd: "2026-05-31",
  requestedByUserId: 1,
};

// ---------------------------------------------------------------------------
describe("SentimentStore", () => {
  let db: ReturnType<typeof makeDb>;
  let store: SentimentStore;

  beforeEach(() => {
    db = makeDb();
    store = new SentimentStore(db);
  });

  it("creates a sentiment record", async () => {
    const responseId = await seedResponse(db, 1);
    const s = await store.create({ ...SAMPLE_SENTIMENT, responseId });
    expect(s.id).toBeTypeOf("number");
    expect(s.label).toBe("positive");
    expect(s.facetLabels).toEqual(["trust", "quality"]);
    expect(s.confidence).toBe(0.8);
  });

  it("lists sentiment by response", async () => {
    const responseId1 = await seedResponse(db, 1);
    const responseId2 = await seedResponse(db, 1);
    await store.create({ ...SAMPLE_SENTIMENT, responseId: responseId1 });
    await store.create({ ...SAMPLE_SENTIMENT, responseId: responseId2 });
    expect(await store.listByResponse(responseId1)).toHaveLength(1);
    expect(await store.listByResponse(responseId2)).toHaveLength(1);
  });

  it("listByClient returns only sentiment belonging to that client's runs", async () => {
    const responseIdClient1 = await seedResponse(db, 1);
    const responseIdClient2 = await seedResponse(db, 2);
    await store.create({ ...SAMPLE_SENTIMENT, responseId: responseIdClient1 });
    await store.create({ ...SAMPLE_SENTIMENT, responseId: responseIdClient2 });

    const list = await store.listByClient(1);
    expect(list).toHaveLength(1);
    expect(list[0].responseId).toBe(responseIdClient1);
  });

  it("getReviewQueue returns only low-confidence unreviewed items for that client", async () => {
    const responseIdClient1 = await seedResponse(db, 1);
    const responseIdClient2 = await seedResponse(db, 2);
    await store.create({ ...SAMPLE_SENTIMENT, responseId: responseIdClient1, confidence: 0.9 }); // high confidence — not in queue
    await store.create({ ...SAMPLE_SENTIMENT, responseId: responseIdClient1, confidence: 0.4 }); // low — in queue
    await store.create({ ...SAMPLE_SENTIMENT, responseId: responseIdClient2, confidence: 0.4 }); // other client — excluded
    const queue = await store.getReviewQueue(1);
    expect(queue).toHaveLength(1);
    expect(queue[0].confidence).toBe(0.4);
    expect(queue[0].responseId).toBe(responseIdClient1);
  });

  it("getReviewQueue excludes items with an override", async () => {
    const responseId = await seedResponse(db, 1);
    const s = await store.create({ ...SAMPLE_SENTIMENT, responseId, confidence: 0.4 });
    await store.override(s.id, "neutral", 42);
    const queue = await store.getReviewQueue(1);
    expect(queue.find((q) => q.id === s.id)).toBeUndefined();
  });

  it("override updates label and reviewed fields", async () => {
    const responseId = await seedResponse(db, 1);
    const s = await store.create({ ...SAMPLE_SENTIMENT, responseId, confidence: 0.4 });
    await store.override(s.id, "neutral", 42);
    const list = await store.listByResponse(responseId);
    expect(list[0].overrideLabel).toBe("neutral");
    expect(list[0].reviewedByUserId).toBe(42);
    expect(list[0].reviewedAt).toBeTypeOf("number");
  });

  it("deletes sentiment by responseId", async () => {
    const responseId = await seedResponse(db, 1);
    await store.create({ ...SAMPLE_SENTIMENT, responseId });
    await store.deleteByResponse(responseId);
    expect(await store.listByResponse(responseId)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe("AnnotationStore", () => {
  let store: AnnotationStore;

  beforeEach(() => { store = new AnnotationStore(makeDb()); });

  it("creates an annotation", async () => {
    const a = await store.create({
      scopeKind: "response",
      scopeId: 1,
      authorUserId: 42,
      body: "This mention looks suspicious.",
      visibility: "internal",
    });
    expect(a.id).toBeTypeOf("number");
    expect(a.body).toBe("This mention looks suspicious.");
  });

  it("lists annotations by scope", async () => {
    await store.create({ scopeKind: "response", scopeId: 1, authorUserId: 1, body: "A", visibility: "internal" });
    await store.create({ scopeKind: "response", scopeId: 1, authorUserId: 1, body: "B", visibility: "internal" });
    await store.create({ scopeKind: "run", scopeId: 1, authorUserId: 1, body: "C", visibility: "internal" });
    const list = await store.listByScope("response", 1);
    expect(list).toHaveLength(2);
  });

  it("deletes an annotation", async () => {
    const a = await store.create({ scopeKind: "client", scopeId: 5, authorUserId: 1, body: "Note", visibility: "internal" });
    expect(await store.delete(a.id)).toBe(true);
    expect(await store.listByScope("client", 5)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe("ExportStore", () => {
  let store: ExportStore;

  beforeEach(() => { store = new ExportStore(makeDb()); });

  it("creates an export record with status queued", async () => {
    const e = await store.create(SAMPLE_EXPORT);
    expect(e.status).toBe("queued");
    expect(e.kind).toBe("csv-executive");
    expect(e.filePath).toBeNull();
  });

  it("lists exports by client", async () => {
    await store.create(SAMPLE_EXPORT);
    await store.create({ ...SAMPLE_EXPORT, kind: "csv-analyst" });
    await store.create({ ...SAMPLE_EXPORT, clientId: 99 }); // different client
    expect(await store.listByClient(1)).toHaveLength(2);
    expect(await store.listByClient(99)).toHaveLength(1);
  });

  it("updateStatus to ready with filePath", async () => {
    const e = await store.create(SAMPLE_EXPORT);
    await store.updateStatus(e.id, "ready", { filePath: "./exports/1.csv" });
    const updated = await store.get(e.id);
    expect(updated?.status).toBe("ready");
    expect(updated?.filePath).toBe("./exports/1.csv");
  });

  it("updateStatus to failed with lastError", async () => {
    const e = await store.create(SAMPLE_EXPORT);
    await store.updateStatus(e.id, "failed", { lastError: "write error" });
    const updated = await store.get(e.id);
    expect(updated?.status).toBe("failed");
    expect(updated?.lastError).toBe("write error");
  });
});
