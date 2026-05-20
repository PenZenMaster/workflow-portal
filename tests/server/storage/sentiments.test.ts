import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { SCHEMA_SQL } from "../../../server/storage";
import { SentimentStore } from "../../../server/storage/sentimentStore";
import { AnnotationStore } from "../../../server/storage/annotationStore";
import { ExportStore } from "../../../server/storage/exportStore";

function makeDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(SCHEMA_SQL);
  return drizzle(sqlite);
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
  let store: SentimentStore;

  beforeEach(() => { store = new SentimentStore(makeDb()); });

  it("creates a sentiment record", async () => {
    const s = await store.create(SAMPLE_SENTIMENT);
    expect(s.id).toBeTypeOf("number");
    expect(s.label).toBe("positive");
    expect(s.facetLabels).toEqual(["trust", "quality"]);
    expect(s.confidence).toBe(0.8);
  });

  it("lists sentiment by response", async () => {
    await store.create(SAMPLE_SENTIMENT);
    await store.create({ ...SAMPLE_SENTIMENT, responseId: 99 }); // different response
    expect(await store.listByResponse(1)).toHaveLength(1);
    expect(await store.listByResponse(99)).toHaveLength(1);
  });

  it("getReviewQueue returns only low-confidence unreviewed items", async () => {
    await store.create({ ...SAMPLE_SENTIMENT, confidence: 0.9 }); // high confidence — not in queue
    await store.create({ ...SAMPLE_SENTIMENT, responseId: 2, confidence: 0.4 }); // low — in queue
    const queue = await store.getReviewQueue(1);
    expect(queue).toHaveLength(1);
    expect(queue[0].confidence).toBe(0.4);
  });

  it("getReviewQueue excludes items with an override", async () => {
    const s = await store.create({ ...SAMPLE_SENTIMENT, responseId: 3, confidence: 0.4 });
    await store.override(s.id, "neutral", 42);
    const queue = await store.getReviewQueue(1);
    expect(queue.find((q) => q.id === s.id)).toBeUndefined();
  });

  it("override updates label and reviewed fields", async () => {
    const s = await store.create({ ...SAMPLE_SENTIMENT, confidence: 0.4 });
    await store.override(s.id, "neutral", 42);
    const list = await store.listByResponse(1);
    expect(list[0].overrideLabel).toBe("neutral");
    expect(list[0].reviewedByUserId).toBe(42);
    expect(list[0].reviewedAt).toBeTypeOf("number");
  });

  it("deletes sentiment by responseId", async () => {
    await store.create(SAMPLE_SENTIMENT);
    await store.deleteByResponse(1);
    expect(await store.listByResponse(1)).toHaveLength(0);
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
