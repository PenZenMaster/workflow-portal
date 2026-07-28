/*
 * Module/Script Name: promptCollectionStore.ts
 * Path: server/storage/promptCollectionStore.ts
 *
 * Description:
 * Data-access layer for prompt_collections. Enforces the invariant that
 * only one collection per client can be active at a time. clone() copies
 * all prompts from the source into a new draft with an incremented version.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-09
 * Last Modified Date: 2026-07-28
 * Comments:
 * - v1.00 Sprint 2 initial implementation
 * - v1.01 B-18: setStatus (archive/unarchive), countRuns, cascading delete
 * - v1.02 issue #4 Phase 3 item 9 (slice 1): panelType round-trips
 *   through hydrate/create/update/clone
 */

import { promptCollections, prompts, promptRuns, runSchedules } from "@shared/schema";
import type { PromptCollection, InsertPromptCollection } from "@shared/schema";
import { eq, and, count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

type DrizzleDb = ReturnType<typeof drizzle>;
type Row = typeof promptCollections.$inferSelect;

function hydrate(row: Row): PromptCollection {
  return {
    id: row.id,
    clientId: row.clientId,
    name: row.name,
    version: row.version,
    status: row.status as "draft" | "active" | "archived",
    notes: row.notes,
    parentCollectionId: row.parentCollectionId,
    panelType: row.panelType as PromptCollection["panelType"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface IPromptCollectionStore {
  listByClient(clientId: number): Promise<PromptCollection[]>;
  get(id: number): Promise<PromptCollection | undefined>;
  create(clientId: number, data: InsertPromptCollection): Promise<PromptCollection>;
  update(id: number, data: InsertPromptCollection): Promise<PromptCollection | undefined>;
  clone(id: number): Promise<PromptCollection>;
  activate(id: number): Promise<PromptCollection | undefined>;
  setStatus(
    id: number,
    status: "draft" | "archived"
  ): Promise<PromptCollection | undefined>;
  countRuns(id: number): Promise<number>;
  delete(id: number): Promise<boolean>;
}

export class PromptCollectionStore implements IPromptCollectionStore {
  constructor(private readonly _db: DrizzleDb) {}

  async listByClient(clientId: number): Promise<PromptCollection[]> {
    const rows = this._db
      .select()
      .from(promptCollections)
      .where(eq(promptCollections.clientId, clientId))
      .all();
    return rows.map(hydrate);
  }

  async get(id: number): Promise<PromptCollection | undefined> {
    const row = this._db
      .select()
      .from(promptCollections)
      .where(eq(promptCollections.id, id))
      .get();
    return row ? hydrate(row) : undefined;
  }

  async create(
    clientId: number,
    data: InsertPromptCollection
  ): Promise<PromptCollection> {
    const now = Date.now();
    const row = this._db
      .insert(promptCollections)
      .values({
        clientId,
        name: data.name,
        notes: data.notes ?? null,
        panelType: data.panelType,
        status: "draft",
        version: 1,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return hydrate(row);
  }

  async update(
    id: number,
    data: InsertPromptCollection
  ): Promise<PromptCollection | undefined> {
    const existing = this._db
      .select()
      .from(promptCollections)
      .where(eq(promptCollections.id, id))
      .get();
    if (!existing) return undefined;
    const row = this._db
      .update(promptCollections)
      .set({ name: data.name, notes: data.notes ?? null, panelType: data.panelType, updatedAt: Date.now() })
      .where(eq(promptCollections.id, id))
      .returning()
      .get();
    return row ? hydrate(row) : undefined;
  }

  async clone(sourceId: number): Promise<PromptCollection> {
    const source = this._db
      .select()
      .from(promptCollections)
      .where(eq(promptCollections.id, sourceId))
      .get();
    if (!source) throw new Error("NOT_FOUND");

    const sourcePrompts = this._db
      .select()
      .from(prompts)
      .where(eq(prompts.collectionId, sourceId))
      .all();

    const now = Date.now();
    const cloned = this._db
      .insert(promptCollections)
      .values({
        clientId: source.clientId,
        name: source.name,
        version: source.version + 1,
        status: "draft",
        notes: source.notes,
        panelType: source.panelType,
        parentCollectionId: source.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    for (const p of sourcePrompts) {
      this._db
        .insert(prompts)
        .values({
          collectionId: cloned.id,
          text: p.text,
          category: p.category,
          funnelStage: p.funnelStage,
          geo: p.geo,
          deviceContext: p.deviceContext,
          priorityWeight: p.priorityWeight,
          status: p.status,
          targetPlatforms: p.targetPlatforms,
          position: p.position,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }

    return hydrate(cloned);
  }

  async activate(id: number): Promise<PromptCollection | undefined> {
    const target = this._db
      .select()
      .from(promptCollections)
      .where(eq(promptCollections.id, id))
      .get();
    if (!target) return undefined;

    const now = Date.now();

    // Archive any currently active collection for this client.
    this._db
      .update(promptCollections)
      .set({ status: "archived", updatedAt: now })
      .where(
        and(
          eq(promptCollections.clientId, target.clientId),
          eq(promptCollections.status, "active")
        )
      )
      .run();

    const row = this._db
      .update(promptCollections)
      .set({ status: "active", updatedAt: now })
      .where(eq(promptCollections.id, id))
      .returning()
      .get();

    return row ? hydrate(row) : undefined;
  }

  // Archive/unarchive transitions only; "active" must go through activate()
  // so the one-active-per-client invariant holds.
  async setStatus(
    id: number,
    status: "draft" | "archived"
  ): Promise<PromptCollection | undefined> {
    const row = this._db
      .update(promptCollections)
      .set({ status, updatedAt: Date.now() })
      .where(eq(promptCollections.id, id))
      .returning()
      .get();
    return row ? hydrate(row) : undefined;
  }

  async countRuns(id: number): Promise<number> {
    const row = this._db
      .select({ value: count() })
      .from(promptRuns)
      .where(eq(promptRuns.collectionId, id))
      .get();
    return row?.value ?? 0;
  }

  async delete(id: number): Promise<boolean> {
    const existing = this._db
      .select()
      .from(promptCollections)
      .where(eq(promptCollections.id, id))
      .get();
    if (!existing) return false;

    // The collection's prompts and schedules have no meaning without it.
    this._db.delete(prompts).where(eq(prompts.collectionId, id)).run();
    this._db.delete(runSchedules).where(eq(runSchedules.collectionId, id)).run();
    this._db.delete(promptCollections).where(eq(promptCollections.id, id)).run();
    return true;
  }
}
