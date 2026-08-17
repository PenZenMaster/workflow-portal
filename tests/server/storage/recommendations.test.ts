/*
 * Module/Script Name: recommendations.test.ts
 * Path: tests/server/storage/recommendations.test.ts
 *
 * Description:
 * RecommendationStore tests: round-trips, re-parse idempotency via
 * deleteByResponse, human override retaining the machine result, and
 * the cross-client isolation regression check (same leak pattern that
 * bit mentionStore/citationStore/sentimentStore).
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-12
 * Last Modified Date: 2026-07-12
 * Comments:
 * - v1.00 YLG classifier sprint initial implementation
 */

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { SCHEMA_SQL } from "../../../server/storage";
import { RecommendationStore } from "../../../server/storage/recommendationStore";
import { RunStore } from "../../../server/storage/runStore";
import { ResponseStore } from "../../../server/storage/responseStore";

function makeDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(SCHEMA_SQL);
  return drizzle(sqlite);
}

describe("RecommendationStore", () => {
  let db: ReturnType<typeof makeDb>;
  let store: RecommendationStore;
  let runStore: RunStore;
  let responseStore: ResponseStore;

  beforeEach(() => {
    db = makeDb();
    store = new RecommendationStore(db);
    runStore = new RunStore(db);
    responseStore = new ResponseStore(db);
  });

  async function seedResponse(clientId: number): Promise<number> {
    const run = await runStore.create({
      clientId,
      collectionId: 1,
      batchId: `batch-${clientId}`,
      totalPrompts: 1,
      triggeredBy: "manual",
    });
    const resp = await responseStore.create({
      runId: run.id,
      promptId: 1,
      platformId: 1,
      queryText: "who is the best plumber",
    });
    return resp.id;
  }

  const SAMPLE = {
    brandId: 1,
    status: "first_choice" as const,
    rank: 1,
    confidence: 0.9,
    evidenceExcerpt: "1. Acme Plumbing - top pick",
    classifierVersion: "rules-1.0",
  };

  it("bulkCreate + listByResponse round-trips a classification", async () => {
    const responseId = await seedResponse(1);
    await store.bulkCreate([{ ...SAMPLE, responseId }]);

    const list = await store.listByResponse(responseId);
    expect(list).toHaveLength(1);
    expect(list[0].status).toBe("first_choice");
    expect(list[0].rank).toBe(1);
    expect(list[0].confidence).toBe(0.9);
    expect(list[0].classifierVersion).toBe("rules-1.0");
    expect(list[0].humanStatus).toBeNull();
  });

  it("deleteByResponse clears prior classifications for re-parse idempotency", async () => {
    const responseId = await seedResponse(1);
    await store.bulkCreate([{ ...SAMPLE, responseId }]);
    await store.deleteByResponse(responseId);
    expect(await store.listByResponse(responseId)).toEqual([]);
  });

  it("setHumanStatus records the override without destroying the machine result", async () => {
    const responseId = await seedResponse(1);
    const [rec] = await store.bulkCreate([{ ...SAMPLE, responseId }]);

    const updated = await store.setHumanStatus(rec.id, "listed_option", 7);

    expect(updated?.status).toBe("first_choice"); // machine result retained
    expect(updated?.humanStatus).toBe("listed_option");
    expect(updated?.humanUserId).toBe(7);
    expect(updated?.humanAt).toBeTypeOf("number");
  });

  it("setHumanStatus returns undefined for an unknown id", async () => {
    expect(await store.setHumanStatus(9999, "recommended", 7)).toBeUndefined();
  });

  // TD-23: bulkCreate can carry a pre-existing human override straight
  // through on insert, so the parse-response handler can restore an
  // override onto a freshly recreated row without a second UPDATE call
  // (and without stamping a new humanAt on every re-parse).
  it("bulkCreate persists a carried-over human override when provided", async () => {
    const responseId = await seedResponse(1);
    const [rec] = await store.bulkCreate([
      { ...SAMPLE, responseId, humanStatus: "listed_option", humanUserId: 7, humanAt: 1700000000000 },
    ]);

    expect(rec.status).toBe("first_choice"); // machine result unaffected
    expect(rec.humanStatus).toBe("listed_option");
    expect(rec.humanUserId).toBe(7);
    expect(rec.humanAt).toBe(1700000000000);

    const fetched = await store.listByResponse(responseId);
    expect(fetched[0].humanStatus).toBe("listed_option");
    expect(fetched[0].humanUserId).toBe(7);
    expect(fetched[0].humanAt).toBe(1700000000000);
  });

  it("bulkCreate defaults the override fields to null when not provided", async () => {
    const responseId = await seedResponse(1);
    const [rec] = await store.bulkCreate([{ ...SAMPLE, responseId }]);

    expect(rec.humanStatus).toBeNull();
    expect(rec.humanUserId).toBeNull();
    expect(rec.humanAt).toBeNull();
  });

  it("listByClient returns only recommendations belonging to that client's runs", async () => {
    const responseA = await seedResponse(1);
    const responseB = await seedResponse(2);
    await store.bulkCreate([{ ...SAMPLE, responseId: responseA }]);
    await store.bulkCreate([
      { ...SAMPLE, brandId: 2, status: "recommended" as const, rank: null, responseId: responseB },
    ]);

    const listA = await store.listByClient(1);
    expect(listA).toHaveLength(1);
    expect(listA[0].responseId).toBe(responseA);

    const listB = await store.listByClient(2);
    expect(listB).toHaveLength(1);
    expect(listB[0].status).toBe("recommended");
  });
});
