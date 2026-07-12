/*
 * Module/Script Name: promptMethodologies.test.ts
 * Path: tests/server/storage/promptMethodologies.test.ts
 *
 * Description:
 * PromptMethodologyStore tests: seeded YLG methodology v1.0 (approved
 * 2026-07-12), idempotent seeding, active-version lookup.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-12
 * Last Modified Date: 2026-07-12
 * Comments:
 * - v1.00 YLG foundation sprint initial implementation
 */

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { SCHEMA_SQL } from "../../../server/storage";
import { PromptMethodologyStore } from "../../../server/storage/promptMethodologyStore";

function makeDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(SCHEMA_SQL);
  return drizzle(sqlite);
}

describe("PromptMethodologyStore", () => {
  let store: PromptMethodologyStore;

  beforeEach(() => {
    store = new PromptMethodologyStore(makeDb());
  });

  it("seedDefaults inserts methodology 1.0 with the approved YLG panel quotas", async () => {
    await store.seedDefaults();
    const m = await store.getByVersion("1.0");
    expect(m).toBeDefined();
    expect(m!.status).toBe("active");
    expect(m!.quotas.panelSize).toBe(30);
    expect(m!.quotas.nonBranded).toBe(24);
    expect(m!.quotas.branded).toBe(6);
    expect(m!.quotas.intentQuotas).toEqual({
      provider_recommendation: 8,
      service_specific: 6,
      problem_solution: 5,
      geographic_discovery: 5,
      comparison: 3,
      brand_validation: 3,
    });
    expect(m!.quotas.replicates).toEqual({ nonBranded: 3, branded: 1 });
    expect(m!.quotas.cadence).toEqual({ full: "monthly", sentinel: "weekly", sentinelSize: 8 });
  });

  it("seedDefaults is idempotent - running twice keeps a single methodology row", async () => {
    await store.seedDefaults();
    await store.seedDefaults();
    const list = await store.list();
    expect(list).toHaveLength(1);
  });

  it("getActive returns the seeded active methodology", async () => {
    await store.seedDefaults();
    const active = await store.getActive();
    expect(active?.version).toBe("1.0");
    expect(active?.status).toBe("active");
  });

  it("getActive returns undefined on an unseeded table", async () => {
    expect(await store.getActive()).toBeUndefined();
  });

  it("getByVersion returns undefined for unknown versions", async () => {
    await store.seedDefaults();
    expect(await store.getByVersion("9.9")).toBeUndefined();
  });
});
