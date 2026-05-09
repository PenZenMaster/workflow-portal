/*
 * Module/Script Name: brandStore.ts
 * Path: server/storage/brandStore.ts
 *
 * Description:
 * Data-access layer for the brands table. Brands are canonical entity
 * records for both client brands and competitor brands per client.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-09
 * Last Modified Date: 2026-05-09
 * Comments:
 * - v1.00 Sprint 1 initial implementation
 */

import { brands } from "@shared/schema";
import type { Brand, InsertBrand } from "@shared/schema";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

type DrizzleDb = ReturnType<typeof drizzle>;
type Row = typeof brands.$inferSelect;

function hydrate(row: Row): Brand {
  return {
    id: row.id,
    clientId: row.clientId,
    canonicalName: row.canonicalName,
    kind: row.kind as "client" | "competitor",
    primaryDomain: row.primaryDomain,
    createdAt: row.createdAt,
  };
}

export interface IBrandStore {
  listByClient(clientId: number): Promise<Brand[]>;
  get(id: number): Promise<Brand | undefined>;
  create(clientId: number, data: InsertBrand): Promise<Brand>;
  update(id: number, data: InsertBrand): Promise<Brand | undefined>;
  delete(id: number): Promise<boolean>;
}

export class BrandStore implements IBrandStore {
  constructor(private readonly _db: DrizzleDb) {}

  async listByClient(clientId: number): Promise<Brand[]> {
    const rows = this._db
      .select()
      .from(brands)
      .where(eq(brands.clientId, clientId))
      .all();
    return rows.map(hydrate);
  }

  async get(id: number): Promise<Brand | undefined> {
    const row = this._db.select().from(brands).where(eq(brands.id, id)).get();
    return row ? hydrate(row) : undefined;
  }

  async create(clientId: number, data: InsertBrand): Promise<Brand> {
    const row = this._db
      .insert(brands)
      .values({
        clientId,
        canonicalName: data.canonicalName,
        kind: data.kind ?? "client",
        primaryDomain: data.primaryDomain ?? null,
        createdAt: Date.now(),
      })
      .returning()
      .get();
    return hydrate(row);
  }

  async update(id: number, data: InsertBrand): Promise<Brand | undefined> {
    const existing = this._db.select().from(brands).where(eq(brands.id, id)).get();
    if (!existing) return undefined;
    const row = this._db
      .update(brands)
      .set({
        canonicalName: data.canonicalName,
        kind: data.kind ?? existing.kind,
        primaryDomain: data.primaryDomain ?? null,
      })
      .where(eq(brands.id, id))
      .returning()
      .get();
    return row ? hydrate(row) : undefined;
  }

  async delete(id: number): Promise<boolean> {
    const result = this._db.delete(brands).where(eq(brands.id, id)).run();
    return result.changes > 0;
  }
}
