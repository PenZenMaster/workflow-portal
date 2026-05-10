/*
 * Module/Script Name: runStore.ts
 * Path: server/storage/runStore.ts
 *
 * Description:
 * Data-access layer for the prompt_runs table. Tracks lifecycle of
 * prompt batch executions from queued through complete or failed.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-09
 * Last Modified Date: 2026-05-09
 * Comments:
 * - v1.00 Sprint 3 initial implementation
 */

import { promptRuns } from "@shared/schema";
import type { PromptRun } from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

type DrizzleDb = ReturnType<typeof drizzle>;
type Row = typeof promptRuns.$inferSelect;

function hydrate(row: Row): PromptRun {
  return {
    id: row.id,
    clientId: row.clientId,
    collectionId: row.collectionId,
    batchId: row.batchId,
    status: row.status as PromptRun["status"],
    triggeredBy: row.triggeredBy as PromptRun["triggeredBy"],
    triggeredByUserId: row.triggeredByUserId,
    totalPrompts: row.totalPrompts,
    completedPrompts: row.completedPrompts,
    failedPrompts: row.failedPrompts,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface IRunStore {
  listByClient(clientId: number, limit?: number): Promise<PromptRun[]>;
  get(id: number): Promise<PromptRun | undefined>;
  create(data: {
    clientId: number;
    collectionId: number;
    batchId: string;
    totalPrompts: number;
    triggeredBy: "manual" | "schedule";
    triggeredByUserId?: number | null;
  }): Promise<PromptRun>;
  updateStatus(id: number, status: PromptRun["status"]): Promise<void>;
  incrementCompleted(id: number): Promise<void>;
  incrementFailed(id: number): Promise<void>;
}

export class RunStore implements IRunStore {
  constructor(private readonly _db: DrizzleDb) {}

  async listByClient(clientId: number, limit = 50): Promise<PromptRun[]> {
    const rows = this._db
      .select()
      .from(promptRuns)
      .where(eq(promptRuns.clientId, clientId))
      .orderBy(desc(promptRuns.createdAt))
      .limit(limit)
      .all();
    return rows.map(hydrate);
  }

  async get(id: number): Promise<PromptRun | undefined> {
    const row = this._db
      .select()
      .from(promptRuns)
      .where(eq(promptRuns.id, id))
      .get();
    return row ? hydrate(row) : undefined;
  }

  async create(data: {
    clientId: number;
    collectionId: number;
    batchId: string;
    totalPrompts: number;
    triggeredBy: "manual" | "schedule";
    triggeredByUserId?: number | null;
  }): Promise<PromptRun> {
    const now = Date.now();
    const row = this._db
      .insert(promptRuns)
      .values({
        clientId: data.clientId,
        collectionId: data.collectionId,
        batchId: data.batchId,
        totalPrompts: data.totalPrompts,
        triggeredBy: data.triggeredBy,
        triggeredByUserId: data.triggeredByUserId ?? null,
        startedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return hydrate(row);
  }

  async updateStatus(id: number, status: PromptRun["status"]): Promise<void> {
    const now = Date.now();
    const isTerminal = status === "complete" || status === "partial" || status === "failed";
    this._db
      .update(promptRuns)
      .set({
        status,
        updatedAt: now,
        ...(isTerminal ? { finishedAt: now } : {}),
      })
      .where(eq(promptRuns.id, id))
      .run();
  }

  async incrementCompleted(id: number): Promise<void> {
    this._db
      .update(promptRuns)
      .set({
        completedPrompts: sql`${promptRuns.completedPrompts} + 1`,
        updatedAt: Date.now(),
      })
      .where(eq(promptRuns.id, id))
      .run();
  }

  async incrementFailed(id: number): Promise<void> {
    this._db
      .update(promptRuns)
      .set({
        failedPrompts: sql`${promptRuns.failedPrompts} + 1`,
        updatedAt: Date.now(),
      })
      .where(eq(promptRuns.id, id))
      .run();
  }
}
