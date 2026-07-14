/*
 * Module/Script Name: sourceDomains.test.ts
 * Path: tests/server/storage/sourceDomains.test.ts
 *
 * Description:
 * SourceDomainStore tests: upsert create/reclassify semantics, class
 * filtering, batch registry lookup, idempotent seeding, and the
 * unreviewed-domains queue derived from observed citations.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-14
 * Last Modified Date: 2026-07-14
 * Comments:
 * - v1.00 YLG defensibility sprint - source registry slice
 */

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { SCHEMA_SQL } from "../../../server/storage";
import { SourceDomainStore } from "../../../server/storage/sourceDomainStore";
import { CitationStore } from "../../../server/storage/citationStore";

function makeDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(SCHEMA_SQL);
  return drizzle(sqlite);
}

describe("SourceDomainStore", () => {
  let db: ReturnType<typeof makeDb>;
  let store: SourceDomainStore;

  beforeEach(() => {
    db = makeDb();
    store = new SourceDomainStore(db);
  });

  it("upsert creates a registry row with class, rationale, and classifier identity", async () => {
    const row = await store.upsert("chamberofcommerce.com", {
      sourceClass: "local_authority",
      rationale: "Local chamber of commerce listing",
      classifiedBy: "user:1",
    });
    expect(row.rootDomain).toBe("chamberofcommerce.com");
    expect(row.sourceClass).toBe("local_authority");
    expect(row.rationale).toBe("Local chamber of commerce listing");
    expect(row.classifiedBy).toBe("user:1");

    const fetched = await store.getByDomain("chamberofcommerce.com");
    expect(fetched?.sourceClass).toBe("local_authority");
  });

  it("upsert on an existing domain reclassifies in place without duplicating the row", async () => {
    await store.upsert("example.org", {
      sourceClass: "general_directory",
      rationale: "Initial guess",
      classifiedBy: "user:1",
    });
    const updated = await store.upsert("example.org", {
      sourceClass: "industry_authority",
      rationale: "Standards body on review",
      classifiedBy: "user:2",
    });
    expect(updated.sourceClass).toBe("industry_authority");
    expect(updated.rationale).toBe("Standards body on review");
    expect(updated.classifiedBy).toBe("user:2");

    const all = await store.list();
    expect(all.filter((d) => d.rootDomain === "example.org")).toHaveLength(1);
  });

  it("list filters by source class", async () => {
    await store.upsert("a.com", { sourceClass: "review_platform", rationale: "r", classifiedBy: "seed" });
    await store.upsert("b.com", { sourceClass: "general_directory", rationale: "r", classifiedBy: "seed" });
    const reviews = await store.list({ sourceClass: "review_platform" });
    expect(reviews).toHaveLength(1);
    expect(reviews[0].rootDomain).toBe("a.com");
  });

  it("getMapForDomains returns only registered domains as a lookup map", async () => {
    await store.upsert("yelp.com", { sourceClass: "review_platform", rationale: "r", classifiedBy: "seed" });
    const map = await store.getMapForDomains(["yelp.com", "unregistered.net"]);
    expect(map.get("yelp.com")).toBe("review_platform");
    expect(map.has("unregistered.net")).toBe(false);
  });

  it("seedDefaults inserts known review platforms and directories, idempotently", async () => {
    await store.seedDefaults();
    await store.seedDefaults();

    const yelp = await store.getByDomain("yelp.com");
    expect(yelp?.sourceClass).toBe("review_platform");
    expect(yelp?.classifiedBy).toBe("seed");
    const yp = await store.getByDomain("yellowpages.com");
    expect(yp?.sourceClass).toBe("general_directory");

    const all = await store.list();
    const domains = all.map((d) => d.rootDomain);
    expect(new Set(domains).size).toBe(domains.length); // no duplicates
  });

  it("seedDefaults never overwrites a human reclassification", async () => {
    await store.seedDefaults();
    await store.upsert("yelp.com", {
      sourceClass: "general_directory",
      rationale: "Manually reclassified",
      classifiedBy: "user:7",
    });
    await store.seedDefaults();
    const yelp = await store.getByDomain("yelp.com");
    expect(yelp?.sourceClass).toBe("general_directory");
    expect(yelp?.classifiedBy).toBe("user:7");
  });

  it("listUnreviewed returns cited domains absent from the registry with citation counts, most-cited first", async () => {
    const citations = new CitationStore(db);
    await citations.create({ responseId: 1, url: "https://facebook.com/a", rootDomain: "facebook.com", ownedByBrandId: null, position: 1, isTrustedThirdParty: false });
    await citations.create({ responseId: 1, url: "https://facebook.com/b", rootDomain: "facebook.com", ownedByBrandId: null, position: 2, isTrustedThirdParty: false });
    await citations.create({ responseId: 2, url: "https://smallblog.net/x", rootDomain: "smallblog.net", ownedByBrandId: null, position: 1, isTrustedThirdParty: false });
    await citations.create({ responseId: 2, url: "https://yelp.com/biz", rootDomain: "yelp.com", ownedByBrandId: null, position: 2, isTrustedThirdParty: false });
    await store.upsert("yelp.com", { sourceClass: "review_platform", rationale: "r", classifiedBy: "seed" });

    const unreviewed = await store.listUnreviewed();
    expect(unreviewed).toEqual([
      { rootDomain: "facebook.com", citationCount: 2 },
      { rootDomain: "smallblog.net", citationCount: 1 },
    ]);
  });
});
