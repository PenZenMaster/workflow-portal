/*
 * Module/Script Name: annotationStore.ts
 * Path: server/storage/annotationStore.ts
 *
 * Description:
 * Data-access layer for the annotations table. Annotations attach analyst
 * notes to any entity (run, prompt, response, client) with a visibility
 * flag controlling whether they appear in client-facing reports.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-10
 * Last Modified Date: 2026-05-10
 * Comments:
 * - v1.00 Sprint 5 initial implementation
 */

import { annotations } from "@shared/schema";
import type { Annotation, InsertAnnotation } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

type DrizzleDb = ReturnType<typeof drizzle>;
type Row = typeof annotations.$inferSelect;

function hydrate(row: Row): Annotation {
  return {
    id: row.id,
    scopeKind: row.scopeKind as Annotation["scopeKind"],
    scopeId: row.scopeId,
    authorUserId: row.authorUserId,
    body: row.body,
    visibility: row.visibility as Annotation["visibility"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface IAnnotationStore {
  listByScope(scopeKind: Annotation["scopeKind"], scopeId: number): Promise<Annotation[]>;
  create(data: InsertAnnotation & { authorUserId: number }): Promise<Annotation>;
  delete(id: number): Promise<boolean>;
}

export class AnnotationStore implements IAnnotationStore {
  constructor(private readonly _db: DrizzleDb) {}

  async listByScope(
    scopeKind: Annotation["scopeKind"],
    scopeId: number
  ): Promise<Annotation[]> {
    const rows = this._db
      .select()
      .from(annotations)
      .where(
        and(eq(annotations.scopeKind, scopeKind), eq(annotations.scopeId, scopeId))
      )
      .all();
    return rows.map(hydrate);
  }

  async create(
    data: InsertAnnotation & { authorUserId: number }
  ): Promise<Annotation> {
    const now = Date.now();
    const row = this._db
      .insert(annotations)
      .values({
        scopeKind: data.scopeKind,
        scopeId: data.scopeId,
        authorUserId: data.authorUserId,
        body: data.body,
        visibility: data.visibility ?? "internal",
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return hydrate(row);
  }

  async delete(id: number): Promise<boolean> {
    const result = this._db
      .delete(annotations)
      .where(eq(annotations.id, id))
      .run();
    return result.changes > 0;
  }
}
