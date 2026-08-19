/*
 * Module/Script Name: exportStore.ts
 * Path: server/storage/exportStore.ts
 *
 * Description:
 * Data-access layer for the report_exports table. Tracks CSV export
 * jobs from queued through ready or failed so download links remain
 * stable and audit-traceable.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-10
 * Last Modified Date: 2026-05-10
 * Comments:
 * - v1.00 Sprint 5 initial implementation
 */

import { reportExports } from "@shared/schema";
import type { ReportExport } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

type DrizzleDb = ReturnType<typeof drizzle>;
type Row = typeof reportExports.$inferSelect;

function hydrate(row: Row): ReportExport {
  return {
    id: row.id,
    clientId: row.clientId,
    kind: row.kind as ReportExport["kind"],
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    status: row.status as ReportExport["status"],
    filePath: row.filePath,
    lastError: row.lastError,
    requestedByUserId: row.requestedByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

type ExportCreateInput = Pick<
  ReportExport,
  "clientId" | "kind" | "periodStart" | "periodEnd" | "requestedByUserId"
>;

export interface IExportStore {
  create(data: ExportCreateInput): Promise<ReportExport>;
  get(id: number): Promise<ReportExport | undefined>;
  listByClient(clientId: number): Promise<ReportExport[]>;
  listByStatus(status: ReportExport["status"], limit?: number): Promise<ReportExport[]>;
  updateStatus(
    id: number,
    status: ReportExport["status"],
    extra?: { filePath?: string; lastError?: string }
  ): Promise<void>;
}

export class ExportStore implements IExportStore {
  constructor(private readonly _db: DrizzleDb) {}

  async create(data: ExportCreateInput): Promise<ReportExport> {
    const now = Date.now();
    const row = this._db
      .insert(reportExports)
      .values({
        clientId: data.clientId,
        kind: data.kind,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        requestedByUserId: data.requestedByUserId ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return hydrate(row);
  }

  async get(id: number): Promise<ReportExport | undefined> {
    const row = this._db
      .select()
      .from(reportExports)
      .where(eq(reportExports.id, id))
      .get();
    return row ? hydrate(row) : undefined;
  }

  async listByClient(clientId: number): Promise<ReportExport[]> {
    const rows = this._db
      .select()
      .from(reportExports)
      .where(eq(reportExports.clientId, clientId))
      .orderBy(desc(reportExports.createdAt))
      .all();
    return rows.map(hydrate);
  }

  // Admin Alerts (B-24 sequence item 4) needs every failed export across
  // all clients - listByClient can't answer that without an N+1 loop.
  async listByStatus(status: ReportExport["status"], limit?: number): Promise<ReportExport[]> {
    let query = this._db
      .select()
      .from(reportExports)
      .where(eq(reportExports.status, status))
      .orderBy(desc(reportExports.createdAt))
      .$dynamic();

    if (limit) {
      query = query.limit(limit);
    }

    const rows = query.all();
    return rows.map(hydrate);
  }

  async updateStatus(
    id: number,
    status: ReportExport["status"],
    extra: { filePath?: string; lastError?: string } = {}
  ): Promise<void> {
    this._db
      .update(reportExports)
      .set({
        status,
        filePath: extra.filePath ?? null,
        lastError: extra.lastError ?? null,
        updatedAt: Date.now(),
      })
      .where(eq(reportExports.id, id))
      .run();
  }
}
