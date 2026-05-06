import { workflows, users } from "@shared/schema";
import type { InsertWorkflow, Workflow, PublicUser } from "@shared/schema";
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, sql } from "drizzle-orm";
import path from "node:path";

type DrizzleDb = ReturnType<typeof drizzle>;

// SCHEMA_SQL kept for in-memory test fixtures only.
export const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS workflows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    inputs TEXT NOT NULL DEFAULT '[]',
    tags TEXT NOT NULL DEFAULT '[]',
    prompt TEXT NOT NULL DEFAULT '',
    launch_url TEXT NOT NULL DEFAULT '',
    launch_label TEXT NOT NULL DEFAULT '',
    pinned INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`;

const rawPath = process.env.DATA_DB_PATH || "data.db";
const dbPath = rawPath === ":memory:" ? rawPath : path.resolve(rawPath);
const defaultSqlite = new Database(dbPath);
defaultSqlite.pragma("journal_mode = WAL");

export const db = drizzle(defaultSqlite);

type Row = typeof workflows.$inferSelect;

function hydrate(row: Row): Workflow {
  let inputs: string[] = [];
  let tags: string[] = [];
  try {
    inputs = JSON.parse(row.inputs || "[]");
  } catch {
    inputs = [];
  }
  try {
    tags = JSON.parse(row.tags || "[]");
  } catch {
    tags = [];
  }
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    inputs,
    tags,
    prompt: row.prompt,
    launchUrl: row.launchUrl,
    launchLabel: row.launchLabel,
    pinned: !!row.pinned,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface IStorage {
  listWorkflows(): Promise<Workflow[]>;
  getWorkflow(id: number): Promise<Workflow | undefined>;
  createWorkflow(data: InsertWorkflow): Promise<Workflow>;
  updateWorkflow(
    id: number,
    data: InsertWorkflow
  ): Promise<Workflow | undefined>;
  deleteWorkflow(id: number): Promise<boolean>;
  // Auth
  countUsers(): Promise<number>;
  createUser(username: string, password: string): Promise<PublicUser>;
  verifyUser(username: string, password: string): Promise<PublicUser | null>;
  getUserById(id: number): Promise<PublicUser | undefined>;
}

export class DatabaseStorage implements IStorage {
  private readonly _db: DrizzleDb;

  constructor(database?: DrizzleDb) {
    this._db = database ?? db;
  }

  async listWorkflows(): Promise<Workflow[]> {
    const rows = this._db.select().from(workflows).all();
    return rows
      .map(hydrate)
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }

  async getWorkflow(id: number): Promise<Workflow | undefined> {
    const row = this._db.select().from(workflows).where(eq(workflows.id, id)).get();
    return row ? hydrate(row) : undefined;
  }

  async createWorkflow(data: InsertWorkflow): Promise<Workflow> {
    const now = Date.now();
    const row = this._db
      .insert(workflows)
      .values({
        name: data.name,
        category: data.category,
        description: data.description,
        inputs: JSON.stringify(data.inputs ?? []),
        tags: JSON.stringify(data.tags ?? []),
        prompt: data.prompt ?? "",
        launchUrl: data.launchUrl ?? "",
        launchLabel: data.launchLabel ?? "",
        pinned: data.pinned ? 1 : 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return hydrate(row);
  }

  async updateWorkflow(
    id: number,
    data: InsertWorkflow
  ): Promise<Workflow | undefined> {
    const existing = this._db
      .select()
      .from(workflows)
      .where(eq(workflows.id, id))
      .get();
    if (!existing) return undefined;
    const now = Date.now();
    const row = this._db
      .update(workflows)
      .set({
        name: data.name,
        category: data.category,
        description: data.description,
        inputs: JSON.stringify(data.inputs ?? []),
        tags: JSON.stringify(data.tags ?? []),
        prompt: data.prompt ?? "",
        launchUrl: data.launchUrl ?? "",
        launchLabel: data.launchLabel ?? "",
        pinned: data.pinned ? 1 : 0,
        updatedAt: now,
      })
      .where(eq(workflows.id, id))
      .returning()
      .get();
    return row ? hydrate(row) : undefined;
  }

  async deleteWorkflow(id: number): Promise<boolean> {
    const result = this._db.delete(workflows).where(eq(workflows.id, id)).run();
    return result.changes > 0;
  }

  async countUsers(): Promise<number> {
    const result = this._db.select({ count: sql<number>`count(*)` }).from(users).get();
    return result?.count ?? 0;
  }

  async createUser(username: string, password: string): Promise<PublicUser> {
    const passwordHash = await bcrypt.hash(password, 12);
    const row = this._db
      .insert(users)
      .values({
        username,
        passwordHash,
        createdAt: Date.now(),
      })
      .returning()
      .get();
    return { id: row.id, username: row.username };
  }

  async verifyUser(
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
    return { id: row.id, username: row.username };
  }

  async getUserById(id: number): Promise<PublicUser | undefined> {
    const row = this._db.select().from(users).where(eq(users.id, id)).get();
    return row ? { id: row.id, username: row.username } : undefined;
  }
}

export const storage = new DatabaseStorage();
