/*
 * Module/Script Name: rankrocketQuestionOptions.test.ts
 * Path: tests/server/storage/rankrocketQuestionOptions.test.ts
 *
 * Description:
 * Tests for RankrocketQuestionOptionStore - CRUD over the "What do you
 * want to know about this site?" dropdown options on the RankRocket
 * Site Insights card, previously a hardcoded RANKROCKET_QUESTION_OPTIONS
 * const array (shared/schema.ts).
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-17
 * Last Modified Date: 2026-08-17
 * Comments:
 * - v1.00 RankRocket Site Insights admin CRUD, Part C
 */

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { SCHEMA_SQL } from "../../../server/storage";
import { RankrocketQuestionOptionStore } from "../../../server/storage/rankrocketQuestionOptionStore";

function makeDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(SCHEMA_SQL);
  return drizzle(sqlite);
}

describe("RankrocketQuestionOptionStore", () => {
  let db: ReturnType<typeof makeDb>;
  let store: RankrocketQuestionOptionStore;

  beforeEach(() => {
    db = makeDb();
    store = new RankrocketQuestionOptionStore(db);
  });

  it("seedDefaults inserts all 8 original options when the table is empty", async () => {
    await store.seedDefaults();
    const list = await store.list();
    expect(list).toHaveLength(8);
    expect(list.map((o) => o.label)).toContain("Broken links across the site");
  });

  it("seedDefaults is idempotent - running twice keeps 8 options", async () => {
    await store.seedDefaults();
    await store.seedDefaults();
    expect(await store.list()).toHaveLength(8);
  });

  it("seedDefaults does not overwrite existing custom data", async () => {
    await store.create({ label: "Custom question" });
    await store.seedDefaults();
    const list = await store.list();
    expect(list.map((o) => o.label)).toContain("Custom question");
  });

  it("list returns options ordered by sortOrder", async () => {
    const b = await store.create({ label: "B" });
    const a = await store.create({ label: "A" });
    await store.update(a.id, { sortOrder: 0 });
    await store.update(b.id, { sortOrder: 1 });
    const list = await store.list();
    expect(list.map((o) => o.label)).toEqual(["A", "B"]);
  });

  it("create auto-assigns the next sortOrder (appends to the end)", async () => {
    const first = await store.create({ label: "First" });
    const second = await store.create({ label: "Second" });
    expect(second.sortOrder).toBeGreaterThan(first.sortOrder);
  });

  it("update changes the label", async () => {
    const created = await store.create({ label: "Old label" });
    const updated = await store.update(created.id, { label: "New label" });
    expect(updated?.label).toBe("New label");
  });

  it("update returns undefined for unknown id", async () => {
    expect(await store.update(9999, { label: "x" })).toBeUndefined();
  });

  it("delete removes an option and returns true", async () => {
    const created = await store.create({ label: "Temp" });
    expect(await store.delete(created.id)).toBe(true);
    expect(await store.list()).toHaveLength(0);
  });

  it("delete returns false for unknown id", async () => {
    expect(await store.delete(9999)).toBe(false);
  });
});
