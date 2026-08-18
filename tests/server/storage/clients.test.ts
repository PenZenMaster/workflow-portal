import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { SCHEMA_SQL } from "../../../server/storage";
import { ClientStore } from "../../../server/storage/clientStore";
import { BrandStore } from "../../../server/storage/brandStore";
import { AliasStore } from "../../../server/storage/aliasStore";
import { CompetitorStore } from "../../../server/storage/competitorStore";
import { ClientUserStore } from "../../../server/storage/clientUserStore";

function makeDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(SCHEMA_SQL);
  return drizzle(sqlite);
}

const SAMPLE_CLIENT = {
  name: "Acme Corp",
  primaryDomain: "acme.com",
  geographies: ["US", "CA"],
  exclusions: ["Acme Inc"],
};

// ---------------------------------------------------------------------------
describe("ClientStore", () => {
  let store: ClientStore;

  beforeEach(() => {
    store = new ClientStore(makeDb());
  });

  it("returns empty list on fresh DB", async () => {
    expect(await store.list()).toEqual([]);
  });

  it("creates and retrieves a client", async () => {
    const c = await store.create(SAMPLE_CLIENT);
    expect(c.id).toBeTypeOf("number");
    expect(c.name).toBe("Acme Corp");
    expect(c.geographies).toEqual(["US", "CA"]);
    expect(c.exclusions).toEqual(["Acme Inc"]);

    const found = await store.get(c.id);
    expect(found?.name).toBe("Acme Corp");
  });

  it("updates a client", async () => {
    const c = await store.create(SAMPLE_CLIENT);
    const updated = await store.update(c.id, { ...SAMPLE_CLIENT, name: "Acme Updated" });
    expect(updated?.name).toBe("Acme Updated");
  });

  it("round-trips coreServices through create and update", async () => {
    const c = await store.create({
      ...SAMPLE_CLIENT,
      coreServices: ["roof repair", "metal roofing"],
    });
    expect(c.coreServices).toEqual(["roof repair", "metal roofing"]);

    const updated = await store.update(c.id, {
      ...SAMPLE_CLIENT,
      coreServices: ["foundation repair"],
    });
    expect(updated?.coreServices).toEqual(["foundation repair"]);
  });

  it("defaults coreServices to an empty array when omitted", async () => {
    const c = await store.create(SAMPLE_CLIENT);
    expect(c.coreServices).toEqual([]);
  });

  it("returns undefined for unknown id", async () => {
    expect(await store.get(9999)).toBeUndefined();
  });

  it("defaults rankrocketSiteKey to null when omitted", async () => {
    const c = await store.create(SAMPLE_CLIENT);
    expect(c.rankrocketSiteKey).toBeNull();
  });

  it("round-trips rankrocketSiteKey through create and update", async () => {
    const c = await store.create({ ...SAMPLE_CLIENT, rankrocketSiteKey: "tristate-hvac" });
    expect(c.rankrocketSiteKey).toBe("tristate-hvac");

    const updated = await store.update(c.id, { ...SAMPLE_CLIENT, rankrocketSiteKey: "trevoraspiranti" });
    expect(updated?.rankrocketSiteKey).toBe("trevoraspiranti");
  });

  it("returns clients sorted alphabetically by name, case-insensitive", async () => {
    await store.create({ ...SAMPLE_CLIENT, name: "zeta Corp" });
    await store.create({ ...SAMPLE_CLIENT, name: "Acme Corp" });
    await store.create({ ...SAMPLE_CLIENT, name: "mid Co" });

    const names = (await store.list()).map((c) => c.name);
    expect(names).toEqual(["Acme Corp", "mid Co", "zeta Corp"]);
  });

  it("soft-deletes and excludes from list", async () => {
    const c = await store.create(SAMPLE_CLIENT);
    const ok = await store.delete(c.id);
    expect(ok).toBe(true);
    expect(await store.list()).toHaveLength(0);
    expect(await store.get(c.id)).toBeUndefined();
  });

  it("returns false when deleting non-existent id", async () => {
    expect(await store.delete(9999)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe("BrandStore", () => {
  let db: ReturnType<typeof drizzle>;
  let clientStore: ClientStore;
  let brandStore: BrandStore;

  beforeEach(async () => {
    db = makeDb();
    clientStore = new ClientStore(db);
    brandStore = new BrandStore(db);
  });

  it("lists empty for a fresh client", async () => {
    const c = await clientStore.create(SAMPLE_CLIENT);
    expect(await brandStore.listByClient(c.id)).toEqual([]);
  });

  it("creates and retrieves a brand", async () => {
    const c = await clientStore.create(SAMPLE_CLIENT);
    const b = await brandStore.create(c.id, {
      canonicalName: "Acme Corp",
      kind: "client",
      primaryDomain: "acme.com",
    });
    expect(b.id).toBeTypeOf("number");
    expect(b.canonicalName).toBe("Acme Corp");
    expect(b.kind).toBe("client");

    const brands = await brandStore.listByClient(c.id);
    expect(brands).toHaveLength(1);
  });

  it("deletes a brand", async () => {
    const c = await clientStore.create(SAMPLE_CLIENT);
    const b = await brandStore.create(c.id, { canonicalName: "Acme", kind: "client" });
    expect(await brandStore.delete(b.id)).toBe(true);
    expect(await brandStore.listByClient(c.id)).toHaveLength(0);
  });

  it("returns false when deleting non-existent brand", async () => {
    expect(await brandStore.delete(9999)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe("AliasStore", () => {
  let db: ReturnType<typeof drizzle>;
  let clientStore: ClientStore;
  let brandStore: BrandStore;
  let aliasStore: AliasStore;

  beforeEach(async () => {
    db = makeDb();
    clientStore = new ClientStore(db);
    brandStore = new BrandStore(db);
    aliasStore = new AliasStore(db);
  });

  it("lists empty for a fresh brand", async () => {
    const c = await clientStore.create(SAMPLE_CLIENT);
    const b = await brandStore.create(c.id, { canonicalName: "Acme", kind: "client" });
    expect(await aliasStore.listByBrand(b.id)).toEqual([]);
  });

  it("creates an alias and retrieves it", async () => {
    const c = await clientStore.create(SAMPLE_CLIENT);
    const b = await brandStore.create(c.id, { canonicalName: "Acme", kind: "client" });
    const a = await aliasStore.create(b.id, {
      aliasText: "Acme Corp.",
      matchType: "exact",
    });
    expect(a.aliasText).toBe("Acme Corp.");
    expect(a.matchType).toBe("exact");

    expect(await aliasStore.listByBrand(b.id)).toHaveLength(1);
  });

  it("supports fuzzy and regex match types", async () => {
    const c = await clientStore.create(SAMPLE_CLIENT);
    const b = await brandStore.create(c.id, { canonicalName: "Acme", kind: "client" });
    const fuzzy = await aliasStore.create(b.id, { aliasText: "acme", matchType: "fuzzy" });
    const regex = await aliasStore.create(b.id, { aliasText: "acme.*corp", matchType: "regex" });
    expect(fuzzy.matchType).toBe("fuzzy");
    expect(regex.matchType).toBe("regex");
  });

  it("deletes an alias", async () => {
    const c = await clientStore.create(SAMPLE_CLIENT);
    const b = await brandStore.create(c.id, { canonicalName: "Acme", kind: "client" });
    const a = await aliasStore.create(b.id, { aliasText: "Acme", matchType: "exact" });
    expect(await aliasStore.delete(a.id)).toBe(true);
    expect(await aliasStore.listByBrand(b.id)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe("CompetitorStore", () => {
  let db: ReturnType<typeof drizzle>;
  let clientStore: ClientStore;
  let brandStore: BrandStore;
  let competitorStore: CompetitorStore;

  beforeEach(async () => {
    db = makeDb();
    clientStore = new ClientStore(db);
    brandStore = new BrandStore(db);
    competitorStore = new CompetitorStore(db);
  });

  it("lists empty for a fresh client", async () => {
    const c = await clientStore.create(SAMPLE_CLIENT);
    expect(await competitorStore.listByClient(c.id)).toEqual([]);
  });

  it("creates a competitor entry and retrieves it", async () => {
    const c = await clientStore.create(SAMPLE_CLIENT);
    const b = await brandStore.create(c.id, { canonicalName: "Rival Co", kind: "competitor" });
    const comp = await competitorStore.create(c.id, b.id, 1);
    expect(comp.clientId).toBe(c.id);
    expect(comp.brandId).toBe(b.id);
    expect(comp.priority).toBe(1);

    const list = await competitorStore.listByClient(c.id);
    expect(list).toHaveLength(1);
  });

  it("deletes a competitor entry", async () => {
    const c = await clientStore.create(SAMPLE_CLIENT);
    const b = await brandStore.create(c.id, { canonicalName: "Rival", kind: "competitor" });
    const comp = await competitorStore.create(c.id, b.id, 0);
    expect(await competitorStore.delete(comp.id)).toBe(true);
    expect(await competitorStore.listByClient(c.id)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe("ClientUserStore — canAccess truth table", () => {
  let db: ReturnType<typeof drizzle>;
  let clientStore: ClientStore;
  let clientUserStore: ClientUserStore;
  let clientId: number;

  beforeEach(async () => {
    db = makeDb();
    clientStore = new ClientStore(db);
    clientUserStore = new ClientUserStore(db);
    const c = await clientStore.create(SAMPLE_CLIENT);
    clientId = c.id;
  });

  it("canAccess returns false when no entry exists", async () => {
    expect(await clientUserStore.canAccess(42, clientId)).toBe(false);
  });

  it("canAccess returns true after grant", async () => {
    await clientUserStore.grant(clientId, 42);
    expect(await clientUserStore.canAccess(42, clientId)).toBe(true);
  });

  it("canAccess returns false after revoke", async () => {
    await clientUserStore.grant(clientId, 42);
    const ok = await clientUserStore.revoke(clientId, 42);
    expect(ok).toBe(true);
    expect(await clientUserStore.canAccess(42, clientId)).toBe(false);
  });

  it("revoke returns false when entry does not exist", async () => {
    expect(await clientUserStore.revoke(clientId, 99)).toBe(false);
  });

  it("lists granted users for a client", async () => {
    await clientUserStore.grant(clientId, 1);
    await clientUserStore.grant(clientId, 2);
    const list = await clientUserStore.listByClient(clientId);
    expect(list).toHaveLength(2);
  });
});
