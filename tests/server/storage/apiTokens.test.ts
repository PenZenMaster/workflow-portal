import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { SCHEMA_SQL } from "../../../server/storage";
import { ApiTokenStore } from "../../../server/storage/apiTokenStore";

function makeDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(SCHEMA_SQL);
  return drizzle(sqlite);
}

const SAMPLE = {
  clientId: 4,
  name: "Reporting Suite",
  tokenHash: "hash-a",
  tokenPrefix: "wfp_abc123",
  expiresAt: Date.now() + 86_400_000,
  createdByUserId: 1,
};

describe("ApiTokenStore", () => {
  let store: ApiTokenStore;

  beforeEach(() => {
    store = new ApiTokenStore(makeDb());
  });

  it("creates a token that is unrevoked and never used", async () => {
    const t = await store.create(SAMPLE);
    expect(t.id).toBeGreaterThan(0);
    expect(t.revokedAt).toBeNull();
    expect(t.lastUsedAt).toBeNull();
    expect(t.createdAt).toBeGreaterThan(0);
    expect(t.clientId).toBe(4);
  });

  it("finds a token by hash and returns undefined for an unknown hash", async () => {
    const t = await store.create(SAMPLE);
    expect((await store.findByHash("hash-a"))?.id).toBe(t.id);
    expect(await store.findByHash("nope")).toBeUndefined();
  });

  it("rejects a duplicate hash", async () => {
    await store.create(SAMPLE);
    await expect(store.create(SAMPLE)).rejects.toThrow();
  });

  it("lists only the given client's tokens, newest first", async () => {
    const first = await store.create(SAMPLE);
    const second = await store.create({ ...SAMPLE, tokenHash: "hash-b" });
    await store.create({ ...SAMPLE, clientId: 9, tokenHash: "hash-c" });
    const list = await store.listByClient(4);
    expect(list.map((t) => t.id)).toEqual([second.id, first.id]);
  });

  it("revokes a token only for the matching client", async () => {
    const t = await store.create(SAMPLE);
    expect(await store.revoke(t.id, 9)).toBe(false);
    expect((await store.findByHash("hash-a"))?.revokedAt).toBeNull();
    expect(await store.revoke(t.id, 4)).toBe(true);
    expect((await store.findByHash("hash-a"))?.revokedAt).not.toBeNull();
  });

  it("does not re-revoke an already revoked token", async () => {
    const t = await store.create(SAMPLE);
    expect(await store.revoke(t.id, 4)).toBe(true);
    expect(await store.revoke(t.id, 4)).toBe(false);
  });

  it("records last-used time", async () => {
    const t = await store.create(SAMPLE);
    await store.touchLastUsed(t.id, 12345);
    expect((await store.findByHash("hash-a"))?.lastUsedAt).toBe(12345);
  });

  it("deletes all of a client's tokens", async () => {
    await store.create(SAMPLE);
    await store.create({ ...SAMPLE, clientId: 9, tokenHash: "hash-c" });
    await store.deleteByClient(4);
    expect(await store.listByClient(4)).toHaveLength(0);
    expect(await store.listByClient(9)).toHaveLength(1);
  });
});
