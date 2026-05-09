/*
 * Module/Script Name: userStore.ts
 * Path: server/storage/userStore.ts
 *
 * Description:
 * Isolated data-access layer for the users table. Exposes a short
 * method-name API consumed directly by new domain code; DatabaseStorage
 * in storage.ts provides shims so existing call sites keep working unchanged.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-09
 * Last Modified Date: 2026-05-09
 * Comments:
 * - v1.00 Carved out of server/storage.ts for Sprint 0 route/storage split
 */

import { users } from "@shared/schema";
import type { PublicUser, UserRole } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/better-sqlite3";

type DrizzleDb = ReturnType<typeof drizzle>;

export interface IUserStore {
  count(): Promise<number>;
  create(username: string, password: string, email?: string): Promise<PublicUser>;
  verify(username: string, password: string): Promise<PublicUser | null>;
  getById(id: number): Promise<PublicUser | undefined>;
  getByEmail(
    email: string
  ): Promise<{ id: number; username: string; email: string } | undefined>;
  setResetToken(userId: number, tokenHash: string, expiry: number): Promise<void>;
  getByValidResetToken(
    tokenHash: string,
    now: number
  ): Promise<{ id: number; username: string } | undefined>;
  clearResetToken(userId: number): Promise<void>;
  updatePassword(userId: number, passwordHash: string): Promise<void>;
  setEmail(userId: number, email: string): Promise<void>;
}

export class UserStore implements IUserStore {
  constructor(private readonly _db: DrizzleDb) {}

  async count(): Promise<number> {
    const result = this._db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .get();
    return result?.count ?? 0;
  }

  async create(
    username: string,
    password: string,
    email?: string
  ): Promise<PublicUser> {
    const passwordHash = await bcrypt.hash(password, 12);
    const row = this._db
      .insert(users)
      .values({
        username,
        passwordHash,
        email: email ?? null,
        createdAt: Date.now(),
      })
      .returning()
      .get();
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      role: row.role as UserRole,
    };
  }

  async verify(
    username: string,
    password: string
  ): Promise<PublicUser | null> {
    const row = this._db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .get();
    if (!row) return null;
    const ok = await bcrypt.compare(password, row.passwordHash);
    if (!ok) return null;
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      role: row.role as UserRole,
    };
  }

  async getById(id: number): Promise<PublicUser | undefined> {
    const row = this._db.select().from(users).where(eq(users.id, id)).get();
    return row
      ? {
          id: row.id,
          username: row.username,
          email: row.email,
          role: row.role as UserRole,
        }
      : undefined;
  }

  async getByEmail(
    email: string
  ): Promise<{ id: number; username: string; email: string } | undefined> {
    const row = this._db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .get();
    if (!row || !row.email) return undefined;
    return { id: row.id, username: row.username, email: row.email };
  }

  async setResetToken(
    userId: number,
    tokenHash: string,
    expiry: number
  ): Promise<void> {
    this._db
      .update(users)
      .set({ resetTokenHash: tokenHash, resetTokenExpiry: expiry })
      .where(eq(users.id, userId))
      .run();
  }

  async getByValidResetToken(
    tokenHash: string,
    now: number
  ): Promise<{ id: number; username: string } | undefined> {
    const row = this._db
      .select()
      .from(users)
      .where(eq(users.resetTokenHash, tokenHash))
      .get();
    if (!row) return undefined;
    if (!row.resetTokenExpiry || row.resetTokenExpiry < now) return undefined;
    return { id: row.id, username: row.username };
  }

  async clearResetToken(userId: number): Promise<void> {
    this._db
      .update(users)
      .set({ resetTokenHash: null, resetTokenExpiry: null })
      .where(eq(users.id, userId))
      .run();
  }

  async updatePassword(userId: number, passwordHash: string): Promise<void> {
    this._db
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, userId))
      .run();
  }

  async setEmail(userId: number, email: string): Promise<void> {
    this._db
      .update(users)
      .set({ email })
      .where(eq(users.id, userId))
      .run();
  }
}
