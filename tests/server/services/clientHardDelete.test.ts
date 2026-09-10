import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { SCHEMA_SQL } from "../../../server/storage";
import {
  clients,
  brands,
  brandAliases,
  competitors,
  clientUsers,
  promptCollections,
  prompts,
  promptGenerationRuns,
  promptRuns,
  responsesRaw,
  responseSentiment,
  responseMentions,
  responseCitations,
  responseRecommendations,
  measurementRunManifests,
  measurementHealthOverrides,
  integrations,
  reportExports,
  metricSnapshotsDaily,
  growthPlanRuns,
  runSchedules,
  factoryJobs,
  annotations,
  shareTokens,
} from "../../../shared/schema";
import { hardDeleteClient } from "../../../server/services/clientHardDelete";

function makeDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(SCHEMA_SQL);
  return drizzle(sqlite);
}

type Db = ReturnType<typeof makeDb>;

function insertClient(db: Db, name: string, archived: boolean) {
  const now = Date.now();
  const row = db
    .insert(clients)
    .values({
      name,
      primaryDomain: `${name.toLowerCase().replace(/\s+/g, "")}.com`,
      createdAt: now,
      updatedAt: now,
      deletedAt: archived ? now : null,
    })
    .returning()
    .get();
  return row.id;
}

/** Seeds one full chain of related rows for a client, across every cascaded table. */
function seedFullChain(db: Db, clientId: number) {
  const now = Date.now();

  const brandId = db
    .insert(brands)
    .values({ clientId, canonicalName: "Acme", kind: "client", createdAt: now })
    .returning()
    .get().id;
  db.insert(brandAliases).values({ brandId, aliasText: "Acme Corp" }).run();
  db.insert(competitors).values({ clientId, brandId, priority: 0 }).run();
  db.insert(clientUsers).values({ clientId, userId: 1, createdAt: now }).run();
  db.insert(integrations).values({ clientId, kind: "ga4", createdAt: now, updatedAt: now }).run();
  const exportId = db
    .insert(reportExports)
    .values({ clientId, periodStart: "2026-01-01", periodEnd: "2026-01-31", createdAt: now, updatedAt: now })
    .returning()
    .get().id;
  db.insert(metricSnapshotsDaily).values({ clientId, dateIso: "2026-01-01" }).run();
  db.insert(growthPlanRuns).values({ clientId, inputHash: "h1", markdown: "plan", createdAt: now }).run();

  const collectionId = db
    .insert(promptCollections)
    .values({ clientId, name: "Collection A", createdAt: now, updatedAt: now })
    .returning()
    .get().id;
  db.insert(runSchedules).values({
    clientId,
    collectionId,
    hourUtc: 0,
    nextFireAt: now,
    createdAt: now,
    updatedAt: now,
  }).run();
  const promptId = db
    .insert(prompts)
    .values({ collectionId, text: "best widget provider", createdAt: now, updatedAt: now })
    .returning()
    .get().id;
  db.insert(promptGenerationRuns).values({
    clientId,
    collectionId,
    requestedCount: 1,
    adapterSlug: "openai",
    methodologyVersion: "1.0",
    rawOutput: "[]",
    createdAt: now,
  }).run();

  const runId = db
    .insert(promptRuns)
    .values({ clientId, collectionId, batchId: "batch-1", createdAt: now, updatedAt: now })
    .returning()
    .get().id;
  db.insert(measurementRunManifests).values({
    runId,
    clientId,
    collectionId,
    methodologyVersion: "1.0",
    scoringVersion: "1.0",
    parserVersion: "1.0",
    classifierVersion: "1.0",
    promptCount: 1,
    expectedResponseCount: 1,
    configSnapshot: "{}",
    configHash: "h1",
    createdAt: now,
  }).run();
  db.insert(measurementHealthOverrides).values({
    runId,
    status: "healthy",
    reason: "manual override",
    overriddenByUserId: 1,
    createdAt: now,
    updatedAt: now,
  }).run();

  const responseId = db
    .insert(responsesRaw)
    .values({ runId, promptId, platformId: 1, queryText: "best widget provider", capturedAt: now })
    .returning()
    .get().id;
  db.insert(responseSentiment).values({ responseId, brandId, createdAt: now }).run();
  db.insert(responseMentions).values({ responseId, brandId, matchedText: "Acme" }).run();
  db.insert(responseCitations).values({ responseId, url: "https://acme.com", rootDomain: "acme.com", position: 1 }).run();
  db.insert(responseRecommendations).values({
    responseId,
    brandId,
    status: "recommended",
    classifierVersion: "1.0",
  }).run();
  db.insert(factoryJobs).values({
    jobId: `job-${clientId}`,
    clientId,
    contractVersion: "1.0",
    jobType: "location_page",
    createdAt: now,
    updatedAt: now,
  }).run();

  // Polymorphic tables
  db.insert(annotations).values({
    scopeKind: "client",
    scopeId: clientId,
    authorUserId: 1,
    body: "client-scoped note",
    createdAt: now,
    updatedAt: now,
  }).run();
  db.insert(annotations).values({
    scopeKind: "run",
    scopeId: runId,
    authorUserId: 1,
    body: "run-scoped note",
    createdAt: now,
    updatedAt: now,
  }).run();
  db.insert(annotations).values({
    scopeKind: "prompt",
    scopeId: promptId,
    authorUserId: 1,
    body: "prompt-scoped note",
    createdAt: now,
    updatedAt: now,
  }).run();
  db.insert(annotations).values({
    scopeKind: "response",
    scopeId: responseId,
    authorUserId: 1,
    body: "response-scoped note",
    createdAt: now,
    updatedAt: now,
  }).run();
  db.insert(shareTokens).values({
    kind: "export",
    resourceId: exportId,
    tokenHash: `hash-${clientId}`,
    expiresAt: now + 1000,
    createdByUserId: 1,
    createdAt: now,
  }).run();

  return { brandId, collectionId, promptId, runId, responseId, exportId };
}

