import type { InsertWorkflow, Workflow, PublicUser } from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import path from "node:path";
import { WorkflowStore } from "./storage/workflowStore";
import { UserStore } from "./storage/userStore";
import { ClientStore } from "./storage/clientStore";
import { BrandStore } from "./storage/brandStore";
import { AliasStore } from "./storage/aliasStore";
import { CompetitorStore } from "./storage/competitorStore";
import { ClientUserStore } from "./storage/clientUserStore";
import { PlatformStore } from "./storage/platformStore";
import { PromptCollectionStore } from "./storage/promptCollectionStore";
import { PromptStore } from "./storage/promptStore";
import { RunStore } from "./storage/runStore";
import { ResponseStore } from "./storage/responseStore";
import { ScheduleStore } from "./storage/scheduleStore";

export type { IWorkflowStore } from "./storage/workflowStore";
export type { IUserStore } from "./storage/userStore";
export type { IClientStore } from "./storage/clientStore";
export type { IBrandStore } from "./storage/brandStore";
export type { IAliasStore } from "./storage/aliasStore";
export type { ICompetitorStore } from "./storage/competitorStore";
export type { IClientUserStore } from "./storage/clientUserStore";
export type { IPlatformStore } from "./storage/platformStore";
export type { IPromptCollectionStore } from "./storage/promptCollectionStore";
export type { IPromptStore } from "./storage/promptStore";
export type { IRunStore } from "./storage/runStore";
export type { IResponseStore } from "./storage/responseStore";
export type { IScheduleStore } from "./storage/scheduleStore";
export { WorkflowStore } from "./storage/workflowStore";
export { UserStore } from "./storage/userStore";
export { ClientStore } from "./storage/clientStore";
export { BrandStore } from "./storage/brandStore";
export { AliasStore } from "./storage/aliasStore";
export { CompetitorStore } from "./storage/competitorStore";
export { ClientUserStore } from "./storage/clientUserStore";
export { PlatformStore } from "./storage/platformStore";
export { PromptCollectionStore } from "./storage/promptCollectionStore";
export { PromptStore } from "./storage/promptStore";
export { RunStore } from "./storage/runStore";
export { ResponseStore } from "./storage/responseStore";
export { ScheduleStore } from "./storage/scheduleStore";

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
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    primary_domain TEXT NOT NULL,
    geographies TEXT NOT NULL DEFAULT '[]',
    exclusions TEXT NOT NULL DEFAULT '[]',
    owner_user_id INTEGER,
    deleted_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS brands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    canonical_name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'client',
    primary_domain TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS brand_aliases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    brand_id INTEGER NOT NULL,
    alias_text TEXT NOT NULL,
    match_type TEXT NOT NULL DEFAULT 'exact',
    language TEXT
  );
  CREATE TABLE IF NOT EXISTS competitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    brand_id INTEGER NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS client_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role_override TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS platforms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    config TEXT NOT NULL DEFAULT '{}'
  );
  CREATE TABLE IF NOT EXISTS prompt_collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'draft',
    notes TEXT,
    parent_collection_id INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS prompts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'category',
    funnel_stage TEXT NOT NULL DEFAULT 'awareness',
    geo TEXT,
    device_context TEXT,
    priority_weight REAL NOT NULL DEFAULT 1.0,
    status TEXT NOT NULL DEFAULT 'active',
    target_platforms TEXT NOT NULL DEFAULT '[]',
    position INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS prompt_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    collection_id INTEGER NOT NULL,
    batch_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    triggered_by TEXT NOT NULL DEFAULT 'manual',
    triggered_by_user_id INTEGER,
    total_prompts INTEGER NOT NULL DEFAULT 0,
    completed_prompts INTEGER NOT NULL DEFAULT 0,
    failed_prompts INTEGER NOT NULL DEFAULT 0,
    started_at INTEGER,
    finished_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS responses_raw (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL,
    prompt_id INTEGER NOT NULL,
    platform_id INTEGER NOT NULL,
    query_text TEXT NOT NULL,
    locale TEXT,
    geo TEXT,
    status TEXT NOT NULL DEFAULT 'queued',
    response_text TEXT,
    response_summary_block TEXT,
    model_variant TEXT,
    latency_ms INTEGER,
    raw_payload TEXT,
    error_message TEXT,
    captured_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS run_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    collection_id INTEGER NOT NULL,
    platform_ids TEXT NOT NULL DEFAULT '[]',
    cadence TEXT NOT NULL DEFAULT 'weekly',
    day_of_week INTEGER,
    day_of_month INTEGER,
    hour_utc INTEGER NOT NULL DEFAULT 0,
    last_fired_at INTEGER,
    next_fire_at INTEGER NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
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

// --- AI Visibility domain singletons --------------------------------------
// New code imports these directly rather than going through DatabaseStorage.
// SCHEMA_SQL additions for Sprint 3 tables are in the block above.
export const clientStore = new ClientStore(db);
export const brandStore = new BrandStore(db);
export const aliasStore = new AliasStore(db);
export const competitorStore = new CompetitorStore(db);
export const clientUserStore = new ClientUserStore(db);
export const platformStore = new PlatformStore(db);
export const promptCollectionStore = new PromptCollectionStore(db);
export const promptStore = new PromptStore(db);
export const runStore = new RunStore(db);
export const responseStore = new ResponseStore(db);
export const scheduleStore = new ScheduleStore(db);
