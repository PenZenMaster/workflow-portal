/*
 * Module/Script Name: promptMethodologies.test.ts
 * Path: tests/server/storage/promptMethodologies.test.ts
 *
 * Description:
 * PromptMethodologyStore tests: seeded YLG methodology v1.0 (approved
 * 2026-07-12, now retired) and v2.0 (issue #4 Phase 1 slice 6 re-lock,
 * active), idempotent seeding, active-version lookup, and generic
 * version activation.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-12
 * Last Modified Date: 2026-07-23
 * Comments:
 * - v1.00 YLG foundation sprint initial implementation
 * - v1.01 issue #4 Phase 1 slice 6: methodology v2.0 re-lock + activateVersion
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

  it("seedDefaults inserts methodology 1.0, now retired, with its original approved YLG panel quotas preserved for historical snapshots", async () => {
    await store.seedDefaults();
    const m = await store.getByVersion("1.0");
    expect(m).toBeDefined();
    expect(m!.status).toBe("retired");
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

  it("seedDefaults inserts methodology 2.0, active, covering all 9 canonical intents", async () => {
    await store.seedDefaults();
    const m = await store.getByVersion("2.0");
    expect(m).toBeDefined();
    expect(m!.status).toBe("active");
    expect(m!.quotas.panelSize).toBe(30);
    expect(m!.quotas.nonBranded).toBe(24);
    expect(m!.quotas.branded).toBe(6);
    expect(m!.quotas.intentQuotas).toEqual({
      provider_recommendation: 7,
      service_specific: 5,
      problem_solution: 4,
      geographic_discovery: 4,
      educational: 4,
      trust_validation: 2,
      comparison: 2,
      brand_validation: 1,
      alternative: 1,
    });
    const total = Object.values(m!.quotas.intentQuotas).reduce((a, b) => a + b, 0);
    expect(total).toBe(30);
    expect(m!.quotas.replicates).toEqual({ nonBranded: 3, branded: 1 });
    expect(m!.quotas.cadence).toEqual({ full: "monthly", sentinel: "weekly", sentinelSize: 8 });
  });

  it("seedDefaults is idempotent - running twice keeps exactly one row per version", async () => {
    await store.seedDefaults();
    await store.seedDefaults();
    const list = await store.list();
    expect(list).toHaveLength(2);
    expect(list.filter((m) => m.status === "active")).toHaveLength(1);
  });

  it("getActive returns methodology 2.0 after seeding", async () => {
    await store.seedDefaults();
    const active = await store.getActive();
    expect(active?.version).toBe("2.0");
    expect(active?.status).toBe("active");
  });

  it("getActive returns undefined on an unseeded table", async () => {
    expect(await store.getActive()).toBeUndefined();
  });

  it("getByVersion returns undefined for unknown versions", async () => {
    await store.seedDefaults();
    expect(await store.getByVersion("9.9")).toBeUndefined();
  });

  describe("activateVersion", () => {
    it("switches which methodology is active, retiring the previously active one", async () => {
      await store.seedDefaults(); // 2.0 active, 1.0 retired

      const activated = await store.activateVersion("1.0");
      expect(activated?.version).toBe("1.0");
      expect(activated?.status).toBe("active");

      const v1 = await store.getByVersion("1.0");
      const v2 = await store.getByVersion("2.0");
      expect(v1?.status).toBe("active");
      expect(v2?.status).toBe("retired");
      expect((await store.getActive())?.version).toBe("1.0");
    });

    it("is reversible - reactivating 2.0 retires 1.0 again", async () => {
      await store.seedDefaults();
      await store.activateVersion("1.0");
      await store.activateVersion("2.0");

      expect((await store.getActive())?.version).toBe("2.0");
      expect((await store.getByVersion("1.0"))?.status).toBe("retired");
    });

    it("returns undefined for an unknown version and leaves the active version unchanged", async () => {
      await store.seedDefaults();
      const result = await store.activateVersion("9.9");
      expect(result).toBeUndefined();
      expect((await store.getActive())?.version).toBe("2.0");
    });
  });
});