function countAll(db: Db) {
  return {
    clients: db.select().from(clients).all().length,
    brands: db.select().from(brands).all().length,
    brandAliases: db.select().from(brandAliases).all().length,
    competitors: db.select().from(competitors).all().length,
    clientUsers: db.select().from(clientUsers).all().length,
    integrations: db.select().from(integrations).all().length,
    reportExports: db.select().from(reportExports).all().length,
    metricSnapshotsDaily: db.select().from(metricSnapshotsDaily).all().length,
    growthPlanRuns: db.select().from(growthPlanRuns).all().length,
    promptCollections: db.select().from(promptCollections).all().length,
    runSchedules: db.select().from(runSchedules).all().length,
    prompts: db.select().from(prompts).all().length,
    promptGenerationRuns: db.select().from(promptGenerationRuns).all().length,
    promptRuns: db.select().from(promptRuns).all().length,
    measurementRunManifests: db.select().from(measurementRunManifests).all().length,
    measurementHealthOverrides: db.select().from(measurementHealthOverrides).all().length,
    responsesRaw: db.select().from(responsesRaw).all().length,
    responseSentiment: db.select().from(responseSentiment).all().length,
    responseMentions: db.select().from(responseMentions).all().length,
    responseCitations: db.select().from(responseCitations).all().length,
    responseRecommendations: db.select().from(responseRecommendations).all().length,
    factoryJobs: db.select().from(factoryJobs).all().length,
    annotations: db.select().from(annotations).all().length,
    shareTokens: db.select().from(shareTokens).all().length,
  };
}

describe("hardDeleteClient", () => {
  let db: Db;

  beforeEach(() => {
    db = makeDb();
  });

  it("returns false when the client does not exist", () => {
    expect(hardDeleteClient(db, 9999)).toBe(false);
  });

  it("returns false when the client exists but is not archived", () => {
    const clientId = insertClient(db, "Active Co", false);
    expect(hardDeleteClient(db, clientId)).toBe(false);
    expect(db.select().from(clients).where(eq(clients.id, clientId)).get()).toBeDefined();
  });

  it("deletes an archived client with no related data", () => {
    const clientId = insertClient(db, "Empty Co", true);
    expect(hardDeleteClient(db, clientId)).toBe(true);
    expect(db.select().from(clients).all()).toHaveLength(0);
  });

  it("cascades every dependent table to zero for a fully-seeded archived client", () => {
    const clientId = insertClient(db, "Full Co", true);
    seedFullChain(db, clientId);

    expect(hardDeleteClient(db, clientId)).toBe(true);

    const counts = countAll(db);
    for (const [table, count] of Object.entries(counts)) {
      expect(count, `expected ${table} to be empty after hard delete`).toBe(0);
    }
  });

  it("does not touch a different client's data", () => {
    const targetId = insertClient(db, "Target Co", true);
    seedFullChain(db, targetId);

    const otherId = insertClient(db, "Other Co", false);
    seedFullChain(db, otherId);

    expect(hardDeleteClient(db, targetId)).toBe(true);

    expect(db.select().from(clients).where(eq(clients.id, otherId)).get()).toBeDefined();
    expect(db.select().from(brands).where(eq(brands.clientId, otherId)).all()).toHaveLength(1);
    expect(db.select().from(annotations).all()).toHaveLength(4);
    expect(db.select().from(shareTokens).all()).toHaveLength(1);
  });
});
