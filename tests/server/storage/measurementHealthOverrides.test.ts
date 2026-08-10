/*
 * Module/Script Name: measurementHealthOverrides.test.ts
 * Path: tests/server/storage/measurementHealthOverrides.test.ts
 *
 * Description:
 * MeasurementHealthOverrideStore tests: get/set (upsert)/clear for the
 * issue #30 slice 5b admin override (record a reason, override a
 * computed measurement-health status).
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-10
 * Last Modified Date: 2026-08-10
 * Comments:
 * - v1.00 issue #30 slice 5b
 */

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { SCHEMA_SQL } from "../../../server/storage";
import { MeasurementHealthOverrideStore } from "../../../server/storage/measurementHealthOverrideStore";

function makeDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(SCHEMA_SQL);
  return drizzle(sqlite);
}

describe("MeasurementHealthOverrideStore", () => {
  let store: MeasurementHealthOverrideStore;

  beforeEach(() => {
    store = new MeasurementHealthOverrideStore(makeDb());
  });

  it("returns undefined when no override exists for a run", async () => {
    expect(await store.getByRunId(5)).toBeUndefined();
  });

  it("set creates a new override with the given status, reason, and user", async () => {
    const override = await store.set(5, "healthy", "confirmed transient provider outage", 7);
    expect(override.runId).toBe(5);
    expect(override.status).toBe("healthy");
    expect(override.reason).toBe("confirmed transient provider outage");
    expect(override.overriddenByUserId).toBe(7);
    expect(override.createdAt).toBeTypeOf("number");

    const fetched = await store.getByRunId(5);
    expect(fetched).toEqual(override);
  });

  it("set upserts - calling again for the same run replaces the existing override", async () => {
    await store.set(5, "degraded", "first reason", 7);
    const updated = await store.set(5, "healthy", "corrected after investigation", 9);

    expect(updated.status).toBe("healthy");
    expect(updated.reason).toBe("corrected after investigation");
    expect(updated.overriddenByUserId).toBe(9);

    const all = await store.getByRunId(5);
    expect(all).toEqual(updated);
  });

  it("clear removes an override and returns true", async () => {
    await store.set(5, "degraded", "reason", 7);
    expect(await store.clear(5)).toBe(true);
    expect(await store.getByRunId(5)).toBeUndefined();
  });

  it("clear returns false when there was no override to remove", async () => {
    expect(await store.clear(999)).toBe(false);
  });

  it("scopes overrides independently per run", async () => {
    await store.set(5, "degraded", "reason A", 7);
    await store.set(6, "healthy", "reason B", 7);

    expect((await store.getByRunId(5))?.status).toBe("degraded");
    expect((await store.getByRunId(6))?.status).toBe("healthy");
  });
});
