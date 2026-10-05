/*
 * Module/Script Name: apiTokenStore.ts
 * Path: server/storage/apiTokenStore.ts
 *
 * Description:
 * Data-access layer for the api_tokens table. Only token hashes are
 * stored. Revocation is scoped to the owning client so one client's
 * admin screen can never revoke another client's token.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-10-05
 * Last Modified Date: 2026-10-05
 * Comments:
 * - v1.00 Initial implementation (Reporting Suite API access)
 */

import { apiTokens } from "@shared/schema";
import type { ApiToken } from "@shared/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

type DrizzleDb = ReturnType<typeof drizzle>;
type Row = typeof apiTokens.$inferSelect;

function hydrate(row: Row): ApiToken {
  return {
    id: row.id,
    clientId: row.clientId,
    name: row.name,
    tokenHash: row.tokenHash,
    tokenPrefix: row.tokenPrefix,
    expiresAt: row.expiresAt,
    createdByUserId: row.createdByUserId,
    revokedAt: row.revokedAt,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
  };
}

export type ApiTokenInput = Omit<ApiToken, "id" | "revokedAt" | "lastUsedAt" | "createdAt">;

export interface IApiTokenStore {
  create(data: ApiTokenInput): Promise<ApiToken>;
  findByHash(tokenHash: string): Promise<ApiToken | undefined>;
  listByClient(clientId: number): Promise<ApiToken[]>;
  revoke(id: number, clientId: number): Promise<boolean>;
  touchLastUsed(id: number, at: number): Promise<void>;
  deleteByClient(clientId: number): Promise<void>;
}

export class ApiTokenStore implements IApiTokenStore {
  constructor(private readonly _db: DrizzleDb) {}

  async create(data: ApiTokenInput): Promise<ApiToken> {
    const row = this._db
      .insert(apiTokens)
      .values({ ...data, createdAt: Date.now() })
      .returning()
      .get();
    return hydrate(row);
  }

  async findByHash(tokenHash: string): Promise<ApiToken | undefined> {
    const row = this._db.select().from(apiTokens).where(eq(apiTokens.tokenHash, tokenHash)).get();
    return row ? hydrate(row) : undefined;
  }

  async listByClient(clientId: number): Promise<ApiToken[]> {
    return this._db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.clientId, clientId))
      .orderBy(desc(apiTokens.id))
      .all()
      .map(hydrate);
  }

  async revoke(id: number, clientId: number): Promise<boolean> {
    const result = this._db
      .update(apiTokens)
      .set({ revokedAt: Date.now() })
      .where(and(eq(apiTokens.id, id), eq(apiTokens.clientId, clientId), isNull(apiTokens.revokedAt)))
      .run();
    return result.changes > 0;
  }

  async touchLastUsed(id: number, at: number): Promise<void> {
    this._db.update(apiTokens).set({ lastUsedAt: at }).where(eq(apiTokens.id, id)).run();
  }

  async deleteByClient(clientId: number): Promise<void> {
    this._db.delete(apiTokens).where(eq(apiTokens.clientId, clientId)).run();
  }
}
