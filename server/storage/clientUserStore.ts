/*
 * Module/Script Name: clientUserStore.ts
 * Path: server/storage/clientUserStore.ts
 *
 * Description:
 * Data-access layer for the client_users join table. Controls which
 * users have access to which clients. Role-based bypass (super_admin,
 * agency_admin) is handled by requireClientAccess middleware in auth.ts.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-09
 * Last Modified Date: 2026-05-09
 * Comments:
 * - v1.00 Sprint 1 initial implementation
 */

import { clientUsers } from "@shared/schema";
import type { ClientUser } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

type DrizzleDb = ReturnType<typeof drizzle>;
type Row = typeof clientUsers.$inferSelect;

function hydrate(row: Row): ClientUser {
  return {
    id: row.id,
    clientId: row.clientId,
    userId: row.userId,
    roleOverride: row.roleOverride,
    createdAt: row.createdAt,
  };
}

export interface IClientUserStore {
  listByClient(clientId: number): Promise<ClientUser[]>;
  grant(clientId: number, userId: number, roleOverride?: string): Promise<ClientUser>;
  revoke(clientId: number, userId: number): Promise<boolean>;
  canAccess(userId: number, clientId: number): Promise<boolean>;
}

export class ClientUserStore implements IClientUserStore {
  constructor(private readonly _db: DrizzleDb) {}

  async listByClient(clientId: number): Promise<ClientUser[]> {
    const rows = this._db
      .select()
      .from(clientUsers)
      .where(eq(clientUsers.clientId, clientId))
      .all();
    return rows.map(hydrate);
  }

  async grant(
    clientId: number,
    userId: number,
    roleOverride?: string
  ): Promise<ClientUser> {
    const row = this._db
      .insert(clientUsers)
      .values({
        clientId,
        userId,
        roleOverride: roleOverride ?? null,
        createdAt: Date.now(),
      })
      .returning()
      .get();
    return hydrate(row);
  }

  async revoke(clientId: number, userId: number): Promise<boolean> {
    const result = this._db
      .delete(clientUsers)
      .where(
        and(
          eq(clientUsers.clientId, clientId),
          eq(clientUsers.userId, userId)
        )
      )
      .run();
    return result.changes > 0;
  }

  async canAccess(userId: number, clientId: number): Promise<boolean> {
    const row = this._db
      .select()
      .from(clientUsers)
      .where(
        and(
          eq(clientUsers.userId, userId),
          eq(clientUsers.clientId, clientId)
        )
      )
      .get();
    return row !== undefined;
  }
}
