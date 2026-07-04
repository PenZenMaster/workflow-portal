import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { DatabaseStorage, SCHEMA_SQL } from "../../server/storage";

function createTestStorage(): DatabaseStorage {
  const sqlite = new Database(":memory:");
  sqlite.exec(SCHEMA_SQL);
  return new DatabaseStorage(drizzle(sqlite));
}

const SAMPLE = {
  name: "Test Workflow",
  category: "Audit",
  description: "A test workflow",
  inputs: ["Website URL", "GBP link"],
  tags: ["seo", "test"],
  prompt: "Use the skill.\n\nURL: <PASTE>\nGBP: <PASTE>",
  launchUrl: "https://www.perplexity.ai/",
  launchLabel: "Launch in Perplexity",
  pinned: false,
  acceptsFileUpload: false,
  optionalInputs: [],
};

describe("DatabaseStorage — workflows", () => {
  let storage: DatabaseStorage;

  beforeEach(() => {
    storage = createTestStorage();
  });

  it("lists empty on a fresh database", async () => {
    expect(await storage.listWorkflows()).toEqual([]);
  });

  it("creates and retrieves a workflow", async () => {
    const created = await storage.createWorkflow(SAMPLE);
    expect(created.id).toBeTypeOf("number");
    expect(created.name).toBe("Test Workflow");
    expect(created.inputs).toEqual(["Website URL", "GBP link"]);
    expect(created.tags).toEqual(["seo", "test"]);
    expect(created.pinned).toBe(false);
    expect(created.createdAt).toBeTypeOf("number");

    const fetched = await storage.getWorkflow(created.id);
    expect(fetched).toMatchObject({ name: "Test Workflow", category: "Audit" });
  });

  it("lists workflows pinned-first, then alphabetical", async () => {
    await storage.createWorkflow({ ...SAMPLE, name: "Zebra", pinned: false });
    await storage.createWorkflow({ ...SAMPLE, name: "Apple", pinned: false });
    await storage.createWorkflow({ ...SAMPLE, name: "Pinned Item", pinned: true });

    const list = await storage.listWorkflows();
    expect(list[0].name).toBe("Pinned Item");
    expect(list[1].name).toBe("Apple");
    expect(list[2].name).toBe("Zebra");
  });

  it("updates a workflow", async () => {
    const created = await storage.createWorkflow(SAMPLE);
    const updated = await storage.updateWorkflow(created.id, {
      ...SAMPLE,
      name: "Updated Name",
      pinned: true,
    });
    expect(updated?.name).toBe("Updated Name");
    expect(updated?.pinned).toBe(true);
  });

  it("returns undefined when updating a non-existent id", async () => {
    expect(await storage.updateWorkflow(9999, SAMPLE)).toBeUndefined();
  });

  it("deletes a workflow and confirms it is gone", async () => {
    const created = await storage.createWorkflow(SAMPLE);
    expect(await storage.deleteWorkflow(created.id)).toBe(true);
    expect(await storage.getWorkflow(created.id)).toBeUndefined();
  });

  it("returns false when deleting a non-existent id", async () => {
    expect(await storage.deleteWorkflow(9999)).toBe(false);
  });

  it("returns undefined for a non-existent id", async () => {
    expect(await storage.getWorkflow(9999)).toBeUndefined();
  });

  it("round-trips empty inputs and tags arrays", async () => {
    const created = await storage.createWorkflow({
      ...SAMPLE,
      inputs: [],
      tags: [],
    });
    expect(created.inputs).toEqual([]);
    expect(created.tags).toEqual([]);
  });

  it("stores acceptsFileUpload=false by default sample and hydrates it as boolean", async () => {
    const created = await storage.createWorkflow(SAMPLE);
    expect(created.acceptsFileUpload).toBe(false);
  });

  it("defaults aiAdapterSlug to null and round-trips a value on create and update", async () => {
    const created = await storage.createWorkflow(SAMPLE);
    expect(created.aiAdapterSlug).toBeNull();

    const withSlug = await storage.createWorkflow({
      ...SAMPLE,
      aiAdapterSlug: "anthropic",
    });
    expect(withSlug.aiAdapterSlug).toBe("anthropic");

    const fetched = await storage.getWorkflow(withSlug.id);
    expect(fetched?.aiAdapterSlug).toBe("anthropic");

    const cleared = await storage.updateWorkflow(withSlug.id, {
      ...SAMPLE,
      aiAdapterSlug: null,
    });
    expect(cleared?.aiAdapterSlug).toBeNull();
  });

  it("persists acceptsFileUpload=true on create and can toggle it off on update", async () => {
    const created = await storage.createWorkflow({
      ...SAMPLE,
      acceptsFileUpload: true,
    });
    expect(created.acceptsFileUpload).toBe(true);

    const fetched = await storage.getWorkflow(created.id);
    expect(fetched?.acceptsFileUpload).toBe(true);

    const updated = await storage.updateWorkflow(created.id, {
      ...SAMPLE,
      acceptsFileUpload: false,
    });
    expect(updated?.acceptsFileUpload).toBe(false);
  });

  it("round-trips optionalInputs on create, get, and update", async () => {
    const created = await storage.createWorkflow({
      ...SAMPLE,
      optionalInputs: ["Competitor URL", "Target keyword"],
    });
    expect(created.optionalInputs).toEqual(["Competitor URL", "Target keyword"]);

    const fetched = await storage.getWorkflow(created.id);
    expect(fetched?.optionalInputs).toEqual(["Competitor URL", "Target keyword"]);

    const updated = await storage.updateWorkflow(created.id, {
      ...SAMPLE,
      optionalInputs: ["City"],
    });
    expect(updated?.optionalInputs).toEqual(["City"]);
  });

  it("defaults optionalInputs to an empty array", async () => {
    const created = await storage.createWorkflow(SAMPLE);
    expect(created.optionalInputs).toEqual([]);
  });
});

describe("DatabaseStorage — users", () => {
  let storage: DatabaseStorage;

  beforeEach(() => {
    storage = createTestStorage();
  });

  it("countUsers returns 0 on an empty database", async () => {
    expect(await storage.countUsers()).toBe(0);
  });

  it("creates a user and increments the count", async () => {
    await storage.createUser("alice", "password1234");
    expect(await storage.countUsers()).toBe(1);
  });

  it("verifies correct credentials and returns the user", async () => {
    const created = await storage.createUser("bob", "correct-password");
    const found = await storage.verifyUser("bob", "correct-password");
    expect(found).not.toBeNull();
    expect(found?.id).toBe(created.id);
    expect(found?.username).toBe("bob");
  });

  it("rejects an incorrect password", async () => {
    await storage.createUser("carol", "right-password");
    expect(await storage.verifyUser("carol", "wrong-password")).toBeNull();
  });

  it("returns null for an unknown username", async () => {
    expect(await storage.verifyUser("nobody", "anything")).toBeNull();
  });

  it("retrieves a user by id", async () => {
    const created = await storage.createUser("dave", "pass-12345678");
    const found = await storage.getUserById(created.id);
    expect(found?.username).toBe("dave");
  });

  it("returns undefined for an unknown user id", async () => {
    expect(await storage.getUserById(9999)).toBeUndefined();
  });

  it("rejects duplicate usernames", async () => {
    await storage.createUser("duplicate", "password1234");
    await expect(
      storage.createUser("duplicate", "other-password")
    ).rejects.toThrow();
  });
});
