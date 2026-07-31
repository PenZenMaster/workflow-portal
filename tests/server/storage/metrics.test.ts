import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { brands, prompts, responsesRaw, responseMentions, responseCitations, platforms } from "@shared/schema";
import { SCHEMA_SQL } from "../../../server/storage";
import { MentionStore } from "../../../server/storage/mentionStore";
import { CitationStore } from "../../../server/storage/citationStore";
import { MetricStore } from "../../../server/storage/metricStore";
import { RunStore } from "../../../server/storage/runStore";
import { ResponseStore } from "../../../server/storage/responseStore";
import { RecommendationStore } from "../../../server/storage/recommendationStore";

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

  it("persists and hydrates the source class", async () => {
    const c = await store.create({
      responseId: 4,
      url: "https://yelp.com/biz/acme",
      rootDomain: "yelp.com",
      ownedByBrandId: null,
      position: 1,
      isTrustedThirdParty: false,
      sourceClass: "review_platform",
    });
    expect(c.sourceClass).toBe("review_platform");
    const [fetched] = await store.listByResponse(4);
    expect(fetched.sourceClass).toBe("review_platform");
  });

  it("defaults the source class to unknown_or_low_trust when omitted", async () => {
    const c = await store.create({
      responseId: 5,
      url: "https://legacy.net/page",
      rootDomain: "legacy.net",
      ownedByBrandId: null,
      position: 1,
      isTrustedThirdParty: false,
    });
    expect(c.sourceClass).toBe("unknown_or_low_trust");
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

// ---------------------------------------------------------------------------
// TD-24: snapshot-delta period metrics assume cumulative history is
// monotonic; re-parses and brand pruning shrink it, producing SoV > 100%.
// aggregateLiveForPeriod computes period totals from the raw tables, so
// client mentions are a subset of all-brand mentions by construction.
describe("MetricStore.aggregateLiveForPeriod (TD-24)", () => {
  const WIDE_FROM = "2000-01-01";
  const WIDE_TO = "2100-01-01";

  async function seed() {
    const db = makeDb();
    const store = new MetricStore(db);
    const runStore = new RunStore(db);
    const responseStore = new ResponseStore(db);
    const mentionStore = new MentionStore(db);

    const now = Date.now();
    db.insert(brands).values([
      { id: 10, clientId: 1, canonicalName: "Acme", kind: "client", createdAt: now },
      { id: 11, clientId: 1, canonicalName: "Rival", kind: "competitor", createdAt: now },
      { id: 20, clientId: 2, canonicalName: "Other Co", kind: "client", createdAt: now },
    ]).run();

    const run = await runStore.create({ clientId: 1, collectionId: 1, batchId: "b1", totalPrompts: 5, triggeredBy: "manual" });
    const runOther = await runStore.create({ clientId: 2, collectionId: 2, batchId: "b2", totalPrompts: 1, triggeredBy: "manual" });

    async function completeResponse(runId: number): Promise<number> {
      const r = await responseStore.create({ runId, promptId: 100, platformId: 1, queryText: "q" });
      await responseStore.updateResult(r.id, { status: "complete", responseText: "text" });
      return r.id;
    }

    return { db, store, mentionStore, responseStore, run, runOther, completeResponse };
  }

  it("computes mention totals from raw rows, staying consistent when history shrinks", async () => {
    const { db, store, mentionStore, run, completeResponse } = await seed();
    const resp1 = await completeResponse(run.id);
    const resp2 = await completeResponse(run.id);
    await completeResponse(run.id); // no mentions

    await mentionStore.create({ responseId: resp1, brandId: 10, matchedText: "Acme", matchType: "exact", section: "summary", confidence: 1 });
    await mentionStore.create({ responseId: resp1, brandId: 10, matchedText: "Acme", matchType: "exact", section: "body", confidence: 1 });
    await mentionStore.create({ responseId: resp1, brandId: 11, matchedText: "Rival", matchType: "exact", section: "body", confidence: 1 });
    await mentionStore.create({ responseId: resp2, brandId: 11, matchedText: "Rival", matchType: "exact", section: "body", confidence: 1 });

    const agg = await store.aggregateLiveForPeriod(1, WIDE_FROM, WIDE_TO);
    expect(agg.totalResponses).toBe(3);
    expect(agg.totalAllBrandMentions).toBe(4);
    expect(agg.totalClientBrandMentions).toBe(2);
    expect(agg.totalMentions).toBe(1); // only resp1 mentions the client

    // Simulate the 2026-07-15 history rewrite: competitor mention rows
    // vanish (brand pruning + re-parse). The live aggregate must stay
    // internally consistent — client can never exceed all-brand.
    db.delete(responseMentions).where(eq(responseMentions.brandId, 11)).run();

    const after = await store.aggregateLiveForPeriod(1, WIDE_FROM, WIDE_TO);
    expect(after.totalAllBrandMentions).toBe(2);
    expect(after.totalClientBrandMentions).toBe(2);
    expect(after.totalClientBrandMentions).toBeLessThanOrEqual(after.totalAllBrandMentions);
  });

  it("counts citation responses and recomputes the visibility score (M+S+R+C+T)", async () => {
    const { db, store, mentionStore, run, completeResponse } = await seed();
    const resp = await completeResponse(run.id);

    // Client mention in the summary at rank 1 (M=1, S=2, R=3), a
    // client-owned citation (C=2), and a trusted third-party source (T=1).
    await mentionStore.create({ responseId: resp, brandId: 10, matchedText: "Acme", matchType: "exact", section: "summary", recommendationRank: 1, confidence: 1 });
    db.insert(responseCitations).values([
      { responseId: resp, url: "https://acme.com/about", rootDomain: "acme.com", ownedByBrandId: 10, position: 1, isTrustedThirdParty: 0 },
      { responseId: resp, url: "https://trusted.org/review", rootDomain: "trusted.org", ownedByBrandId: null, position: 2, isTrustedThirdParty: 1 },
    ]).run();

    const agg = await store.aggregateLiveForPeriod(1, WIDE_FROM, WIDE_TO);
    expect(agg.totalCitations).toBe(1);
    expect(agg.totalMentions).toBe(1);
    expect(agg.totalVisibilityScore).toBe(9);
  });

  it("filters responses by capturedAt within the period window", async () => {
    const { db, store, mentionStore, run, completeResponse } = await seed();
    const inWindow = await completeResponse(run.id);
    const outOfWindow = await completeResponse(run.id);

    db.update(responsesRaw).set({ capturedAt: Date.parse("2026-01-15T12:00:00.000Z") }).where(eq(responsesRaw.id, inWindow)).run();
    db.update(responsesRaw).set({ capturedAt: Date.parse("2026-03-01T12:00:00.000Z") }).where(eq(responsesRaw.id, outOfWindow)).run();
    await mentionStore.create({ responseId: inWindow, brandId: 10, matchedText: "Acme", matchType: "exact", section: "body", confidence: 1 });
    await mentionStore.create({ responseId: outOfWindow, brandId: 10, matchedText: "Acme", matchType: "exact", section: "body", confidence: 1 });

    const agg = await store.aggregateLiveForPeriod(1, "2026-01-01", "2026-01-31");
    expect(agg.totalResponses).toBe(1);
    expect(agg.totalClientBrandMentions).toBe(1);
    expect(agg.totalAllBrandMentions).toBe(1);
  });

  it("excludes responses that are not complete", async () => {
    const { store, responseStore, run, completeResponse } = await seed();
    await completeResponse(run.id);
    const queued = await responseStore.create({ runId: run.id, promptId: 100, platformId: 1, queryText: "q" });
    await responseStore.updateResult(queued.id, { status: "failed", errorMessage: "boom" });

    const agg = await store.aggregateLiveForPeriod(1, WIDE_FROM, WIDE_TO);
    expect(agg.totalResponses).toBe(1);
  });

  it("never mixes another client's data into the aggregate", async () => {
    const { store, mentionStore, runOther, completeResponse } = await seed();
    const other = await completeResponse(runOther.id);
    await mentionStore.create({ responseId: other, brandId: 20, matchedText: "Other Co", matchType: "exact", section: "body", confidence: 1 });

    const agg = await store.aggregateLiveForPeriod(1, WIDE_FROM, WIDE_TO);
    expect(agg.totalResponses).toBe(0);
    expect(agg.totalAllBrandMentions).toBe(0);
  });

  it("returns zeros for a client with no responses", async () => {
    const { store } = await seed();
    const agg = await store.aggregateLiveForPeriod(3, WIDE_FROM, WIDE_TO);
    expect(agg).toEqual({
      totalCitations: 0,
      totalMentions: 0,
      totalAllBrandMentions: 0,
      totalClientBrandMentions: 0,
      totalVisibilityScore: 0,
      totalResponses: 0,
      totalAllCitations: 0,
      totalClientOwnedCitations: 0,
      totalCompetitorOwnedCitations: 0,
      totalTrustedResponses: 0,
    });
  });

  // Epic 5 (issue #29) slice 4: citation-ownership share and trusted-
  // third-party support totals, definitions locked 2026-07-31.
  it("counts citation-ownership and trust totals across all responses", async () => {
    const { db, store, mentionStore, run, completeResponse } = await seed();
    const resp1 = await completeResponse(run.id);
    const resp2 = await completeResponse(run.id);
    await mentionStore.create({ responseId: resp1, brandId: 10, matchedText: "Acme", matchType: "exact", section: "body", confidence: 1 });

    db.insert(responseCitations).values([
      // resp1: one client-owned + one trusted third-party citation
      { responseId: resp1, url: "https://acme.com/about", rootDomain: "acme.com", ownedByBrandId: 10, position: 1, isTrustedThirdParty: 0 },
      { responseId: resp1, url: "https://trusted.org/review", rootDomain: "trusted.org", ownedByBrandId: null, position: 2, isTrustedThirdParty: 1 },
      // resp2: one competitor-owned + one unrelated (unowned, untrusted)
      { responseId: resp2, url: "https://rival.com", rootDomain: "rival.com", ownedByBrandId: 11, position: 1, isTrustedThirdParty: 0 },
      { responseId: resp2, url: "https://randomblog.com", rootDomain: "randomblog.com", ownedByBrandId: null, position: 2, isTrustedThirdParty: 0 },
    ]).run();

    const agg = await store.aggregateLiveForPeriod(1, WIDE_FROM, WIDE_TO);
    expect(agg.totalAllCitations).toBe(4);
    expect(agg.totalClientOwnedCitations).toBe(1);
    expect(agg.totalCompetitorOwnedCitations).toBe(1);
    expect(agg.totalTrustedResponses).toBe(1); // only resp1 has a trusted citation
  });
});

// ---------------------------------------------------------------------------
// Epic 5 (issue #29) slice 1: platform-level breakdown of the live aggregate,
// plus the two combined-rollup methods (response-weighted = pooled totals,
// platform-balanced = unweighted mean of each platform's own rate).
describe("MetricStore.aggregateLiveForPeriodByPlatform (Epic 5 slice 1)", () => {
  const WIDE_FROM = "2000-01-01";
  const WIDE_TO = "2100-01-01";

  async function seed() {
    const db = makeDb();
    const store = new MetricStore(db);
    const runStore = new RunStore(db);
    const responseStore = new ResponseStore(db);
    const mentionStore = new MentionStore(db);

    const now = Date.now();
    db.insert(brands).values([
      { id: 10, clientId: 1, canonicalName: "Acme", kind: "client", createdAt: now },
      { id: 11, clientId: 1, canonicalName: "Rival", kind: "competitor", createdAt: now },
    ]).run();
    db.insert(platforms).values([
      { id: 1, slug: "perplexity", displayName: "Perplexity" },
      { id: 4, slug: "anthropic", displayName: "Claude" },
    ]).run();

    const run = await runStore.create({ clientId: 1, collectionId: 1, batchId: "b1", totalPrompts: 5, triggeredBy: "manual" });

    async function completeResponse(platformId: number): Promise<number> {
      const r = await responseStore.create({ runId: run.id, promptId: 100, platformId, queryText: "q" });
      await responseStore.updateResult(r.id, { status: "complete", responseText: "text" });
      return r.id;
    }

    return { db, store, mentionStore, run, completeResponse };
  }

  it("groups the aggregate by platform, one entry per platform with completed responses in period", async () => {
    const { store, mentionStore, completeResponse } = await seed();
    const p1a = await completeResponse(1);
    const p1b = await completeResponse(1);
    const p4a = await completeResponse(4);
    void p1b;

    await mentionStore.create({ responseId: p1a, brandId: 10, matchedText: "Acme", matchType: "exact", section: "body", confidence: 1 });
    await mentionStore.create({ responseId: p4a, brandId: 10, matchedText: "Acme", matchType: "exact", section: "body", confidence: 1 });

    const byPlatform = await store.aggregateLiveForPeriodByPlatform(1, WIDE_FROM, WIDE_TO);
    expect(byPlatform).toHaveLength(2);

    const perplexity = byPlatform.find((p) => p.platformId === 1)!;
    expect(perplexity.slug).toBe("perplexity");
    expect(perplexity.displayName).toBe("Perplexity");
    expect(perplexity.totalResponses).toBe(2);
    expect(perplexity.totalClientBrandMentions).toBe(1);

    const anthropic = byPlatform.find((p) => p.platformId === 4)!;
    expect(anthropic.totalResponses).toBe(1);
    expect(anthropic.totalClientBrandMentions).toBe(1);
  });

  it("excludes a platform with zero completed responses in the period, rather than reporting a 0% sample", async () => {
    const { store, completeResponse } = await seed();
    await completeResponse(1); // platform 4 never used

    const byPlatform = await store.aggregateLiveForPeriodByPlatform(1, WIDE_FROM, WIDE_TO);
    expect(byPlatform.map((p) => p.platformId)).toEqual([1]);
  });

  it("sums back to the same totals as the pooled aggregateLiveForPeriod (response-weighted equivalence)", async () => {
    const { store, mentionStore, completeResponse } = await seed();
    const p1a = await completeResponse(1);
    const p1b = await completeResponse(1);
    const p4a = await completeResponse(4);
    await mentionStore.create({ responseId: p1a, brandId: 10, matchedText: "Acme", matchType: "exact", section: "body", confidence: 1 });
    await mentionStore.create({ responseId: p1b, brandId: 11, matchedText: "Rival", matchType: "exact", section: "body", confidence: 1 });
    await mentionStore.create({ responseId: p4a, brandId: 11, matchedText: "Rival", matchType: "exact", section: "body", confidence: 1 });

    const byPlatform = await store.aggregateLiveForPeriodByPlatform(1, WIDE_FROM, WIDE_TO);
    const pooled = await store.aggregateLiveForPeriod(1, WIDE_FROM, WIDE_TO);

    const summed = byPlatform.reduce(
      (acc, p) => ({
        totalCitations: acc.totalCitations + p.totalCitations,
        totalMentions: acc.totalMentions + p.totalMentions,
        totalAllBrandMentions: acc.totalAllBrandMentions + p.totalAllBrandMentions,
        totalClientBrandMentions: acc.totalClientBrandMentions + p.totalClientBrandMentions,
        totalVisibilityScore: acc.totalVisibilityScore + p.totalVisibilityScore,
        totalResponses: acc.totalResponses + p.totalResponses,
        totalAllCitations: acc.totalAllCitations + p.totalAllCitations,
        totalClientOwnedCitations: acc.totalClientOwnedCitations + p.totalClientOwnedCitations,
        totalCompetitorOwnedCitations: acc.totalCompetitorOwnedCitations + p.totalCompetitorOwnedCitations,
        totalTrustedResponses: acc.totalTrustedResponses + p.totalTrustedResponses,
      }),
      {
        totalCitations: 0, totalMentions: 0, totalAllBrandMentions: 0, totalClientBrandMentions: 0,
        totalVisibilityScore: 0, totalResponses: 0,
        totalAllCitations: 0, totalClientOwnedCitations: 0, totalCompetitorOwnedCitations: 0, totalTrustedResponses: 0,
      }
    );
    expect(summed).toEqual(pooled);
  });

  it("never mixes another client's data into any platform's bucket", async () => {
    const { db, store, completeResponse } = await seed();
    const runStore = new RunStore(db);
    const responseStore = new ResponseStore(db);
    db.insert(brands).values([{ id: 20, clientId: 2, canonicalName: "Other Co", kind: "client", createdAt: Date.now() }]).run();
    const runOther = await runStore.create({ clientId: 2, collectionId: 2, batchId: "b2", totalPrompts: 1, triggeredBy: "manual" });
    const other = await responseStore.create({ runId: runOther.id, promptId: 200, platformId: 1, queryText: "q" });
    await responseStore.updateResult(other.id, { status: "complete", responseText: "text" });

    await completeResponse(1);
    const byPlatform = await store.aggregateLiveForPeriodByPlatform(1, WIDE_FROM, WIDE_TO);
    expect(byPlatform.find((p) => p.platformId === 1)!.totalResponses).toBe(1);
  });

  it("returns an empty array for a client with no responses", async () => {
    const { store } = await seed();
    const byPlatform = await store.aggregateLiveForPeriodByPlatform(3, WIDE_FROM, WIDE_TO);
    expect(byPlatform).toEqual([]);
  });

  // Epic 5 (issue #29) slice 4: citation-ownership share and trusted-
  // third-party support totals, per platform.
  it("counts citation-ownership and trust totals per platform", async () => {
    const { db, store, completeResponse } = await seed();
    const p1 = await completeResponse(1);
    const p4 = await completeResponse(4);

    db.insert(responseCitations).values([
      { responseId: p1, url: "https://acme.com", rootDomain: "acme.com", ownedByBrandId: 10, position: 1, isTrustedThirdParty: 0 },
      { responseId: p1, url: "https://trusted.org", rootDomain: "trusted.org", ownedByBrandId: null, position: 2, isTrustedThirdParty: 1 },
      { responseId: p4, url: "https://rival.com", rootDomain: "rival.com", ownedByBrandId: 11, position: 1, isTrustedThirdParty: 0 },
    ]).run();

    const byPlatform = await store.aggregateLiveForPeriodByPlatform(1, WIDE_FROM, WIDE_TO);
    const perplexity = byPlatform.find((p) => p.platformId === 1)!;
    const anthropic = byPlatform.find((p) => p.platformId === 4)!;
    expect(perplexity.totalAllCitations).toBe(2);
    expect(perplexity.totalClientOwnedCitations).toBe(1);
    expect(perplexity.totalTrustedResponses).toBe(1);
    expect(anthropic.totalAllCitations).toBe(1);
    expect(anthropic.totalCompetitorOwnedCitations).toBe(1);
  });
});

// ---------------------------------------------------------------------------
describe("MetricStore.aggregateNonBranded", () => {
  const WIDE_FROM = "2000-01-01";
  const WIDE_TO = "2100-01-01";
  const CLASSIFIER = "rules-1.0";

  // One client (id 1) with a client brand and a competitor brand, plus a
  // second client (id 2) whose data must never leak into client 1's numbers.
  async function seed() {
    const db = makeDb();
    const store = new MetricStore(db);
    const runStore = new RunStore(db);
    const responseStore = new ResponseStore(db);
    const mentionStore = new MentionStore(db);
    const recStore = new RecommendationStore(db);

    const now = Date.now();
    db.insert(brands).values([
      { id: 10, clientId: 1, canonicalName: "Acme", kind: "client", createdAt: now },
      { id: 11, clientId: 1, canonicalName: "Rival", kind: "competitor", createdAt: now },
      { id: 20, clientId: 2, canonicalName: "Other Co", kind: "client", createdAt: now },
    ]).run();
    db.insert(prompts).values([
      { id: 100, collectionId: 1, text: "best metal shop near me", brandContext: "unbranded", createdAt: now, updatedAt: now },
      { id: 101, collectionId: 1, text: "tell me about Acme", brandContext: "client_branded", createdAt: now, updatedAt: now },
      { id: 102, collectionId: 1, text: "legacy prompt", brandContext: null, createdAt: now, updatedAt: now },
      { id: 103, collectionId: 1, text: "what about Rival instead", brandContext: "competitor_branded", createdAt: now, updatedAt: now },
    ]).run();

    const run = await runStore.create({ clientId: 1, collectionId: 1, batchId: "b1", totalPrompts: 3, triggeredBy: "manual" });
    const runOther = await runStore.create({ clientId: 2, collectionId: 2, batchId: "b2", totalPrompts: 1, triggeredBy: "manual" });

    async function completeResponse(runId: number, promptId: number): Promise<number> {
      const r = await responseStore.create({ runId, promptId, platformId: 1, queryText: "q" });
      await responseStore.updateResult(r.id, { status: "complete", responseText: "text" });
      return r.id;
    }

    return { db, store, mentionStore, recStore, run, runOther, completeResponse };
  }

  it("counts only complete responses whose prompt is deterministically unbranded; competitor-only and unclassified prompts are excluded", async () => {
    const { store, run, runOther, completeResponse } = await seed();
    await completeResponse(run.id, 100); // unbranded
    await completeResponse(run.id, 100); // unbranded
    await completeResponse(run.id, 101); // client_branded — excluded
    await completeResponse(run.id, 102); // brandContext unclassified (null) — excluded
    await completeResponse(run.id, 103); // competitor_branded — excluded (wrongly counted under the old brandInPrompt=0 model)
    await completeResponse(runOther.id, 100); // other client — ignored entirely

    const agg = await store.aggregateNonBranded(1, WIDE_FROM, WIDE_TO);
    expect(agg.nonBrandedResponses).toBe(2);
  });

  it("counts distinct non-branded responses mentioning the client brand, ignoring competitor-only mentions", async () => {
    const { store, mentionStore, run, completeResponse } = await seed();
    const withClient = await completeResponse(run.id, 100);
    const withCompetitor = await completeResponse(run.id, 100);
    const branded = await completeResponse(run.id, 101);

    // two mentions on one response must count once
    await mentionStore.create({ responseId: withClient, brandId: 10, matchedText: "Acme", matchType: "exact", section: "summary", confidence: 1 });
    await mentionStore.create({ responseId: withClient, brandId: 10, matchedText: "Acme", matchType: "exact", section: "body", confidence: 1 });
    await mentionStore.create({ responseId: withCompetitor, brandId: 11, matchedText: "Rival", matchType: "exact", section: "body", confidence: 1 });
    // client mention on a branded response must not count
    await mentionStore.create({ responseId: branded, brandId: 10, matchedText: "Acme", matchType: "exact", section: "body", confidence: 1 });

    const agg = await store.aggregateNonBranded(1, WIDE_FROM, WIDE_TO);
    expect(agg.nonBrandedResponses).toBe(2);
    expect(agg.mentionedNonBranded).toBe(1);
  });

  it("counts recommendations at recommended-and-up with the human override taking precedence", async () => {
    const { store, recStore, run, completeResponse } = await seed();
    const r1 = await completeResponse(run.id, 100);
    const r2 = await completeResponse(run.id, 100);
    const r3 = await completeResponse(run.id, 100);

    // r1: machine says listed_option (not counted) — human upgrades to first_choice (counted)
    const [rec1] = await recStore.bulkCreate([{ responseId: r1, brandId: 10, status: "listed_option", confidence: 0.7, classifierVersion: CLASSIFIER }]);
    await recStore.setHumanStatus(rec1.id, "first_choice", 1);
    // r2: machine says recommended (counted) — human downgrades to incidental_mention (not counted)
    const [rec2] = await recStore.bulkCreate([{ responseId: r2, brandId: 10, status: "recommended", confidence: 0.7, classifierVersion: CLASSIFIER }]);
    await recStore.setHumanStatus(rec2.id, "incidental_mention", 1);
    // r3: machine listed_option, no override (not counted)
    await recStore.bulkCreate([{ responseId: r3, brandId: 10, status: "listed_option", confidence: 0.7, classifierVersion: CLASSIFIER }]);

    const agg = await store.aggregateNonBranded(1, WIDE_FROM, WIDE_TO);
    expect(agg.recommendedNonBranded).toBe(1);
    expect(agg.clientRecommended).toBe(1);
  });

  // Epic 5 (issue #29) slice 3: Strong Recommendation Rate / First Choice
  // Rate / rank distribution inputs, definitions locked 2026-07-31.
  it("counts strongRecommendedNonBranded as strongly_recommended-and-up, excluding plain recommended", async () => {
    const { store, recStore, run, completeResponse } = await seed();
    const r1 = await completeResponse(run.id, 100); // strongly_recommended — counted
    const r2 = await completeResponse(run.id, 100); // first_choice — counted
    const r3 = await completeResponse(run.id, 100); // recommended — NOT counted

    await recStore.bulkCreate([{ responseId: r1, brandId: 10, status: "strongly_recommended", confidence: 0.8, classifierVersion: CLASSIFIER }]);
    await recStore.bulkCreate([{ responseId: r2, brandId: 10, status: "first_choice", confidence: 0.9, classifierVersion: CLASSIFIER }]);
    await recStore.bulkCreate([{ responseId: r3, brandId: 10, status: "recommended", confidence: 0.7, classifierVersion: CLASSIFIER }]);

    const agg = await store.aggregateNonBranded(1, WIDE_FROM, WIDE_TO);
    expect(agg.strongRecommendedNonBranded).toBe(2);
    expect(agg.firstChoiceNonBranded).toBe(1);
  });

  it("respects the human override for strong/first-choice counts, same as recommendedNonBranded", async () => {
    const { store, recStore, run, completeResponse } = await seed();
    const r1 = await completeResponse(run.id, 100);
    const [rec1] = await recStore.bulkCreate([{ responseId: r1, brandId: 10, status: "listed_option", confidence: 0.7, classifierVersion: CLASSIFIER }]);
    await recStore.setHumanStatus(rec1.id, "first_choice", 1);

    const agg = await store.aggregateNonBranded(1, WIDE_FROM, WIDE_TO);
    expect(agg.strongRecommendedNonBranded).toBe(1);
    expect(agg.firstChoiceNonBranded).toBe(1);
  });

  it("collects clientRanks from the client brand's non-branded recommendation rows, omitting nulls", async () => {
    const { store, recStore, run, completeResponse } = await seed();
    const r1 = await completeResponse(run.id, 100); // rank 1
    const r2 = await completeResponse(run.id, 100); // rank 3
    const r3 = await completeResponse(run.id, 100); // unranked (prose mention, rank null)

    await recStore.bulkCreate([
      { responseId: r1, brandId: 10, status: "first_choice", rank: 1, confidence: 0.9, classifierVersion: CLASSIFIER },
      { responseId: r2, brandId: 10, status: "listed_option", rank: 3, confidence: 0.9, classifierVersion: CLASSIFIER },
      { responseId: r3, brandId: 10, status: "recommended", rank: null, confidence: 0.7, classifierVersion: CLASSIFIER },
    ]);

    const agg = await store.aggregateNonBranded(1, WIDE_FROM, WIDE_TO);
    expect(agg.clientRanks.sort()).toEqual([1, 3]);
  });

  it("computes Recommendation SoV inputs across client and competitor brands on non-branded responses", async () => {
    const { store, recStore, run, completeResponse } = await seed();
    const r1 = await completeResponse(run.id, 100);
    const r2 = await completeResponse(run.id, 100);

    await recStore.bulkCreate([
      { responseId: r1, brandId: 10, status: "recommended", confidence: 0.7, classifierVersion: CLASSIFIER },
      { responseId: r1, brandId: 11, status: "strongly_recommended", confidence: 0.8, classifierVersion: CLASSIFIER },
      { responseId: r2, brandId: 11, status: "first_choice", confidence: 0.9, classifierVersion: CLASSIFIER },
      // incidental competitor row must not count toward SoV
      { responseId: r2, brandId: 10, status: "incidental_mention", confidence: 0.6, classifierVersion: CLASSIFIER },
    ]);

    const agg = await store.aggregateNonBranded(1, WIDE_FROM, WIDE_TO);
    expect(agg.clientRecommended).toBe(1);
    expect(agg.allBrandRecommended).toBe(3);
  });

  it("excludes responses captured outside the requested period", async () => {
    const { db, store, run, completeResponse } = await seed();
    const rid = await completeResponse(run.id, 100);
    db.update(responsesRaw)
      .set({ capturedAt: Date.parse("2026-01-15T12:00:00Z") })
      .where(eq(responsesRaw.id, rid))
      .run();

    const inRange = await store.aggregateNonBranded(1, "2026-01-01", "2026-01-31");
    expect(inRange.nonBrandedResponses).toBe(1);
    const outOfRange = await store.aggregateNonBranded(1, "2026-02-01", "2026-02-28");
    expect(outOfRange.nonBrandedResponses).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Epic 5 (issue #29) slice 2: platform breakdown of the non-branded
// aggregate, same shape/philosophy as slice 1's live aggregate breakdown.
describe("MetricStore.aggregateNonBrandedByPlatform (Epic 5 slice 2)", () => {
  const WIDE_FROM = "2000-01-01";
  const WIDE_TO = "2100-01-01";
  const CLASSIFIER = "rules-1.0";

  async function seed() {
    const db = makeDb();
    const store = new MetricStore(db);
    const runStore = new RunStore(db);
    const responseStore = new ResponseStore(db);
    const mentionStore = new MentionStore(db);
    const recStore = new RecommendationStore(db);

    const now = Date.now();
    db.insert(brands).values([
      { id: 10, clientId: 1, canonicalName: "Acme", kind: "client", createdAt: now },
      { id: 11, clientId: 1, canonicalName: "Rival", kind: "competitor", createdAt: now },
    ]).run();
    db.insert(prompts).values([
      { id: 100, collectionId: 1, text: "best metal shop near me", brandContext: "unbranded", createdAt: now, updatedAt: now },
    ]).run();
    db.insert(platforms).values([
      { id: 1, slug: "perplexity", displayName: "Perplexity" },
      { id: 4, slug: "anthropic", displayName: "Claude" },
    ]).run();

    const run = await runStore.create({ clientId: 1, collectionId: 1, batchId: "b1", totalPrompts: 3, triggeredBy: "manual" });

    async function completeResponse(platformId: number): Promise<number> {
      const r = await responseStore.create({ runId: run.id, promptId: 100, platformId, queryText: "q" });
      await responseStore.updateResult(r.id, { status: "complete", responseText: "text" });
      return r.id;
    }

    return { db, store, mentionStore, recStore, run, completeResponse };
  }

  it("groups non-branded counts by platform, one entry per platform with non-branded responses in period", async () => {
    const { store, mentionStore, completeResponse } = await seed();
    const p1a = await completeResponse(1);
    await completeResponse(1);
    const p4a = await completeResponse(4);

    await mentionStore.create({ responseId: p1a, brandId: 10, matchedText: "Acme", matchType: "exact", section: "body", confidence: 1 });
    await mentionStore.create({ responseId: p4a, brandId: 10, matchedText: "Acme", matchType: "exact", section: "body", confidence: 1 });

    const byPlatform = await store.aggregateNonBrandedByPlatform(1, WIDE_FROM, WIDE_TO);
    expect(byPlatform).toHaveLength(2);

    const perplexity = byPlatform.find((p) => p.platformId === 1)!;
    expect(perplexity.slug).toBe("perplexity");
    expect(perplexity.displayName).toBe("Perplexity");
    expect(perplexity.nonBrandedResponses).toBe(2);
    expect(perplexity.mentionedNonBranded).toBe(1);

    const anthropic = byPlatform.find((p) => p.platformId === 4)!;
    expect(anthropic.nonBrandedResponses).toBe(1);
    expect(anthropic.mentionedNonBranded).toBe(1);
  });

  it("excludes a platform with zero non-branded responses in the period", async () => {
    const { store, completeResponse } = await seed();
    await completeResponse(1); // platform 4 unused

    const byPlatform = await store.aggregateNonBrandedByPlatform(1, WIDE_FROM, WIDE_TO);
    expect(byPlatform.map((p) => p.platformId)).toEqual([1]);
  });

  it("counts recommendation rows per platform at recommended-and-up, with human override taking precedence", async () => {
    const { store, recStore, completeResponse } = await seed();
    const p1 = await completeResponse(1);
    const p4 = await completeResponse(4);

    const [rec1] = await recStore.bulkCreate([
      { responseId: p1, brandId: 10, status: "listed_option", confidence: 0.7, classifierVersion: CLASSIFIER },
    ]);
    await recStore.setHumanStatus(rec1.id, "first_choice", 1);
    await recStore.bulkCreate([
      { responseId: p4, brandId: 10, status: "recommended", confidence: 0.7, classifierVersion: CLASSIFIER },
    ]);

    const byPlatform = await store.aggregateNonBrandedByPlatform(1, WIDE_FROM, WIDE_TO);
    expect(byPlatform.find((p) => p.platformId === 1)!.clientRecommended).toBe(1);
    expect(byPlatform.find((p) => p.platformId === 4)!.clientRecommended).toBe(1);
  });

  it("sums back to the same totals as the pooled aggregateNonBranded", async () => {
    const { store, mentionStore, recStore, completeResponse } = await seed();
    const p1 = await completeResponse(1);
    const p4 = await completeResponse(4);
    await mentionStore.create({ responseId: p1, brandId: 10, matchedText: "Acme", matchType: "exact", section: "body", confidence: 1 });
    await recStore.bulkCreate([
      { responseId: p1, brandId: 10, status: "recommended", rank: 2, confidence: 0.7, classifierVersion: CLASSIFIER },
      { responseId: p4, brandId: 11, status: "strongly_recommended", confidence: 0.8, classifierVersion: CLASSIFIER },
    ]);

    const byPlatform = await store.aggregateNonBrandedByPlatform(1, WIDE_FROM, WIDE_TO);
    const pooled = await store.aggregateNonBranded(1, WIDE_FROM, WIDE_TO);

    const summed = byPlatform.reduce(
      (acc, p) => ({
        nonBrandedResponses: acc.nonBrandedResponses + p.nonBrandedResponses,
        mentionedNonBranded: acc.mentionedNonBranded + p.mentionedNonBranded,
        recommendedNonBranded: acc.recommendedNonBranded + p.recommendedNonBranded,
        clientRecommended: acc.clientRecommended + p.clientRecommended,
        allBrandRecommended: acc.allBrandRecommended + p.allBrandRecommended,
        strongRecommendedNonBranded: acc.strongRecommendedNonBranded + p.strongRecommendedNonBranded,
        firstChoiceNonBranded: acc.firstChoiceNonBranded + p.firstChoiceNonBranded,
        clientRanks: [...acc.clientRanks, ...p.clientRanks],
      }),
      {
        nonBrandedResponses: 0, mentionedNonBranded: 0, recommendedNonBranded: 0,
        clientRecommended: 0, allBrandRecommended: 0,
        strongRecommendedNonBranded: 0, firstChoiceNonBranded: 0, clientRanks: [] as number[],
      }
    );
    expect({ ...summed, clientRanks: summed.clientRanks.sort() }).toEqual({ ...pooled, clientRanks: pooled.clientRanks.sort() });
  });

  it("counts strongRecommendedNonBranded/firstChoiceNonBranded per platform", async () => {
    const { store, recStore, completeResponse } = await seed();
    const p1 = await completeResponse(1);
    const p4 = await completeResponse(4);

    await recStore.bulkCreate([{ responseId: p1, brandId: 10, status: "first_choice", rank: 1, confidence: 0.9, classifierVersion: CLASSIFIER }]);
    await recStore.bulkCreate([{ responseId: p4, brandId: 10, status: "recommended", confidence: 0.7, classifierVersion: CLASSIFIER }]);

    const byPlatform = await store.aggregateNonBrandedByPlatform(1, WIDE_FROM, WIDE_TO);
    const perplexity = byPlatform.find((p) => p.platformId === 1)!;
    const anthropic = byPlatform.find((p) => p.platformId === 4)!;
    expect(perplexity.strongRecommendedNonBranded).toBe(1);
    expect(perplexity.firstChoiceNonBranded).toBe(1);
    expect(perplexity.clientRanks).toEqual([1]);
    expect(anthropic.strongRecommendedNonBranded).toBe(0);
    expect(anthropic.firstChoiceNonBranded).toBe(0);
    expect(anthropic.clientRanks).toEqual([]);
  });

  it("returns an empty array for a client with no non-branded responses", async () => {
    const { store } = await seed();
    const byPlatform = await store.aggregateNonBrandedByPlatform(3, WIDE_FROM, WIDE_TO);
    expect(byPlatform).toEqual([]);
  });
});
