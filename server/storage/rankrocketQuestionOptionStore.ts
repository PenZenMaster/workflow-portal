/*
 * Module/Script Name: rankrocketQuestionOptionStore.ts
 * Path: server/storage/rankrocketQuestionOptionStore.ts
 *
 * Description:
 * Data-access layer for the rankrocket_question_options table - the
 * "What do you want to know about this site?" dropdown options on the
 * RankRocket Site Insights card, previously a hardcoded const array
 * (shared/schema.ts). seedDefaults preserves the original 8 options on
 * first boot, same INSERT-OR-IGNORE-if-empty precedent as
 * platformStore.seedDefaults().
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-17
 * Last Modified Date: 2026-08-17
 * Comments:
 * - v1.00 RankRocket Site Insights admin CRUD, Part C
 */

import { rankrocketQuestionOptions } from "@shared/schema";
import type { RankrocketQuestionOption } from "@shared/schema";
import { asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

type DrizzleDb = ReturnType<typeof drizzle>;
type Row = typeof rankrocketQuestionOptions.$inferSelect;

function hydrate(row: Row): RankrocketQuestionOption {
  return { id: row.id, label: row.label, sortOrder: row.sortOrder };
}

// The original 8 hardcoded options (formerly RANKROCKET_QUESTION_OPTIONS
// in shared/schema.ts), one per site-wide read-only capability that
// needs no extra "which page" parameter.
const DEFAULT_QUESTION_OPTIONS = [
  "Plugin, WordPress, and RankMath status & capabilities",
  "Broken links across the site",
  "Image alt-text coverage across the site",
  "llms.txt drift / diff check",
  "Current redirect rules",
  "Installed text snippets",
  "Performance/cache dequeue and defer rules",
  "Image list and missing-alt count",
] as const;

type CreateInput = { label: string };
type UpdateInput = { label?: string; sortOrder?: number };

export interface IRankrocketQuestionOptionStore {
  list(): Promise<RankrocketQuestionOption[]>;
  create(data: CreateInput): Promise<RankrocketQuestionOption>;
  update(id: number, data: UpdateInput): Promise<RankrocketQuestionOption | undefined>;
  delete(id: number): Promise<boolean>;
  seedDefaults(): Promise<void>;
}

export class RankrocketQuestionOptionStore implements IRankrocketQuestionOptionStore {
  constructor(private readonly _db: DrizzleDb) {}

  async list(): Promise<RankrocketQuestionOption[]> {
    const rows = this._db
      .select()
      .from(rankrocketQuestionOptions)
      .orderBy(asc(rankrocketQuestionOptions.sortOrder))
      .all();
    return rows.map(hydrate);
  }

  async create(data: CreateInput): Promise<RankrocketQuestionOption> {
    const maxRow = this._db
      .select({ max: sql<number | null>`max(${rankrocketQuestionOptions.sortOrder})` })
      .from(rankrocketQuestionOptions)
      .get();
    const nextSortOrder = (maxRow?.max ?? -1) + 1;
    const row = this._db
      .insert(rankrocketQuestionOptions)
      .values({ label: data.label, sortOrder: nextSortOrder })
      .returning()
      .get();
    return hydrate(row);
  }

  async update(id: number, data: UpdateInput): Promise<RankrocketQuestionOption | undefined> {
    const existing = this._db
      .select()
      .from(rankrocketQuestionOptions)
      .where(eq(rankrocketQuestionOptions.id, id))
      .get();
    if (!existing) return undefined;

    const row = this._db
      .update(rankrocketQuestionOptions)
      .set({
        label: data.label ?? existing.label,
        sortOrder: data.sortOrder === undefined ? existing.sortOrder : data.sortOrder,
      })
      .where(eq(rankrocketQuestionOptions.id, id))
      .returning()
      .get();
    return hydrate(row);
  }

  async delete(id: number): Promise<boolean> {
    const result = this._db
      .delete(rankrocketQuestionOptions)
      .where(eq(rankrocketQuestionOptions.id, id))
      .run();
    return result.changes > 0;
  }

  async seedDefaults(): Promise<void> {
    DEFAULT_QUESTION_OPTIONS.forEach((label, index) => {
      this._db
        .insert(rankrocketQuestionOptions)
        .values({ label, sortOrder: index })
        .onConflictDoNothing()
        .run();
    });
  }
}
