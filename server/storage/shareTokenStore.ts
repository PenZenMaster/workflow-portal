/*
 * Module/Script Name: shareTokenStore.ts
 * Path: server/storage/shareTokenStore.ts
 *
 * Description:
 * Data-access layer for the share_tokens table. Raw tokens are never
 * stored — only their SHA-256 hash so revocation cannot be circumvented
 * by reading the DB.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-10
 * Last Modified Date: 2026-05-10
 * Comments:
 * - v1.00 Sprint 6 initial implementation
 */

import { shareTokens } from "@shared/schema";
import type { ShareToken } from "@shared/schema";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

type DrizzleDb = ReturnType<typeof drizzle>;
type Row = typeof shareTokens.$inferSelect;

function hydrate(row: Row): ShareToken {
  return {
    id: row.id,
    kind: row.kind as ShareToken["kind"],
    resourceId: row.resourceId,
    tokenHash: row.tokenHash,
    expiresAt: row.expiresAt,
    createdByUserId: row.createdByUserId,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
  };
}

export interface IShareTokenStore {
  create(data: Omit<ShareToken, "id" | "revokedAt" | "createdAt">): Promise<ShareToken>;
  findByHash(tokenHash: string): Promise<ShareToken | undefined>;
  get(id: number): Promise<ShareToken | undefined>;
  revoke(id: number): Promise<boolean>;
}

export class ShareTokenStore implements IShareTokenStore {
  constructor(private readonly _db: DrizzleDb) {}

  async create(data: Omit<ShareToken, "id" | "revokedAt" | "createdAt">): Promise<ShareToken> {
    const row = this._db
      .insert(shareTokens)
      .values({
        kind: data.kind,
        resourceId: data.resourceId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        createdByUserId: data.createdByUserId,
        createdAt: Date.now(),
      })
      .returning()
      .get();
    return hydrate(row);
  }

  async findByHash(tokenHash: string): Promise<ShareToken | undefined> {
    const row = this._db
      .select()
      .from(shareTokens)
      .where(eq(shareTokens.tokenHash, tokenHash))
      .get();
    return row ? hydrate(row) : undefined;
  }

  async get(id: number): Promise<ShareToken | undefined> {
    const row = this._db
      .select()
      .from(shareTokens)
      .where(eq(shareTokens.id, id))
      .get();
    return row ? hydrate(row) : undefined;
  }

  async revoke(id: number): Promise<boolean> {
    const result = this._db
      .update(shareTokens)
      .set({ revokedAt: Date.now() })
      .where(eq(shareTokens.id, id))
      .run();
    return result.changes > 0;
  }
}
