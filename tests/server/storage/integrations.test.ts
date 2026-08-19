import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { SCHEMA_SQL } from "../../../server/storage";
import { IntegrationStore } from "../../../server/storage/integrationStore";

function makeDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(SCHEMA_SQL);
  return drizzle(sqlite);
}

describe("IntegrationStore", () => {
  let store: IntegrationStore;

  beforeEach(() => {
    store = new IntegrationStore(makeDb());
  });

  // B-24 sequence item 4 (Admin Alerts): the alerts aggregator needs every
  // failing integration across all clients, not just one client's — the
  // existing listByClient can't answer "which clients have a broken GA4
  // connection right now" without an N+1 loop over every client.
  describe("listByStatus", () => {
    it("returns integrations across all clients matching the given status", async () => {
      const a = await store.create(1, { kind: "ga4", config: {} });
      const b = await store.create(2, { kind: "gsc", config: {} });
      await store.create(3, { kind: "ga4", config: {} }); // stays active

      await store.updateStatus(a.id, "failing", { lastError: "token expired" });
      await store.updateStatus(b.id, "failing", { lastError: "quota exceeded" });

      const failing = await store.listByStatus("failing");
      expect(failing.map((i) => i.id).sort()).toEqual([a.id, b.id].sort());
      expect(failing.every((i) => i.status === "failing")).toBe(true);
    });

    it("returns an empty array when nothing matches the status", async () => {
      await store.create(1, { kind: "ga4", config: {} });
      const failing = await store.listByStatus("failing");
      expect(failing).toEqual([]);
    });
  });
});
