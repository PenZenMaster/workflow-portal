/*
 * Module/Script Name: aliasStore.ts
 * Path: server/storage/aliasStore.ts
 *
 * Description:
 * Data-access layer for the brand_aliases table. Aliases enable flexible
 * mention detection for brands that appear under alternate names.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-09
 * Last Modified Date: 2026-05-09
 * Comments:
 * - v1.00 Sprint 1 initial implementation
 */

import { brandAliases } from "@shared/schema";
import type { BrandAlias, InsertBrandAlias } from "@shared/schema";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

type DrizzleDb = ReturnType<typeof drizzle>;
type Row = typeof brandAliases.$inferSelect;

function hydrate(row: Row): BrandAlias {
  return {
    id: row.id,
    brandId: row.brandId,
    aliasText: row.aliasText,
    matchType: row.matchType as "exact" | "fuzzy" | "regex",
    language: row.language,
  };
}

export interface IAliasStore {
  listByBrand(brandId: number): Promise<BrandAlias[]>;
  create(brandId: number, data: InsertBrandAlias): Promise<BrandAlias>;
  delete(id: number): Promise<boolean>;
}

export class AliasStore implements IAliasStore {
  constructor(private readonly _db: DrizzleDb) {}

  async listByBrand(brandId: number): Promise<BrandAlias[]> {
    const rows = this._db
      .select()
      .from(brandAliases)
      .where(eq(brandAliases.brandId, brandId))
      .all();
    return rows.map(hydrate);
  }

  async create(brandId: number, data: InsertBrandAlias): Promise<BrandAlias> {
    const row = this._db
      .insert(brandAliases)
      .values({
        brandId,
        aliasText: data.aliasText,
        matchType: data.matchType ?? "exact",
        language: data.language ?? null,
      })
      .returning()
      .get();
    return hydrate(row);
  }

  async delete(id: number): Promise<boolean> {
    const result = this._db
      .delete(brandAliases)
      .where(eq(brandAliases.id, id))
      .run();
    return result.changes > 0;
  }
}
