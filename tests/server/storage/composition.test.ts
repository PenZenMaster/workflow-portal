import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { DatabaseStorage, SCHEMA_SQL } from "../../../server/storage";
import { WorkflowStore } from "../../../server/storage/workflowStore";
import { UserStore } from "../../../server/storage/userStore";

function makeDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(SCHEMA_SQL);
  return drizzle(sqlite);
}

describe("storage composition", () => {
  it("DatabaseStorage delegates listWorkflows via WorkflowStore", async () => {
    const storage = new DatabaseStorage(makeDb());
    expect(await storage.listWorkflows()).toEqual([]);
  });

  it("DatabaseStorage delegates countUsers via UserStore", async () => {
    const storage = new DatabaseStorage(makeDb());
    expect(await storage.countUsers()).toBe(0);
  });

  it("WorkflowStore is independently usable with its short-name API", async () => {
    const store = new WorkflowStore(makeDb());
    expect(await store.list()).toEqual([]);
  });

  it("UserStore is independently usable with its short-name API", async () => {
    const store = new UserStore(makeDb());
    expect(await store.count()).toBe(0);
  });

  it("DatabaseStorage and WorkflowStore share the same data via the same drizzle instance", async () => {
    const db = makeDb();
    const storage = new DatabaseStorage(db);
    const store = new WorkflowStore(db);

    await storage.createWorkflow({
      name: "Shared Test",
      category: "Audit",
      description: "desc",
      inputs: [],
      tags: [],
      prompt: "",
      launchUrl: "",
      launchLabel: "",
      pinned: false,
    });

    const viaStore = await store.list();
    expect(viaStore).toHaveLength(1);
    expect(viaStore[0].name).toBe("Shared Test");
  });
});
