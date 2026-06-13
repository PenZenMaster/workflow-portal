import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { SCHEMA_SQL } from "../../../server/storage";
import { PlatformStore } from "../../../server/storage/platformStore";
import { PromptCollectionStore } from "../../../server/storage/promptCollectionStore";
import { PromptStore } from "../../../server/storage/promptStore";
import { ClientStore } from "../../../server/storage/clientStore";
import { RunStore } from "../../../server/storage/runStore";
import { ResponseStore } from "../../../server/storage/responseStore";

function makeDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(SCHEMA_SQL);
  return drizzle(sqlite);
}

const SAMPLE_CLIENT = { name: "Acme", primaryDomain: "acme.com", geographies: [], exclusions: [] };

const SAMPLE_PROMPT = {
  text: "Best SEO agency in Seattle",
  category: "category" as const,
  funnelStage: "awareness" as const,
  priorityWeight: 1,
  status: "active" as const,
  targetPlatforms: [],
  position: 0,
};

// ---------------------------------------------------------------------------
describe("PlatformStore", () => {
  let db: ReturnType<typeof makeDb>;
  let store: PlatformStore;

  beforeEach(() => {
    db = makeDb();
    store = new PlatformStore(db);
  });

  it("seedDefaults inserts all 7 platforms when table is empty", async () => {
    await store.seedDefaults();
    const list = await store.list();
    expect(list).toHaveLength(7);
    expect(list.map((p) => p.slug)).toContain("perplexity");
    expect(list.every((p) => p.enabled)).toBe(true);
  });

  it("seedDefaults is idempotent — running twice keeps 7 platforms", async () => {
    await store.seedDefaults();
    await store.seedDefaults();
    const list = await store.list();
    expect(list).toHaveLength(7);
  });

  it("get returns platform by id", async () => {
    await store.seedDefaults();
    const list = await store.list();
    const found = await store.get(list[0].id);
    expect(found?.slug).toBe("perplexity");
  });

  it("get returns undefined for unknown id", async () => {
    expect(await store.get(9999)).toBeUndefined();
  });

  it("create adds a custom platform with enabled=true and empty config by default", async () => {
    const p = await store.create({ slug: "custom-llm", displayName: "Custom LLM" });
    expect(p.slug).toBe("custom-llm");
    expect(p.displayName).toBe("Custom LLM");
    expect(p.enabled).toBe(true);
    expect(p.config).toEqual({});
  });

  it("create stores provided config", async () => {
    const p = await store.create({
      slug: "custom-llm",
      displayName: "Custom LLM",
      config: { baseUrl: "https://api.example.com", model: "custom-1" },
    });
    expect(p.config).toEqual({ baseUrl: "https://api.example.com", model: "custom-1" });
  });

  it("getBySlug returns the platform with that slug", async () => {
    await store.seedDefaults();
    const found = await store.getBySlug("perplexity");
    expect(found?.displayName).toBe("Perplexity");
  });

  it("getBySlug returns undefined for unknown slug", async () => {
    expect(await store.getBySlug("nope")).toBeUndefined();
  });

  it("update changes displayName, enabled, and config", async () => {
    const p = await store.create({ slug: "custom-llm", displayName: "Custom LLM" });
    const updated = await store.update(p.id, {
      displayName: "Renamed",
      enabled: false,
      config: { model: "v2" },
    });
    expect(updated?.displayName).toBe("Renamed");
    expect(updated?.enabled).toBe(false);
    expect(updated?.config).toEqual({ model: "v2" });
  });

  it("update with partial data only changes provided fields", async () => {
    const p = await store.create({ slug: "custom-llm", displayName: "Custom LLM", config: { model: "v1" } });
    const updated = await store.update(p.id, { enabled: false });
    expect(updated?.displayName).toBe("Custom LLM");
    expect(updated?.config).toEqual({ model: "v1" });
    expect(updated?.enabled).toBe(false);
  });

  it("update returns undefined for unknown id", async () => {
    expect(await store.update(9999, { displayName: "x" })).toBeUndefined();
  });

  it("countResponses returns 0 when no responses reference the platform", async () => {
    const p = await store.create({ slug: "custom-llm", displayName: "Custom LLM" });
    expect(await store.countResponses(p.id)).toBe(0);
  });

  it("countResponses returns the number of responses using this platform", async () => {
    const p = await store.create({ slug: "custom-llm", displayName: "Custom LLM" });
    const runStore = new RunStore(db);
    const responseStore = new ResponseStore(db);
    const run = await runStore.create({
      clientId: 1, collectionId: 10, batchId: "batch-1", totalPrompts: 1, triggeredBy: "manual",
    });
    await responseStore.create({ runId: run.id, promptId: 100, platformId: p.id, queryText: "q" });
    expect(await store.countResponses(p.id)).toBe(1);
  });

  it("delete removes a platform and returns true", async () => {
    const p = await store.create({ slug: "custom-llm", displayName: "Custom LLM" });
    expect(await store.delete(p.id)).toBe(true);
    expect(await store.get(p.id)).toBeUndefined();
  });

  it("delete returns false for unknown id", async () => {
    expect(await store.delete(9999)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe("PromptCollectionStore", () => {
  let db: ReturnType<typeof drizzle>;
  let clientStore: ClientStore;
  let store: PromptCollectionStore;
  let promptStore: PromptStore;
  let clientId: number;

  beforeEach(async () => {
    db = makeDb();
    clientStore = new ClientStore(db);
    store = new PromptCollectionStore(db);
    promptStore = new PromptStore(db);
    const c = await clientStore.create(SAMPLE_CLIENT);
    clientId = c.id;
  });

  it("listByClient returns empty on fresh client", async () => {
    expect(await store.listByClient(clientId)).toEqual([]);
  });

  it("create makes a draft collection with version 1", async () => {
    const c = await store.create(clientId, { name: "Q1 Audit" });
    expect(c.name).toBe("Q1 Audit");
    expect(c.status).toBe("draft");
    expect(c.version).toBe(1);
    expect(c.clientId).toBe(clientId);
  });

  it("update changes name and notes", async () => {
    const c = await store.create(clientId, { name: "Original" });
    const updated = await store.update(c.id, { name: "Renamed", notes: "Some notes" });
    expect(updated?.name).toBe("Renamed");
    expect(updated?.notes).toBe("Some notes");
  });

  it("activate sets status to active", async () => {
    const c = await store.create(clientId, { name: "Q1" });
    const activated = await store.activate(c.id);
    expect(activated?.status).toBe("active");
  });

  it("activate archives the previously active collection", async () => {
    const first = await store.create(clientId, { name: "First" });
    await store.activate(first.id);
    const second = await store.create(clientId, { name: "Second" });
    await store.activate(second.id);

    const list = await store.listByClient(clientId);
    const firstState = list.find((c) => c.id === first.id);
    const secondState = list.find((c) => c.id === second.id);
    expect(firstState?.status).toBe("archived");
    expect(secondState?.status).toBe("active");
  });

  it("only one active collection per client at a time", async () => {
    const a = await store.create(clientId, { name: "A" });
    const b = await store.create(clientId, { name: "B" });
    const c = await store.create(clientId, { name: "C" });
    await store.activate(a.id);
    await store.activate(b.id);
    await store.activate(c.id);

    const list = await store.listByClient(clientId);
    const activeCount = list.filter((col) => col.status === "active").length;
    expect(activeCount).toBe(1);
  });

  it("clone creates a new draft with version + 1 and copies prompts", async () => {
    const src = await store.create(clientId, { name: "Source" });
    await promptStore.create(src.id, SAMPLE_PROMPT);
    await promptStore.create(src.id, { ...SAMPLE_PROMPT, text: "Second prompt" });

    const cloned = await store.clone(src.id);
    expect(cloned.version).toBe(src.version + 1);
    expect(cloned.status).toBe("draft");
    expect(cloned.parentCollectionId).toBe(src.id);

    const clonedPrompts = await promptStore.listByCollection(cloned.id);
    expect(clonedPrompts).toHaveLength(2);
    expect(clonedPrompts[0].text).toBe("Best SEO agency in Seattle");
  });

  it("get returns undefined for unknown id", async () => {
    expect(await store.get(9999)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
describe("PromptStore", () => {
  let db: ReturnType<typeof drizzle>;
  let clientStore: ClientStore;
  let collectionStore: PromptCollectionStore;
  let store: PromptStore;
  let collectionId: number;

  beforeEach(async () => {
    db = makeDb();
    clientStore = new ClientStore(db);
    collectionStore = new PromptCollectionStore(db);
    store = new PromptStore(db);
    const c = await clientStore.create(SAMPLE_CLIENT);
    const col = await collectionStore.create(c.id, { name: "Test Collection" });
    collectionId = col.id;
  });

  it("listByCollection returns empty for fresh collection", async () => {
    expect(await store.listByCollection(collectionId)).toEqual([]);
  });

  it("create adds a prompt with correct fields", async () => {
    const p = await store.create(collectionId, SAMPLE_PROMPT);
    expect(p.text).toBe("Best SEO agency in Seattle");
    expect(p.category).toBe("category");
    expect(p.funnelStage).toBe("awareness");
    expect(p.priorityWeight).toBe(1);
    expect(p.status).toBe("active");

    const list = await store.listByCollection(collectionId);
    expect(list).toHaveLength(1);
  });

  it("bulkCreate inserts multiple prompts in one call", async () => {
    const input = [
      { ...SAMPLE_PROMPT, text: "Prompt 1" },
      { ...SAMPLE_PROMPT, text: "Prompt 2" },
      { ...SAMPLE_PROMPT, text: "Prompt 3" },
    ];
    const created = await store.bulkCreate(collectionId, input);
    expect(created).toHaveLength(3);
    const list = await store.listByCollection(collectionId);
    expect(list).toHaveLength(3);
  });

  it("update changes prompt text and category", async () => {
    const p = await store.create(collectionId, SAMPLE_PROMPT);
    const updated = await store.update(p.id, {
      ...SAMPLE_PROMPT,
      text: "Updated prompt",
      category: "brand",
    });
    expect(updated?.text).toBe("Updated prompt");
    expect(updated?.category).toBe("brand");
  });

  it("delete removes the prompt", async () => {
    const p = await store.create(collectionId, SAMPLE_PROMPT);
    expect(await store.delete(p.id)).toBe(true);
    expect(await store.listByCollection(collectionId)).toHaveLength(0);
  });

  it("delete returns false for unknown id", async () => {
    expect(await store.delete(9999)).toBe(false);
  });
});
