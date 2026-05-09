/*
 * Module/Script Name: competitorStore.ts
 * Path: server/storage/competitorStore.ts
 *
 * Description:
 * Data-access layer for the competitors table — the priority-ordered
 * list of competitor brands tracked per client.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-09
 * Last Modified Date: 2026-05-09
 * Comments:
 * - v1.00 Sprint 1 initial implementation
 */

import { competitors } from "@shared/schema";
import type { Competitor } from "@shared/schema";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

type DrizzleDb = ReturnType<typeof drizzle>;
type Row = typeof competitors.$inferSelect;

function hydrate(row: Row): Competitor {
  return {
    id: row.id,
    clientId: row.clientId,
    brandId: row.brandId,
    priority: row.priority,
  };
}

export interface ICompetitorStore {
  listByClient(clientId: number): Promise<Competitor[]>;
  create(clientId: number, brandId: number, priority: number): Promise<Competitor>;
  delete(id: number): Promise<boolean>;
}

export class CompetitorStore implements ICompetitorStore {
  constructor(private readonly _db: DrizzleDb) {}

  async listByClient(clientId: number): Promise<Competitor[]> {
    const rows = this._db
      .select()
      .from(competitors)
      .where(eq(competitors.clientId, clientId))
      .all();
    return rows.map(hydrate).sort((a, b) => a.priority - b.priority);
  }

  async create(
    clientId: number,
    brandId: number,
    priority: number
  ): Promise<Competitor> {
    const row = this._db
      .insert(competitors)
      .values({ clientId, brandId, priority })
      .returning()
      .get();
    return hydrate(row);
  }

  async delete(id: number): Promise<boolean> {
    const result = this._db
      .delete(competitors)
      .where(eq(competitors.id, id))
      .run();
    return result.changes > 0;
  }
}
