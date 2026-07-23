/*
 * Module/Script Name: brandContextBackfill.test.ts
 * Path: tests/server/services/brandContextBackfill.test.ts
 *
 * Description:
 * Tests for the one-time/idempotent brandContext backfill (issue #4
 * Phase 1 slice 3). Covers per-client classification, cross-client
 * isolation (same leak pattern regression tested elsewhere in this
 * codebase), alias matching, idempotent overwrite, and summary counts.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-23
 * Last Modified Date: 2026-07-23
 * Comments:
 * - v1.00 issue #4 Phase 1 slice 3 initial implementation
 */

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { SCHEMA_SQL } from "../../../server/storage";
import { ClientStore } from "../../../server/storage/clientStore";
import { PromptCollectionStore } from "../../../server/storage/promptCollectionStore";
import { PromptStore } from "../../../server/storage/promptStore";
import { BrandStore } from "../../../server/storage/brandStore";
import { AliasStore } from "../../../server/storage/aliasStore";
import { backfillBrandContext } from "../../../server/services/brandContextBackfill";
import type { InsertPrompt } from "../../../shared/schema";

function makeDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(SCHEMA_SQL);
  return drizzle(sqlite);
}

function promptData(text: string, overrides: Partial<InsertPrompt> = {}): InsertPrompt {
  return {
    text,
    category: "category" as const,
    funnelStage: "awareness" as const,
    priorityWeight: 1,
    status: "active" as const,
    targetPlatforms: [],
    position: 0,
    ...overrides,
  };
}

const SAMPLE_CLIENT = { name: "Acme", primaryDomain: "acme.com", geographies: [], exclusions: [] };

describe("backfillBrandContext", () => {
  let db: ReturnType<typeof makeDb>;
  let clientStore: ClientStore;
  let collectionStore: PromptCollectionStore;
  let promptStore: PromptStore;
  let brandStore: BrandStore;
  let aliasStore: AliasStore;

  beforeEach(() => {
    db = makeDb();
    clientStore = new ClientStore(db);
    collectionStore = new PromptCollectionStore(db);
    promptStore = new PromptStore(db);
    brandStore = new BrandStore(db);
    aliasStore = new AliasStore(db);
  });

  it("classifies each prompt using its own client's brand roster", async () => {
    const client = await clientStore.create(SAMPLE_CLIENT);
    const collection = await collectionStore.create(client.id, { name: "Panel" });
    await brandStore.create(client.id, { canonicalName: "Acme Roofing", kind: "client" });
    await brandStore.create(client.id, { canonicalName: "Rival Roofing", kind: "competitor" });

    const unbranded = await promptStore.create(collection.id, promptData("Best roofers near me"));
    const clientBranded = await promptStore.create(
      collection.id,
      promptData("Is Acme Roofing reputable?")
    );
    const competitorBranded = await promptStore.create(
      collection.id,
      promptData("Alternatives to Rival Roofing")
    );
    const mixed = await promptStore.create(
      collection.id,
      promptData("Acme Roofing vs Rival Roofing")
    );

    const summary = await backfillBrandContext(db);
    expect(summary.scanned).toBe(4);
    expect(summary.updated).toBe(4);

    const list = await promptStore.listByCollection(collection.id);
    expect(list.find((p) => p.id === unbranded.id)?.brandContext).toBe("unbranded");
    expect(list.find((p) => p.id === clientBranded.id)?.brandContext).toBe("client_branded");
    expect(list.find((p) => p.id === competitorBranded.id)?.brandContext).toBe(
      "competitor_branded"
    );
    expect(list.find((p) => p.id === mixed.id)?.brandContext).toBe("client_and_competitor");
  });

  it("does not leak one client's brand roster into another client's prompts", async () => {
    const clientA = await clientStore.create({ ...SAMPLE_CLIENT, name: "A", primaryDomain: "a.com" });
    const clientB = await clientStore.create({ ...SAMPLE_CLIENT, name: "B", primaryDomain: "b.com" });
    const colB = await collectionStore.create(clientB.id, { name: "B panel" });
    await brandStore.create(clientA.id, { canonicalName: "Acme Roofing", kind: "client" });
    // Client B has no brands configured at all.
    await promptStore.create(colB.id, promptData("Is Acme Roofing reputable?"));

    await backfillBrandContext(db);

    const [listedB] = await promptStore.listByCollection(colB.id);
    expect(listedB.brandContext).toBe("unbranded");
  });

  it("overwrites a stale brandContext on recompute (idempotent)", async () => {
    const client = await clientStore.create(SAMPLE_CLIENT);
    const collection = await collectionStore.create(client.id, { name: "Panel" });
    await brandStore.create(client.id, { canonicalName: "Acme Roofing", kind: "client" });
    await promptStore.create(
      collection.id,
      promptData("Is Acme Roofing reputable?", { brandContext: "unbranded" })
    );

    await backfillBrandContext(db);

    const [listed] = await promptStore.listByCollection(collection.id);
    expect(listed.brandContext).toBe("client_branded");
  });

  it("matches via a configured alias, not just the canonical name", async () => {
    const client = await clientStore.create(SAMPLE_CLIENT);
    const collection = await collectionStore.create(client.id, { name: "Panel" });
    const brand = await brandStore.create(client.id, { canonicalName: "Acme Roofing", kind: "client" });
    await aliasStore.create(brand.id, { aliasText: "AcmeRoof", matchType: "exact" });
    await promptStore.create(collection.id, promptData("Have you used AcmeRoof before?"));

    await backfillBrandContext(db);

    const [listed] = await promptStore.listByCollection(collection.id);
    expect(listed.brandContext).toBe("client_branded");
  });

  it("returns a summary broken down by brand context", async () => {
    const client = await clientStore.create(SAMPLE_CLIENT);
    const collection = await collectionStore.create(client.id, { name: "Panel" });
    await brandStore.create(client.id, { canonicalName: "Acme Roofing", kind: "client" });
    await promptStore.create(collection.id, promptData("Best roofers nearby"));
    await promptStore.create(collection.id, promptData("Is Acme Roofing reputable?"));

    const summary = await backfillBrandContext(db);
    expect(summary.byContext.unbranded).toBe(1);
    expect(summary.byContext.client_branded).toBe(1);
    expect(summary.byContext.competitor_branded).toBe(0);
    expect(summary.byContext.client_and_competitor).toBe(0);
  });

  it("returns zero scanned/updated when there are no prompts", async () => {
    const summary = await backfillBrandContext(db);
    expect(summary.scanned).toBe(0);
    expect(summary.updated).toBe(0);
  });
});
