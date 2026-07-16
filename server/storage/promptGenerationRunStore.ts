/*
 * Module/Script Name: promptGenerationRunStore.ts
 * Path: server/storage/promptGenerationRunStore.ts
 *
 * Description:
 * Data-access layer for prompt_generation_runs (issue #3 Epic 2 slice
 * E2c / YLG prompt-gen Phase 4). Generation runs are immutable
 * provenance records: one row per AI generation event, written at
 * generation time, no update path. Saved prompts link back via
 * prompts.generation_run_id.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-16
 * Last Modified Date: 2026-07-16
 * Comments:
 * - v1.00 E2c initial implementation
 */

import { promptGenerationRuns } from "@shared/schema";
import type { GenerationInvalidItem, PromptGenerationRun } from "@shared/schema";
import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

type DrizzleDb = ReturnType<typeof drizzle>;
type Row = typeof promptGenerationRuns.$inferSelect;

export interface PromptGenerationRunCreateInput {
  clientId: number;
  collectionId: number;
  requestedCount: number;
  adapterSlug: string;
  modelVariant: string | null;
  methodologyVersion: string;
  contextSnapshot: string;
  rawOutput: string;
  validCount: number;
  invalidCount: number;
  warnings: string[];
  invalidItems: GenerationInvalidItem[];
  createdByUserId: number | null;
}

function hydrate(row: Row): PromptGenerationRun {
  return {
    id: row.id,
    clientId: row.clientId,
    collectionId: row.collectionId,
    requestedCount: row.requestedCount,
    adapterSlug: row.adapterSlug,
    modelVariant: row.modelVariant,
    methodologyVersion: row.methodologyVersion,
    contextSnapshot: row.contextSnapshot,
    rawOutput: row.rawOutput,
    validCount: row.validCount,
    invalidCount: row.invalidCount,
    warnings: JSON.parse(row.warnings) as string[],
    invalidItems: JSON.parse(row.invalidItems) as GenerationInvalidItem[],
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
  };
}

export interface IPromptGenerationRunStore {
  create(data: PromptGenerationRunCreateInput): Promise<PromptGenerationRun>;
  get(id: number): Promise<PromptGenerationRun | undefined>;
  listByCollection(collectionId: number): Promise<PromptGenerationRun[]>;
}

export class PromptGenerationRunStore implements IPromptGenerationRunStore {
  constructor(private readonly _db: DrizzleDb) {}

  async create(data: PromptGenerationRunCreateInput): Promise<PromptGenerationRun> {
    const row = this._db
      .insert(promptGenerationRuns)
      .values({
        clientId: data.clientId,
        collectionId: data.collectionId,
        requestedCount: data.requestedCount,
        adapterSlug: data.adapterSlug,
        modelVariant: data.modelVariant,
        methodologyVersion: data.methodologyVersion,
        contextSnapshot: data.contextSnapshot,
        rawOutput: data.rawOutput,
        validCount: data.validCount,
        invalidCount: data.invalidCount,
        warnings: JSON.stringify(data.warnings),
        invalidItems: JSON.stringify(data.invalidItems),
        createdByUserId: data.createdByUserId,
        createdAt: Date.now(),
      })
      .returning()
      .get();
    return hydrate(row);
  }

  async get(id: number): Promise<PromptGenerationRun | undefined> {
    const row = this._db
      .select()
      .from(promptGenerationRuns)
      .where(eq(promptGenerationRuns.id, id))
      .get();
    return row ? hydrate(row) : undefined;
  }

  async listByCollection(collectionId: number): Promise<PromptGenerationRun[]> {
    const rows = this._db
      .select()
      .from(promptGenerationRuns)
      .where(eq(promptGenerationRuns.collectionId, collectionId))
      .orderBy(desc(promptGenerationRuns.id))
      .all();
    return rows.map(hydrate);
  }
}
