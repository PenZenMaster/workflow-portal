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

import { jobs, JOB_STATUSES } from "@shared/schema";
import type { Job, JobStatus } from "@shared/schema";
import { and, desc, eq, gte, lt } from "drizzle-orm";
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
  get(id: number): Promise<Job | undefined>;
  requeue(id: number): Promise<Job | undefined>;
  cancel(id: number): Promise<Job | undefined>;
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

  async countByStatus(): Promise<JobStatusCounts> {
    const counts: JobStatusCounts = {
      queued: 0,
      running: 0,
      done: 0,
      failed: 0,
      cancelled: 0,
    };
    for (const status of JOB_STATUSES) {
      const rows = this._db
        .select()
        .from(jobs)
        .where(eq(jobs.status, status))
        .all();
      counts[status] = rows.length;
    }
    return counts;
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
