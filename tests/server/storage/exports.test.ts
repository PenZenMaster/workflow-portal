import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { SCHEMA_SQL } from "../../../server/storage";
import { ExportStore } from "../../../server/storage/exportStore";

function makeDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(SCHEMA_SQL);
  return drizzle(sqlite);
}

const SAMPLE = {
  clientId: 1,
  kind: "csv-executive" as const,
  periodStart: "2026-07-01",
  periodEnd: "2026-07-31",
  requestedByUserId: 1,
};

describe("ExportStore", () => {
  let store: ExportStore;

  beforeEach(() => {
    store = new ExportStore(makeDb());
  });

  // B-24 sequence item 4 (Admin Alerts): needs every failed export across
  // all clients, not just one client's - same global-scan gap as
  // IntegrationStore.listByStatus.
  describe("listByStatus", () => {
    it("returns exports across all clients matching the given status", async () => {
      const a = await store.create(SAMPLE);
      const b = await store.create({ ...SAMPLE, clientId: 2 });
      await store.create({ ...SAMPLE, clientId: 3 }); // stays queued

      await store.updateStatus(a.id, "failed", { lastError: "disk full" });
      await store.updateStatus(b.id, "failed", { lastError: "timeout" });

      const failed = await store.listByStatus("failed");
      expect(failed.map((e) => e.id).sort()).toEqual([a.id, b.id].sort());
      expect(failed.every((e) => e.status === "failed")).toBe(true);
    });

    it("respects the limit parameter", async () => {
      const a = await store.create(SAMPLE);
      const b = await store.create({ ...SAMPLE, clientId: 2 });
      await store.updateStatus(a.id, "failed");
      await store.updateStatus(b.id, "failed");

      const failed = await store.listByStatus("failed", 1);
      expect(failed).toHaveLength(1);
    });

    it("returns an empty array when nothing matches the status", async () => {
      await store.create(SAMPLE);
      const failed = await store.listByStatus("failed");
      expect(failed).toEqual([]);
    });
  });
});
