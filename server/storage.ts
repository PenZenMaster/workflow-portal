import type { InsertWorkflow, Workflow, PublicUser } from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import path from "node:path";
import { WorkflowStore } from "./storage/workflowStore";
import { UserStore } from "./storage/userStore";

export type { IWorkflowStore } from "./storage/workflowStore";
export type { IUserStore } from "./storage/userStore";
export { WorkflowStore } from "./storage/workflowStore";
export { UserStore } from "./storage/userStore";

type DrizzleDb = ReturnType<typeof drizzle>;

// SCHEMA_SQL is used by server-side tests to bootstrap an in-memory SQLite DB.
// Keep this in sync with shared/schema.ts and all migration files.
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
    role TEXT NOT NULL DEFAULT 'super_admin',
    email TEXT UNIQUE,
    reset_token_hash TEXT,
    reset_token_expiry INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'queued',
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    next_run_at INTEGER NOT NULL,
    locked_until INTEGER,
    last_error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`;

const rawPath = process.env.DATA_DB_PATH || "data.db";
const dbPath = rawPath === ":memory:" ? rawPath : path.resolve(rawPath);
const defaultSqlite = new Database(dbPath);
defaultSqlite.pragma("journal_mode = WAL");

export const db = drizzle(defaultSqlite);

export interface IStorage {
  listWorkflows(): Promise<Workflow[]>;
  getWorkflow(id: number): Promise<Workflow | undefined>;
  createWorkflow(data: InsertWorkflow): Promise<Workflow>;
  updateWorkflow(id: number, data: InsertWorkflow): Promise<Workflow | undefined>;
  deleteWorkflow(id: number): Promise<boolean>;
  countUsers(): Promise<number>;
  createUser(
    username: string,
    password: string,
    email?: string
  ): Promise<PublicUser>;
  verifyUser(username: string, password: string): Promise<PublicUser | null>;
  getUserById(id: number): Promise<PublicUser | undefined>;
  getUserByEmail(
    email: string
  ): Promise<{ id: number; username: string; email: string } | undefined>;
  setResetToken(userId: number, tokenHash: string, expiry: number): Promise<void>;
  getUserByValidResetToken(
    tokenHash: string,
    now: number
  ): Promise<{ id: number; username: string } | undefined>;
  clearResetToken(userId: number): Promise<void>;
  updatePassword(userId: number, passwordHash: string): Promise<void>;
  setEmail(userId: number, email: string): Promise<void>;
}

// DatabaseStorage composes WorkflowStore and UserStore.
// All existing call sites use the long-name shim methods below so no routes
// or tests need to change. New code should call sub-stores directly.
export class DatabaseStorage implements IStorage {
  private readonly _workflows: WorkflowStore;
  private readonly _users: UserStore;

  constructor(database?: DrizzleDb) {
    const d = database ?? db;
    this._workflows = new WorkflowStore(d);
    this._users = new UserStore(d);
  }

  // --- Workflow delegation shims ---
  listWorkflows() { return this._workflows.list(); }
  getWorkflow(id: number) { return this._workflows.get(id); }
  createWorkflow(data: InsertWorkflow) { return this._workflows.create(data); }
  updateWorkflow(id: number, data: InsertWorkflow) { return this._workflows.update(id, data); }
  deleteWorkflow(id: number) { return this._workflows.delete(id); }

  // --- User delegation shims ---
  countUsers() { return this._users.count(); }
  createUser(username: string, password: string, email?: string) { return this._users.create(username, password, email); }
  verifyUser(username: string, password: string) { return this._users.verify(username, password); }
  getUserById(id: number) { return this._users.getById(id); }
  getUserByEmail(email: string) { return this._users.getByEmail(email); }
  setResetToken(userId: number, tokenHash: string, expiry: number) { return this._users.setResetToken(userId, tokenHash, expiry); }
  getUserByValidResetToken(tokenHash: string, now: number) { return this._users.getByValidResetToken(tokenHash, now); }
  clearResetToken(userId: number) { return this._users.clearResetToken(userId); }
  updatePassword(userId: number, passwordHash: string) { return this._users.updatePassword(userId, passwordHash); }
  setEmail(userId: number, email: string) { return this._users.setEmail(userId, email); }
}

export const storage = new DatabaseStorage();
