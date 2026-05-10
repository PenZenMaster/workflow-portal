/*
 * Module/Script Name: scheduleStore.ts
 * Path: server/storage/scheduleStore.ts
 *
 * Description:
 * Data-access layer for the run_schedules table. listDue returns
 * schedules whose nextFireAt has passed so the schedule-tick job
 * handler can promote them into prompt runs.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-09
 * Last Modified Date: 2026-05-09
 * Comments:
 * - v1.00 Sprint 3 initial implementation
 */

import { runSchedules } from "@shared/schema";
import type { RunSchedule, InsertSchedule } from "@shared/schema";
import { eq, and, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

type DrizzleDb = ReturnType<typeof drizzle>;
type Row = typeof runSchedules.$inferSelect;

function hydrate(row: Row): RunSchedule {
  return {
    id: row.id,
    clientId: row.clientId,
    collectionId: row.collectionId,
    platformIds: JSON.parse(row.platformIds || "[]") as number[],
    cadence: row.cadence as RunSchedule["cadence"],
    dayOfWeek: row.dayOfWeek,
    dayOfMonth: row.dayOfMonth,
    hourUtc: row.hourUtc,
    lastFiredAt: row.lastFiredAt,
    nextFireAt: row.nextFireAt,
    enabled: row.enabled === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface IScheduleStore {
  listByClient(clientId: number): Promise<RunSchedule[]>;
  get(id: number): Promise<RunSchedule | undefined>;
  create(clientId: number, data: InsertSchedule): Promise<RunSchedule>;
  update(id: number, data: Partial<InsertSchedule>): Promise<RunSchedule | undefined>;
  delete(id: number): Promise<boolean>;
  listDue(now: number): Promise<RunSchedule[]>;
  markFired(id: number, lastFiredAt: number, nextFireAt: number): Promise<void>;
}

export class ScheduleStore implements IScheduleStore {
  constructor(private readonly _db: DrizzleDb) {}

  async listByClient(clientId: number): Promise<RunSchedule[]> {
    const rows = this._db
      .select()
      .from(runSchedules)
      .where(eq(runSchedules.clientId, clientId))
      .all();
    return rows.map(hydrate);
  }

  async get(id: number): Promise<RunSchedule | undefined> {
    const row = this._db
      .select()
      .from(runSchedules)
      .where(eq(runSchedules.id, id))
      .get();
    return row ? hydrate(row) : undefined;
  }

  async create(clientId: number, data: InsertSchedule): Promise<RunSchedule> {
    const now = Date.now();
    const row = this._db
      .insert(runSchedules)
      .values({
        clientId,
        collectionId: data.collectionId,
        platformIds: JSON.stringify(data.platformIds),
        cadence: data.cadence,
        dayOfWeek: data.dayOfWeek ?? null,
        dayOfMonth: data.dayOfMonth ?? null,
        hourUtc: data.hourUtc ?? 0,
        nextFireAt: data.nextFireAt ?? now + 86_400_000,
        enabled: data.enabled !== false ? 1 : 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return hydrate(row);
  }

  async update(
    id: number,
    data: Partial<InsertSchedule>
  ): Promise<RunSchedule | undefined> {
    const existing = this._db
      .select()
      .from(runSchedules)
      .where(eq(runSchedules.id, id))
      .get();
    if (!existing) return undefined;
    const now = Date.now();
    const row = this._db
      .update(runSchedules)
      .set({
        ...(data.platformIds !== undefined && {
          platformIds: JSON.stringify(data.platformIds),
        }),
        ...(data.cadence !== undefined && { cadence: data.cadence }),
        ...(data.dayOfWeek !== undefined && { dayOfWeek: data.dayOfWeek }),
        ...(data.dayOfMonth !== undefined && { dayOfMonth: data.dayOfMonth }),
        ...(data.hourUtc !== undefined && { hourUtc: data.hourUtc }),
        ...(data.enabled !== undefined && { enabled: data.enabled ? 1 : 0 }),
        updatedAt: now,
      })
      .where(eq(runSchedules.id, id))
      .returning()
      .get();
    return row ? hydrate(row) : undefined;
  }

  async delete(id: number): Promise<boolean> {
    const result = this._db
      .delete(runSchedules)
      .where(eq(runSchedules.id, id))
      .run();
    return result.changes > 0;
  }

  async listDue(now: number): Promise<RunSchedule[]> {
    const rows = this._db
      .select()
      .from(runSchedules)
      .where(
        and(eq(runSchedules.enabled, 1), lte(runSchedules.nextFireAt, now))
      )
      .all();
    return rows.map(hydrate);
  }

  async markFired(id: number, lastFiredAt: number, nextFireAt: number): Promise<void> {
    this._db
      .update(runSchedules)
      .set({ lastFiredAt, nextFireAt, updatedAt: Date.now() })
      .where(eq(runSchedules.id, id))
      .run();
  }
}
