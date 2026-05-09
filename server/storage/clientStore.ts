/*
 * Module/Script Name: clientStore.ts
 * Path: server/storage/clientStore.ts
 *
 * Description:
 * Data-access layer for the clients table. Soft-deletes via deleted_at
 * so historical data is preserved while the client is removed from active lists.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-09
 * Last Modified Date: 2026-05-09
 * Comments:
 * - v1.00 Sprint 1 initial implementation
 */

import { clients } from "@shared/schema";
import type { Client, InsertClient } from "@shared/schema";
import { eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

type DrizzleDb = ReturnType<typeof drizzle>;
type Row = typeof clients.$inferSelect;

function hydrate(row: Row): Client {
  return {
    id: row.id,
    name: row.name,
    primaryDomain: row.primaryDomain,
    geographies: JSON.parse(row.geographies || "[]") as string[],
    exclusions: JSON.parse(row.exclusions || "[]") as string[],
    ownerUserId: row.ownerUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface IClientStore {
  list(): Promise<Client[]>;
  get(id: number): Promise<Client | undefined>;
  create(data: InsertClient): Promise<Client>;
  update(id: number, data: InsertClient): Promise<Client | undefined>;
  delete(id: number): Promise<boolean>;
}

export class ClientStore implements IClientStore {
  constructor(private readonly _db: DrizzleDb) {}

  async list(): Promise<Client[]> {
    const rows = this._db
      .select()
      .from(clients)
      .where(isNull(clients.deletedAt))
      .all();
    return rows.map(hydrate);
  }

  async get(id: number): Promise<Client | undefined> {
    const row = this._db
      .select()
      .from(clients)
      .where(eq(clients.id, id))
      .get();
    if (!row || row.deletedAt !== null) return undefined;
    return hydrate(row);
  }

  async create(data: InsertClient): Promise<Client> {
    const now = Date.now();
    const row = this._db
      .insert(clients)
      .values({
        name: data.name,
        primaryDomain: data.primaryDomain,
        geographies: JSON.stringify(data.geographies ?? []),
        exclusions: JSON.stringify(data.exclusions ?? []),
        ownerUserId: data.ownerUserId ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return hydrate(row);
  }

  async update(id: number, data: InsertClient): Promise<Client | undefined> {
    const existing = this._db
      .select()
      .from(clients)
      .where(eq(clients.id, id))
      .get();
    if (!existing || existing.deletedAt !== null) return undefined;
    const now = Date.now();
    const row = this._db
      .update(clients)
      .set({
        name: data.name,
        primaryDomain: data.primaryDomain,
        geographies: JSON.stringify(data.geographies ?? []),
        exclusions: JSON.stringify(data.exclusions ?? []),
        ownerUserId: data.ownerUserId ?? null,
        updatedAt: now,
      })
      .where(eq(clients.id, id))
      .returning()
      .get();
    return row ? hydrate(row) : undefined;
  }

  async delete(id: number): Promise<boolean> {
    const existing = this._db
      .select()
      .from(clients)
      .where(eq(clients.id, id))
      .get();
    if (!existing || existing.deletedAt !== null) return false;
    this._db
      .update(clients)
      .set({ deletedAt: Date.now(), updatedAt: Date.now() })
      .where(eq(clients.id, id))
      .run();
    return true;
  }
}
