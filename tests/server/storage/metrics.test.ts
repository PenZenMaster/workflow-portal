import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { SCHEMA_SQL } from "../../../server/storage";
import { MentionStore } from "../../../server/storage/mentionStore";
import { CitationStore } from "../../../server/storage/citationStore";
import { MetricStore } from "../../../server/storage/metricStore";
import { RunStore } from "../../../server/storage/runStore";
import { ResponseStore } from "../../../server/storage/responseStore";

function makeDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(SCHEMA_SQL);
  return drizzle(sqlite);
}

// ---------------------------------------------------------------------------
describe("MentionStore", () => {
  let store: MentionStore;

  beforeEach(() => { store = new MentionStore(makeDb()); });

  it("creates a mention and retrieves it by response", async () => {
    const m = await store.create({
      responseId: 1,
      brandId: 10,
      matchedText: "Acme Corp",
      matchType: "exact",
      section: "summary",
      recommendationRank: 1,
      confidence: 1.0,
      evidenceExcerpt: "Acme Corp is the best...",
    });
    expect(m.id).toBeTypeOf("number");
    expect(m.brandId).toBe(10);
    expect(m.section).toBe("summary");

    const list = await store.listByResponse(1);
    expect(list).toHaveLength(1);
    expect(list[0].matchedText).toBe("Acme Corp");
  });

  it("returns empty for unknown responseId", async () => {
    expect(await store.listByResponse(9999)).toHaveLength(0);
  });

  it("bulk-creates multiple mentions", async () => {
    await store.bulkCreate([
      { responseId: 1, brandId: 1, matchedText: "Acme", matchType: "exact", section: "body", confidence: 1 },
      { responseId: 1, brandId: 2, matchedText: "Rival", matchType: "exact", section: "list", confidence: 0.9 },
    ]);
    expect(await store.listByResponse(1)).toHaveLength(2);
  });

  it("deletes mentions by responseId", async () => {
    await store.create({ responseId: 5, brandId: 1, matchedText: "A", matchType: "exact", section: "body", confidence: 1 });
    await store.deleteByResponse(5);
    expect(await store.listByResponse(5)).toHaveLength(0);
  });

  it("listByClient returns only mentions belonging to that client's runs", async () => {
    const db = makeDb();
    const mentions = new MentionStore(db);
    const runStore = new RunStore(db);
    const responseStore = new ResponseStore(db);

    const runA = await runStore.create({
      clientId: 1, collectionId: 10, batchId: "batch-a", totalPrompts: 1, triggeredBy: "manual",
    });
    const respA = await responseStore.create({ runId: runA.id, promptId: 100, platformId: 1, queryText: "q" });
    await mentions.create({ responseId: respA.id, brandId: 1, matchedText: "Acme", matchType: "exact", section: "body", confidence: 1 });

    const runB = await runStore.create({
      clientId: 2, collectionId: 20, batchId: "batch-b", totalPrompts: 1, triggeredBy: "manual",
    });
    const respB = await responseStore.create({ runId: runB.id, promptId: 200, platformId: 1, queryText: "q" });
    await mentions.create({ responseId: respB.id, brandId: 2, matchedText: "Rival", matchType: "exact", section: "body", confidence: 1 });

    const list = await mentions.listByClient(1);
    expect(list).toHaveLength(1);
    expect(list[0].matchedText).toBe("Acme");
  });

  it("listByClient returns mentions newest first and honors limit/offset", async () => {
    const db = makeDb();
    const mentions = new MentionStore(db);
    const runStore = new RunStore(db);
    const responseStore = new ResponseStore(db);

    const run = await runStore.create({
      clientId: 1, collectionId: 10, batchId: "batch-a", totalPrompts: 1, triggeredBy: "manual",
    });
    const resp = await responseStore.create({ runId: run.id, promptId: 100, platformId: 1, queryText: "q" });
    const m1 = await mentions.create({ responseId: resp.id, brandId: 1, matchedText: "First", matchType: "exact", section: "body", confidence: 1 });
    const m2 = await mentions.create({ responseId: resp.id, brandId: 1, matchedText: "Second", matchType: "exact", section: "body", confidence: 1 });
    const m3 = await mentions.create({ responseId: resp.id, brandId: 1, matchedText: "Third", matchType: "exact", section: "body", confidence: 1 });

    const all = await mentions.listByClient(1);
    expect(all.map((m) => m.id)).toEqual([m3.id, m2.id, m1.id]);

    const page = await mentions.listByClient(1, { limit: 1, offset: 1 });
    expect(page.map((m) => m.id)).toEqual([m2.id]);
  });

  it("countByClient counts only that client's mentions", async () => {
    const db = makeDb();
    const mentions = new MentionStore(db);
    const runStore = new RunStore(db);
    const responseStore = new ResponseStore(db);

    const runA = await runStore.create({
      clientId: 1, collectionId: 10, batchId: "batch-a", totalPrompts: 1, triggeredBy: "manual",
    });
    const respA = await responseStore.create({ runId: runA.id, promptId: 100, platformId: 1, queryText: "q" });
    await mentions.create({ responseId: respA.id, brandId: 1, matchedText: "Acme", matchType: "exact", section: "body", confidence: 1 });
    await mentions.create({ responseId: respA.id, brandId: 1, matchedText: "Acme Co", matchType: "alias", section: "list", confidence: 0.9 });

    const runB = await runStore.create({
      clientId: 2, collectionId: 20, batchId: "batch-b", totalPrompts: 1, triggeredBy: "manual",
    });
    const respB = await responseStore.create({ runId: runB.id, promptId: 200, platformId: 1, queryText: "q" });
    await mentions.create({ responseId: respB.id, brandId: 2, matchedText: "Rival", matchType: "exact", section: "body", confidence: 1 });

    expect(await mentions.countByClient(1)).toBe(2);
    expect(await mentions.countByClient(2)).toBe(1);
    expect(await mentions.countByClient(999)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe("CitationStore", () => {
  let store: CitationStore;

  beforeEach(() => { store = new CitationStore(makeDb()); });

  it("creates a citation and retrieves it", async () => {
    const c = await store.create({
      responseId: 1,
      url: "https://acme.com/page",
      rootDomain: "acme.com",
      ownedByBrandId: 10,
      position: 1,
      isTrustedThirdParty: false,
    });
    expect(c.rootDomain).toBe("acme.com");
    expect(c.ownedByBrandId).toBe(10);
    expect(c.isTrustedThirdParty).toBe(false);

    const list = await store.listByResponse(1);
    expect(list).toHaveLength(1);
  });

  it("bulk-creates multiple citations", async () => {
    await store.bulkCreate([
      { responseId: 1, url: "https://a.com", rootDomain: "a.com", position: 1, isTrustedThirdParty: false },
      { responseId: 1, url: "https://b.com", rootDomain: "b.com", position: 2, isTrustedThirdParty: true },
    ]);
    const list = await store.listByResponse(1);
    expect(list).toHaveLength(2);
    expect(list[1].isTrustedThirdParty).toBe(true);
  });

  it("deletes citations by responseId", async () => {
    await store.create({ responseId: 3, url: "https://x.com", rootDomain: "x.com", position: 1, isTrustedThirdParty: false });
    await store.deleteByResponse(3);
    expect(await store.listByResponse(3)).toHaveLength(0);
  });

  it("listByClient returns only citations belonging to that client's runs", async () => {
    const db = makeDb();
    const citations = new CitationStore(db);
    const runStore = new RunStore(db);
    const responseStore = new ResponseStore(db);

    const runA = await runStore.create({
      clientId: 1, collectionId: 10, batchId: "batch-a", totalPrompts: 1, triggeredBy: "manual",
    });
    const respA = await responseStore.create({ runId: runA.id, promptId: 100, platformId: 1, queryText: "q" });
    await citations.create({ responseId: respA.id, url: "https://acme.com", rootDomain: "acme.com", position: 1, isTrustedThirdParty: false });

    const runB = await runStore.create({
      clientId: 2, collectionId: 20, batchId: "batch-b", totalPrompts: 1, triggeredBy: "manual",
    });
    const respB = await responseStore.create({ runId: runB.id, promptId: 200, platformId: 1, queryText: "q" });
    await citations.create({ responseId: respB.id, url: "https://rival.com", rootDomain: "rival.com", position: 1, isTrustedThirdParty: false });

    const list = await citations.listByClient(1);
    expect(list).toHaveLength(1);
    expect(list[0].rootDomain).toBe("acme.com");
  });
});

// ---------------------------------------------------------------------------
describe("MetricStore", () => {
  let store: MetricStore;

  beforeEach(() => { store = new MetricStore(makeDb()); });

  const SAMPLE_SNAPSHOT = {
    clientId: 1,
    dateIso: "2026-05-10",
    scopeKind: "overall" as const,
    scopeValue: null,
    citationCount: 5,
    mentionCount: 8,
    allBrandMentions: 20,
    clientBrandMentions: 6,
    visibilityScoreSum: 42.5,
    promptResponseCount: 10,
  };

  it("stores methodologyVersion, defaulting to 1.0 when omitted", async () => {
    const s = await store.upsert(SAMPLE_SNAPSHOT);
    expect(s.methodologyVersion).toBe("1.0");

    const s2 = await store.upsert({ ...SAMPLE_SNAPSHOT, methodologyVersion: "2.0" });
    expect(s2.methodologyVersion).toBe("2.0");
    expect(s2.id).toBe(s.id);
  });

  it("creates a snapshot", async () => {
    const s = await store.upsert(SAMPLE_SNAPSHOT);
    expect(s.citationCount).toBe(5);
    expect(s.mentionCount).toBe(8);
    expect(s.clientBrandMentions).toBe(6);
    expect(s.dateIso).toBe("2026-05-10");
  });

  it("upsert is idempotent — updates existing row for same clientId+dateIso+scope", async () => {
    await store.upsert(SAMPLE_SNAPSHOT);
    await store.upsert({ ...SAMPLE_SNAPSHOT, citationCount: 10 });
    const list = await store.listByClient(1, "2026-01-01", "2026-12-31");
    expect(list).toHaveLength(1);
    expect(list[0].citationCount).toBe(10);
  });

  it("listByClient filters by date range", async () => {
    await store.upsert({ ...SAMPLE_SNAPSHOT, dateIso: "2026-04-01" });
    await store.upsert({ ...SAMPLE_SNAPSHOT, dateIso: "2026-05-10" });
    await store.upsert({ ...SAMPLE_SNAPSHOT, dateIso: "2026-06-01" });

    const list = await store.listByClient(1, "2026-04-15", "2026-05-31");
    expect(list).toHaveLength(1);
    expect(list[0].dateIso).toBe("2026-05-10");
  });

  it("aggregates totals for overview metrics using the latest snapshot in range", async () => {
    await store.upsert({ ...SAMPLE_SNAPSHOT, dateIso: "2026-05-08", mentionCount: 3, promptResponseCount: 5 });
    await store.upsert({ ...SAMPLE_SNAPSHOT, dateIso: "2026-05-09", mentionCount: 5, promptResponseCount: 5 });
    const agg = await store.aggregateForPeriod(1, "2026-05-01", "2026-05-31");
    expect(agg.totalMentions).toBe(5);
    expect(agg.totalResponses).toBe(5);
  });

  it("returns the delta between cumulative snapshots, not a sum across rows", async () => {
    await store.upsert({
      ...SAMPLE_SNAPSHOT,
      dateIso: "2026-05-21",
      citationCount: 8,
      mentionCount: 8,
      allBrandMentions: 0,
      clientBrandMentions: 0,
      visibilityScoreSum: 16,
      promptResponseCount: 10,
    });
    await store.upsert({
      ...SAMPLE_SNAPSHOT,
      dateIso: "2026-06-12",
      citationCount: 16,
      mentionCount: 16,
      allBrandMentions: 8,
      clientBrandMentions: 5,
      visibilityScoreSum: 43,
      promptResponseCount: 20,
    });

    const agg = await store.aggregateForPeriod(1, "2026-05-13", "2026-06-12");
    expect(agg.totalCitations).toBe(16);
    expect(agg.totalMentions).toBe(16);
    expect(agg.totalAllBrandMentions).toBe(8);
    expect(agg.totalClientBrandMentions).toBe(5);
    expect(agg.totalVisibilityScore).toBe(43);
    expect(agg.totalResponses).toBe(20);
  });

  it("subtracts a baseline snapshot from before the period start", async () => {
    await store.upsert({
      ...SAMPLE_SNAPSHOT,
      dateIso: "2026-04-01",
      citationCount: 4,
      mentionCount: 4,
      allBrandMentions: 2,
      clientBrandMentions: 1,
      visibilityScoreSum: 8,
      promptResponseCount: 5,
    });
    await store.upsert({
      ...SAMPLE_SNAPSHOT,
      dateIso: "2026-05-10",
      citationCount: 16,
      mentionCount: 16,
      allBrandMentions: 8,
      clientBrandMentions: 7,
      visibilityScoreSum: 43,
      promptResponseCount: 20,
    });

    const agg = await store.aggregateForPeriod(1, "2026-05-01", "2026-05-31");
    expect(agg.totalCitations).toBe(12);
    expect(agg.totalMentions).toBe(12);
    expect(agg.totalAllBrandMentions).toBe(6);
    expect(agg.totalClientBrandMentions).toBe(6);
    expect(agg.totalVisibilityScore).toBe(35);
    expect(agg.totalResponses).toBe(15);
  });
});
