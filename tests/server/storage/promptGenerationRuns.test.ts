/*
 * Module/Script Name: promptGenerationRuns.test.ts
 * Path: tests/server/storage/promptGenerationRuns.test.ts
 *
 * Description:
 * PromptGenerationRunStore tests (issue #3 Epic 2 slice E2c / YLG
 * prompt-gen Phase 4): create/read round trip with JSON hydration,
 * newest-first collection listing, and generation-run stamping on
 * prompts created via bulkCreate.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-16
 * Last Modified Date: 2026-07-16
 * Comments:
 * - v1.00 E2c initial implementation
 */

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { SCHEMA_SQL } from "../../../server/storage";
import { PromptGenerationRunStore } from "../../../server/storage/promptGenerationRunStore";
import { PromptStore } from "../../../server/storage/promptStore";

function makeDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(SCHEMA_SQL);
  return drizzle(sqlite);
}

const SAMPLE_RUN = {
  clientId: 10,
  collectionId: 5,
  requestedCount: 12,
  adapterSlug: "openai",
  modelVariant: "gpt-4o-mini",
  methodologyVersion: "1.0",
  contextSnapshot: JSON.stringify({ clientName: "Acme Plumbing", count: 12 }),
  rawOutput: '[{"text":"Who are the best plumbers in Seattle?"}]',
  validCount: 10,
  invalidCount: 2,
  warnings: ["Only 10 of 12 requested prompts were valid"],
  invalidItems: [{ item: { text: "" }, errors: ["Prompt text is required"] }],
  createdByUserId: 1,
};

describe("PromptGenerationRunStore", () => {
  let db: ReturnType<typeof makeDb>;
  let store: PromptGenerationRunStore;

  beforeEach(() => {
    db = makeDb();
    store = new PromptGenerationRunStore(db);
  });

  it("creates a generation run and reads it back with hydrated JSON fields", async () => {
    const created = await store.create(SAMPLE_RUN);
    expect(created.id).toBeTypeOf("number");
    expect(created.createdAt).toBeTypeOf("number");

    const fetched = await store.get(created.id);
    expect(fetched?.adapterSlug).toBe("openai");
    expect(fetched?.modelVariant).toBe("gpt-4o-mini");
    expect(fetched?.methodologyVersion).toBe("1.0");
    expect(fetched?.rawOutput).toContain("best plumbers in Seattle");
    expect(fetched?.contextSnapshot).toContain("Acme Plumbing");
    expect(fetched?.validCount).toBe(10);
    expect(fetched?.invalidCount).toBe(2);
    expect(fetched?.warnings).toEqual(["Only 10 of 12 requested prompts were valid"]);
    expect(fetched?.invalidItems).toEqual([
      { item: { text: "" }, errors: ["Prompt text is required"] },
    ]);
    expect(fetched?.createdByUserId).toBe(1);
  });

  it("stores a null model variant and null user for unattributed runs", async () => {
    const created = await store.create({
      ...SAMPLE_RUN,
      modelVariant: null,
      createdByUserId: null,
    });
    const fetched = await store.get(created.id);
    expect(fetched?.modelVariant).toBeNull();
    expect(fetched?.createdByUserId).toBeNull();
  });

  it("returns undefined for a missing run", async () => {
    expect(await store.get(9999)).toBeUndefined();
  });

  it("lists runs for a collection newest-first and ignores other collections", async () => {
    const first = await store.create(SAMPLE_RUN);
    const second = await store.create(SAMPLE_RUN);
    await store.create({ ...SAMPLE_RUN, collectionId: 99 });

    const runs = await store.listByCollection(5);
    expect(runs.map((r) => r.id)).toEqual([second.id, first.id]);
  });

  describe("bulkCreate generation-run stamping", () => {
    const PROMPT = {
      text: "Who fixes leaky faucets in Seattle?",
      category: "problem_aware" as const,
      funnelStage: "awareness" as const,
      priorityWeight: 1,
      status: "active" as const,
      targetPlatforms: [],
      position: 0,
    };

    it("stamps generation_run_id on prompts created with a run id", async () => {
      const run = await store.create(SAMPLE_RUN);
      const promptStore = new PromptStore(db);

      const created = await promptStore.bulkCreate(5, [PROMPT], run.id);
      expect(created).toHaveLength(1);
      expect(created[0].generationRunId).toBe(run.id);
    });

    it("leaves generationRunId null for manual bulk imports", async () => {
      const promptStore = new PromptStore(db);
      const created = await promptStore.bulkCreate(5, [PROMPT]);
      expect(created[0].generationRunId).toBeNull();
    });
  });
});
