/*
 * Module/Script Name: integrationStore.ts
 * Path: server/storage/integrationStore.ts
 *
 * Description:
 * Data-access layer for the integrations table. Tracks GA4, Search Console,
 * and future CRM connectors per client. Sensitive credentials (service account
 * paths, API keys) are kept in env vars; only non-sensitive config is stored.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-10
 * Last Modified Date: 2026-05-10
 * Comments:
 * - v1.00 Sprint 7 initial implementation
 */

import { integrations } from "@shared/schema";
import type { Integration, InsertIntegration } from "@shared/schema";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

type DrizzleDb = ReturnType<typeof drizzle>;
type Row = typeof integrations.$inferSelect;

function hydrate(row: Row): Integration {
  return {
    id: row.id,
    clientId: row.clientId,
    kind: row.kind as Integration["kind"],
    config: JSON.parse(row.config || "{}") as Record<string, unknown>,
    status: row.status as Integration["status"],
    lastSyncedAt: row.lastSyncedAt,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface IIntegrationStore {
  listByClient(clientId: number): Promise<Integration[]>;
  get(id: number): Promise<Integration | undefined>;
  create(clientId: number, data: InsertIntegration): Promise<Integration>;
  delete(id: number): Promise<boolean>;
  updateStatus(
    id: number,
    status: Integration["status"],
    extra?: { lastSyncedAt?: number; lastError?: string | null }
  ): Promise<void>;
}

export class IntegrationStore implements IIntegrationStore {
  constructor(private readonly _db: DrizzleDb) {}

  async listByClient(clientId: number): Promise<Integration[]> {
    const rows = this._db
      .select()
      .from(integrations)
      .where(eq(integrations.clientId, clientId))
      .all();
    return rows.map(hydrate);
  }

  async get(id: number): Promise<Integration | undefined> {
    const row = this._db
      .select()
      .from(integrations)
      .where(eq(integrations.id, id))
      .get();
    return row ? hydrate(row) : undefined;
  }

  async create(clientId: number, data: InsertIntegration): Promise<Integration> {
    const now = Date.now();
    const row = this._db
      .insert(integrations)
      .values({
        clientId,
        kind: data.kind,
        config: JSON.stringify(data.config ?? {}),
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return hydrate(row);
  }

  async delete(id: number): Promise<boolean> {
    const result = this._db
      .delete(integrations)
      .where(eq(integrations.id, id))
      .run();
    return result.changes > 0;
  }

  async updateStatus(
    id: number,
    status: Integration["status"],
    extra: { lastSyncedAt?: number; lastError?: string | null } = {}
  ): Promise<void> {
    this._db
      .update(integrations)
      .set({
        status,
        lastSyncedAt: extra.lastSyncedAt ?? undefined,
        lastError: extra.lastError ?? null,
        updatedAt: Date.now(),
      })
      .where(eq(integrations.id, id))
      .run();
  }
}
