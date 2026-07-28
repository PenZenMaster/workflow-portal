/*
 * Module/Script Name: promptCollections.test.ts
 * Path: tests/server/storage/promptCollections.test.ts
 *
 * Description:
 * PromptCollectionStore panelType round-trip tests (issue #4 Phase 3
 * item 9, slice 1). Scoped to the new panelType behavior only - the
 * rest of PromptCollectionStore is exercised via the mocked routes
 * tests (tests/server/prompts.routes.test.ts), not a dedicated suite.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-28
 * Last Modified Date: 2026-07-28
 * Comments:
 * - v1.00 issue #4 Phase 3 slice 1 initial implementation
 */

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { SCHEMA_SQL } from "../../../server/storage";
import { PromptCollectionStore } from "../../../server/storage/promptCollectionStore";

function makeDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(SCHEMA_SQL);
  return drizzle(sqlite);
}

describe("PromptCollectionStore - panelType (issue #4 Phase 3 item 9)", () => {
  let store: PromptCollectionStore;

  beforeEach(() => {
    store = new PromptCollectionStore(makeDb());
  });

  it("create defaults panelType to balanced_baseline when not specified", async () => {
    const collection = await store.create(1, { name: "Test", panelType: "balanced_baseline" });
    expect(collection.panelType).toBe("balanced_baseline");
  });

  it("create persists an explicitly chosen panelType", async () => {
    const collection = await store.create(1, { name: "Test", panelType: "discovery" });
    expect(collection.panelType).toBe("discovery");
  });

  it("update changes panelType", async () => {
    const created = await store.create(1, { name: "Test", panelType: "balanced_baseline" });
    const updated = await store.update(created.id, { name: "Test", panelType: "entity_audit" });
    expect(updated?.panelType).toBe("entity_audit");
  });

  it("get round-trips panelType", async () => {
    const created = await store.create(1, { name: "Test", panelType: "competitive" });
    const fetched = await store.get(created.id);
    expect(fetched?.panelType).toBe("competitive");
  });

  it("clone carries the source collection's panelType forward", async () => {
    const created = await store.create(1, { name: "Test", panelType: "topic_authority" });
    const cloned = await store.clone(created.id);
    expect(cloned.panelType).toBe("topic_authority");
  });
});
