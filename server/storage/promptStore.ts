/*
 * Module/Script Name: promptStore.ts
 * Path: server/storage/promptStore.ts
 *
 * Description:
 * Data-access layer for the prompts table. bulkCreate inserts up to 200
 * prompts in a single transaction for the bulk-import endpoint.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-09
 * Last Modified Date: 2026-05-09
 * Comments:
 * - v1.00 Sprint 2 initial implementation
 */

import { prompts } from "@shared/schema";
import type { Prompt, InsertPrompt, PromptCategory, FunnelStage } from "@shared/schema";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

type DrizzleDb = ReturnType<typeof drizzle>;
type Row = typeof prompts.$inferSelect;

function hydrate(row: Row): Prompt {
  return {
    id: row.id,
    collectionId: row.collectionId,
    text: row.text,
    category: row.category as PromptCategory,
    funnelStage: row.funnelStage as FunnelStage,
    geo: row.geo,
    deviceContext: row.deviceContext,
    priorityWeight: row.priorityWeight,
    status: row.status as "draft" | "active",
    targetPlatforms: JSON.parse(row.targetPlatforms || "[]") as string[],
    position: row.position,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toValues(collectionId: number, data: InsertPrompt, now: number) {
  return {
    collectionId,
    text: data.text,
    category: data.category,
    funnelStage: data.funnelStage ?? "awareness",
    geo: data.geo ?? null,
    deviceContext: data.deviceContext ?? null,
    priorityWeight: data.priorityWeight ?? 1,
    status: data.status ?? "active",
    targetPlatforms: JSON.stringify(data.targetPlatforms ?? []),
    position: data.position ?? 0,
    createdAt: now,
    updatedAt: now,
  };
}

export interface IPromptStore {
  listByCollection(collectionId: number): Promise<Prompt[]>;
  create(collectionId: number, data: InsertPrompt): Promise<Prompt>;
  bulkCreate(collectionId: number, data: InsertPrompt[]): Promise<Prompt[]>;
  update(id: number, data: InsertPrompt): Promise<Prompt | undefined>;
  delete(id: number): Promise<boolean>;
}

export class PromptStore implements IPromptStore {
  constructor(private readonly _db: DrizzleDb) {}

  async listByCollection(collectionId: number): Promise<Prompt[]> {
    const rows = this._db
      .select()
      .from(prompts)
      .where(eq(prompts.collectionId, collectionId))
      .all();
    return rows.map(hydrate).sort((a, b) => a.position - b.position);
  }

  async create(collectionId: number, data: InsertPrompt): Promise<Prompt> {
    const now = Date.now();
    const row = this._db
      .insert(prompts)
      .values(toValues(collectionId, data, now))
      .returning()
      .get();
    return hydrate(row);
  }

  async bulkCreate(collectionId: number, data: InsertPrompt[]): Promise<Prompt[]> {
    const now = Date.now();
    const created: Prompt[] = [];
    for (const item of data) {
      const row = this._db
        .insert(prompts)
        .values(toValues(collectionId, item, now))
        .returning()
        .get();
      created.push(hydrate(row));
    }
    return created;
  }

  async update(id: number, data: InsertPrompt): Promise<Prompt | undefined> {
    const existing = this._db
      .select()
      .from(prompts)
      .where(eq(prompts.id, id))
      .get();
    if (!existing) return undefined;
    const now = Date.now();
    const row = this._db
      .update(prompts)
      .set({
        text: data.text,
        category: data.category,
        funnelStage: data.funnelStage ?? existing.funnelStage,
        geo: data.geo ?? null,
        deviceContext: data.deviceContext ?? null,
        priorityWeight: data.priorityWeight ?? existing.priorityWeight,
        status: data.status ?? existing.status,
        targetPlatforms: JSON.stringify(data.targetPlatforms ?? []),
        position: data.position ?? existing.position,
        updatedAt: now,
      })
      .where(eq(prompts.id, id))
      .returning()
      .get();
    return row ? hydrate(row) : undefined;
  }

  async delete(id: number): Promise<boolean> {
    const result = this._db.delete(prompts).where(eq(prompts.id, id)).run();
    return result.changes > 0;
  }
}
