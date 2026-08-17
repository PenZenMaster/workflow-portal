/*
 * Module/Script Name: jobStore.ts
 * Path: server/storage/jobStore.ts
 *
 * Description:
 * Data-access layer for the jobs table. Supports the admin job-monitoring
 * UI: listing/filtering jobs, status counts, finding hung (orphaned) jobs,
 * and manually requeuing or cancelling a job.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-06-11
 * Last Modified Date: 2026-06-11
 * Comments:
 * - v1.00 Job runner monitoring feature initial implementation
 */

import { jobs } from "@shared/schema";
import type { Job, JobStatus } from "@shared/schema";
import { and, desc, eq, gte, lt, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

type DrizzleDb = ReturnType<typeof drizzle>;
type Row = typeof jobs.$inferSelect;

function hydrate(row: Row): Job {
  return {
    id: row.id,
    kind: row.kind,
    payload: row.payload,
    status: row.status as JobStatus,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    nextRunAt: row.nextRunAt,
    lockedUntil: row.lockedUntil,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface JobListFilter {
  status?: JobStatus;
  kind?: string;
  limit?: number;
}

export type JobStatusCounts = Record<JobStatus, number>;

export interface IJobStore {
  list(filter?: JobListFilter): Promise<Job[]>;
  countByStatus(): Promise<JobStatusCounts>;
  listHung(now: number): Promise<Job[]>;
  listByKindAndResponseIds(
    kind: string,
    responseIds: number[],
    sinceTs: number
  ): Promise<Job[]>;
  existsQueuedOrRunning(kind: string, payloadMatch: Record<string, unknown>): Promise<boolean>;
  get(id: number): Promise<Job | undefined>;
  requeue(id: number): Promise<Job | undefined>;
  cancel(id: number): Promise<Job | undefined>;
  groomTerminal(keepCount: number): Promise<number>;
}

export class JobStore implements IJobStore {
  constructor(private readonly _db: DrizzleDb) {}

  async list(filter: JobListFilter = {}): Promise<Job[]> {
    const conditions = [];
    if (filter.status) conditions.push(eq(jobs.status, filter.status));
    if (filter.kind) conditions.push(eq(jobs.kind, filter.kind));

    let query = this._db
      .select()
      .from(jobs)
      .orderBy(desc(jobs.id))
      .$dynamic();

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    if (filter.limit) {
      query = query.limit(filter.limit);
    }

    const rows = query.all();
    return rows.map(hydrate);
  }

  // FR-002: this is polled every 5s by the admin Jobs page. It previously
  // fetched every row for each status just to count `.length` — a genuine
  // full-table scan five times over on every poll, a real contributor to
  // "the page becomes unresponsive" at 55k+ rows. A single grouped
  // aggregate query returns the same shape without materializing rows.
  async countByStatus(): Promise<JobStatusCounts> {
    const counts: JobStatusCounts = {
      queued: 0,
      running: 0,
      done: 0,
      failed: 0,
      cancelled: 0,
    };
    const rows = this._db
      .select({ status: jobs.status, count: sql<number>`count(*)` })
      .from(jobs)
      .groupBy(jobs.status)
      .all();
    for (const row of rows) {
      counts[row.status as JobStatus] = row.count;
    }
    return counts;
  }

  // FR-002: keeps the jobs table bounded so both the admin list and
  // countByStatus stay fast. Only ever deletes terminal jobs (done/
  // failed/cancelled) — a queued or running job is never deleted no
  // matter its age, since an old "running" job is a hung job for the
  // existing rescue/requeue flow to handle, not something to silently
  // discard. Deletes in batches (SQLite parameter-count limits) via
  // repeated "oldest excess batch beyond the keep window" selects; each
  // pass re-evaluates against the shrinking table, so the keep-window
  // boundary never shifts as rows are removed from below it.
  async groomTerminal(keepCount: number): Promise<number> {
    const BATCH_SIZE = 500;
    let totalDeleted = 0;

    for (;;) {
      const batch = this._db
        .select({ id: jobs.id })
        .from(jobs)
        .where(inArray(jobs.status, ["done", "failed", "cancelled"]))
        .orderBy(desc(jobs.id))
        .offset(keepCount)
        .limit(BATCH_SIZE)
        .all();

      if (batch.length === 0) break;

      this._db
        .delete(jobs)
        .where(inArray(jobs.id, batch.map((row) => row.id)))
        .run();
      totalDeleted += batch.length;
    }

    return totalDeleted;
  }

  async listHung(now: number): Promise<Job[]> {
    const rows = this._db
      .select()
      .from(jobs)
      .where(and(eq(jobs.status, "running"), lt(jobs.lockedUntil, now)))
      .all();
    return rows.map(hydrate);
  }

  async listByKindAndResponseIds(
    kind: string,
    responseIds: number[],
    sinceTs: number
  ): Promise<Job[]> {
    if (responseIds.length === 0) return [];
    const idSet = new Set(responseIds);
    const rows = this._db
      .select()
      .from(jobs)
      .where(and(eq(jobs.kind, kind), gte(jobs.createdAt, sinceTs)))
      .all();
    return rows
      .filter((row) => {
        try {
          const payload = JSON.parse(row.payload) as { responseId?: number };
          return payload.responseId !== undefined && idSet.has(payload.responseId);
        } catch {
          return false;
        }
      })
      .map(hydrate);
  }

  // B-29: a seedRecurring-style dedupe guard, but scoped by a payload
  // field match rather than kind alone - seedRecurring's "any job of
  // this kind" check is too coarse here (e.g. aggregate-snapshot-daily
  // is enqueued per client, so a job in flight for client A must not
  // block enqueuing one for client B). Not race-free under concurrent
  // ticks (check-then-insert, same tolerance as seedRecurring) - the
  // goal is collapsing hundreds of redundant same-client recomputations
  // down to one in flight, not a hard uniqueness guarantee.
  async existsQueuedOrRunning(kind: string, payloadMatch: Record<string, unknown>): Promise<boolean> {
    const rows = this._db
      .select({ payload: jobs.payload })
      .from(jobs)
      .where(and(eq(jobs.kind, kind), inArray(jobs.status, ["queued", "running"])))
      .all();
    return rows.some((row) => {
      try {
        const payload = JSON.parse(row.payload) as Record<string, unknown>;
        return Object.entries(payloadMatch).every(([key, value]) => payload[key] === value);
      } catch {
        return false;
      }
    });
  }

  async get(id: number): Promise<Job | undefined> {
    const row = this._db.select().from(jobs).where(eq(jobs.id, id)).get();
    return row ? hydrate(row) : undefined;
  }

  async requeue(id: number): Promise<Job | undefined> {
    const existing = this._db.select().from(jobs).where(eq(jobs.id, id)).get();
    if (!existing) return undefined;
    const row = this._db
      .update(jobs)
      .set({
        status: "queued",
        attempts: 0,
        lockedUntil: null,
        lastError: null,
        nextRunAt: Date.now(),
        updatedAt: Date.now(),
      })
      .where(eq(jobs.id, id))
      .returning()
      .get();
    return hydrate(row);
  }

  async cancel(id: number): Promise<Job | undefined> {
    const existing = this._db.select().from(jobs).where(eq(jobs.id, id)).get();
    if (!existing) return undefined;
    const row = this._db
      .update(jobs)
      .set({
        status: "cancelled",
        lockedUntil: null,
        updatedAt: Date.now(),
      })
      .where(eq(jobs.id, id))
      .returning()
      .get();
    return hydrate(row);
  }
}
