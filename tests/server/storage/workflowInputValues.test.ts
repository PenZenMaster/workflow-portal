/*
 * Module/Script Name: workflowInputValues.test.ts
 * Path: tests/server/storage/workflowInputValues.test.ts
 *
 * Description:
 * Tests for the workflow input value store (B-23): per-workflow persistence
 * of last-used launch input values keyed by input label.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-03
 * Last Modified Date: 2026-07-03
 * Comments:
 * - v1.00 Initial tests (launch-input persistence feature)
 */

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { SCHEMA_SQL } from "../../../server/storage";
import { WorkflowInputValueStore } from "../../../server/storage/workflowInputValueStore";

function makeDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(SCHEMA_SQL);
  return drizzle(sqlite);
}

describe("WorkflowInputValueStore", () => {
  let store: WorkflowInputValueStore;

  beforeEach(() => {
    store = new WorkflowInputValueStore(makeDb());
  });

  it("returns an empty map for a workflow with no saved values", async () => {
    expect(await store.getByWorkflow(1)).toEqual({});
  });

  it("round-trips saved values keyed by label", async () => {
    await store.upsertMany(1, {
      "Service Area": "Nashville, TN",
      "RankMath REST Bridge Base URL": "https://client.com/wp-json",
    });
    expect(await store.getByWorkflow(1)).toEqual({
      "Service Area": "Nashville, TN",
      "RankMath REST Bridge Base URL": "https://client.com/wp-json",
    });
  });

  it("overwrites an existing value for the same label", async () => {
    await store.upsertMany(1, { "Service Area": "Nashville, TN" });
    await store.upsertMany(1, { "Service Area": "Franklin, TN" });
    expect(await store.getByWorkflow(1)).toEqual({ "Service Area": "Franklin, TN" });
  });

  it("skips blank values and keeps the previously saved one", async () => {
    await store.upsertMany(1, { "Service Area": "Nashville, TN" });
    await store.upsertMany(1, { "Service Area": "   ", "Core Services": "Landscaping" });
    expect(await store.getByWorkflow(1)).toEqual({
      "Service Area": "Nashville, TN",
      "Core Services": "Landscaping",
    });
  });

  it("keeps values isolated per workflow", async () => {
    await store.upsertMany(1, { "Service Area": "Nashville, TN" });
    await store.upsertMany(2, { "Service Area": "Dallas, TX" });
    expect(await store.getByWorkflow(1)).toEqual({ "Service Area": "Nashville, TN" });
    expect(await store.getByWorkflow(2)).toEqual({ "Service Area": "Dallas, TX" });
  });
});
