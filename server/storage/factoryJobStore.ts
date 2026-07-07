/*
 * Module/Script Name: factoryJobStore.ts
 * Path: server/storage/factoryJobStore.ts
 *
 * Description:
 * Data-access layer for the factory_jobs table. Persists Lights-Out SEO
 * Factory production jobs created from validated Factory Job Contract v1
 * payloads, and tracks their lifecycle status for the orchestrator.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-07
 * Last Modified Date: 2026-07-07
 * Comments:
 * - v1.00 Initial store: create from contract, lookup, list, status updates
 */

import { factoryJobs } from "@shared/schema";
import type { FactoryJobRecord, FactoryJobStatus } from "@shared/schema";
import type { FactoryJob } from "@shared/factory/job-contract";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

type DrizzleDb = ReturnType<typeof drizzle>;
type Row = typeof factoryJobs.$inferSelect;

function hydrate(row: Row): FactoryJobRecord {
  return {
    id: row.id,
    jobId: row.jobId,
    clientId: row.clientId,
    contractVersion: row.contractVersion,
    jobType: row.jobType,
    priority: row.priority,
    input: JSON.parse(row.input) as Record<string, unknown>,
    dryRun: row.dryRun === 1,
    approvalRequired: row.approvalRequired === 1,
    status: row.status as FactoryJobStatus,
    lastError: row.lastError,
    output: row.output ? (JSON.parse(row.output) as Record<string, unknown>) : null,
    approvedBy: row.approvedBy,
    approvedAt: row.approvedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface FactoryJobListFilter {
  clientId?: number;
  status?: FactoryJobStatus;
  limit?: number;
}

export interface IFactoryJobStore {
  create(contract: FactoryJob): Promise<FactoryJobRecord>;
  get(id: number): Promise<FactoryJobRecord | undefined>;
  getByJobId(jobId: string): Promise<FactoryJobRecord | undefined>;
  list(filter?: FactoryJobListFilter): Promise<FactoryJobRecord[]>;
  updateStatus(
    id: number,
    status: FactoryJobStatus,
    lastError?: string
  ): Promise<FactoryJobRecord | undefined>;
  approve(id: number, userId: number): Promise<FactoryJobRecord | undefined>;
  setOutput(
    id: number,
    output: Record<string, unknown>
  ): Promise<FactoryJobRecord | undefined>;
}

export class FactoryJobStore implements IFactoryJobStore {
  constructor(private readonly _db: DrizzleDb) {}

  async create(contract: FactoryJob): Promise<FactoryJobRecord> {
    const now = Date.now();
    const status: FactoryJobStatus = contract.execution.approvalRequired
      ? "awaiting_approval"
      : "queued";
    const row = this._db
      .insert(factoryJobs)
      .values({
        jobId: contract.jobId,
        clientId: contract.clientId,
        contractVersion: contract.contractVersion,
        jobType: contract.jobType,
        priority: contract.priority,
        input: JSON.stringify(contract.input),
        dryRun: contract.execution.dryRun ? 1 : 0,
        approvalRequired: contract.execution.approvalRequired ? 1 : 0,
        status,
        createdAt: Date.parse(contract.createdAt),
        updatedAt: now,
      })
      .returning()
      .get();
    return hydrate(row);
  }

  async get(id: number): Promise<FactoryJobRecord | undefined> {
    const row = this._db
      .select()
      .from(factoryJobs)
      .where(eq(factoryJobs.id, id))
      .get();
    return row ? hydrate(row) : undefined;
  }

  async getByJobId(jobId: string): Promise<FactoryJobRecord | undefined> {
    const row = this._db
      .select()
      .from(factoryJobs)
      .where(eq(factoryJobs.jobId, jobId))
      .get();
    return row ? hydrate(row) : undefined;
  }

  async list(filter: FactoryJobListFilter = {}): Promise<FactoryJobRecord[]> {
    const conditions = [];
    if (filter.clientId !== undefined) {
      conditions.push(eq(factoryJobs.clientId, filter.clientId));
    }
    if (filter.status) {
      conditions.push(eq(factoryJobs.status, filter.status));
    }

    let query = this._db
      .select()
      .from(factoryJobs)
      .orderBy(desc(factoryJobs.id))
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

  async updateStatus(
    id: number,
    status: FactoryJobStatus,
    lastError?: string
  ): Promise<FactoryJobRecord | undefined> {
    const existing = this._db
      .select()
      .from(factoryJobs)
      .where(eq(factoryJobs.id, id))
      .get();
    if (!existing) return undefined;
    const row = this._db
      .update(factoryJobs)
      .set({
        status,
        lastError: lastError ?? null,
        updatedAt: Date.now(),
      })
      .where(eq(factoryJobs.id, id))
      .returning()
      .get();
    return hydrate(row);
  }

  async approve(
    id: number,
    userId: number
  ): Promise<FactoryJobRecord | undefined> {
    const existing = this._db
      .select()
      .from(factoryJobs)
      .where(eq(factoryJobs.id, id))
      .get();
    if (!existing) return undefined;
    const now = Date.now();
    const row = this._db
      .update(factoryJobs)
      .set({
        status: "queued",
        approvedBy: userId,
        approvedAt: now,
        updatedAt: now,
      })
      .where(eq(factoryJobs.id, id))
      .returning()
      .get();
    return hydrate(row);
  }

  async setOutput(
    id: number,
    output: Record<string, unknown>
  ): Promise<FactoryJobRecord | undefined> {
    const existing = this._db
      .select()
      .from(factoryJobs)
      .where(eq(factoryJobs.id, id))
      .get();
    if (!existing) return undefined;
    const row = this._db
      .update(factoryJobs)
      .set({
        output: JSON.stringify(output),
        updatedAt: Date.now(),
      })
      .where(eq(factoryJobs.id, id))
      .returning()
      .get();
    return hydrate(row);
  }
}
