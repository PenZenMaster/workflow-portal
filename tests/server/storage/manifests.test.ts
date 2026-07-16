/*
 * Module/Script Name: manifests.test.ts
 * Path: tests/server/storage/manifests.test.ts
 *
 * Description:
 * ManifestStore tests (issue #3 Epic 2 slice E2a): create/read round
 * trip and one-manifest-per-run immutability.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-15
 * Last Modified Date: 2026-07-15
 * Comments:
 * - v1.00 E2a initial implementation
 */

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { SCHEMA_SQL } from "../../../server/storage";
import { ManifestStore } from "../../../server/storage/manifestStore";

function makeDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(SCHEMA_SQL);
  return drizzle(sqlite);
}

const SAMPLE = {
  runId: 99,
  clientId: 10,
  collectionId: 5,
  purpose: "ad_hoc" as const,
  methodologyVersion: "1.0",
  panelVersion: "3",
  scoringVersion: "1.0",
  parserVersion: "1.0",
  classifierVersion: "rules-1.0",
  platformIds: [1, 2],
  promptCount: 2,
  replicateCount: 1,
  expectedResponseCount: 4,
  configSnapshot: JSON.stringify({ prompts: [], brands: [] }),
  configHash: "abc123",
};

describe("ManifestStore", () => {
  let store: ManifestStore;

  beforeEach(() => {
    store = new ManifestStore(makeDb());
  });

  it("creates a manifest and reads it back by run id", async () => {
    const created = await store.create(SAMPLE);
    expect(created.id).toBeTypeOf("number");
    expect(created.createdAt).toBeTypeOf("number");

    const fetched = await store.getByRunId(99);
    expect(fetched?.runId).toBe(99);
    expect(fetched?.purpose).toBe("ad_hoc");
    expect(fetched?.platformIds).toEqual([1, 2]);
    expect(fetched?.configHash).toBe("abc123");
    expect(fetched?.methodologyVersion).toBe("1.0");
  });

  it("returns undefined for a run without a manifest", async () => {
    expect(await store.getByRunId(12345)).toBeUndefined();
  });

  it("enforces one manifest per run (immutable — second create throws)", async () => {
    await store.create(SAMPLE);
    await expect(store.create({ ...SAMPLE, configHash: "different" })).rejects.toThrow();
  });
});
