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
import { PromptMethodologyStore } from "./storage/promptMethodologyStore";
import { RunStore } from "./storage/runStore";
import { ResponseStore } from "./storage/responseStore";
import { ScheduleStore } from "./storage/scheduleStore";
import { MentionStore } from "./storage/mentionStore";
import { CitationStore } from "./storage/citationStore";
import { RecommendationStore } from "./storage/recommendationStore";
import { MetricStore } from "./storage/metricStore";
import { SentimentStore } from "./storage/sentimentStore";
import { AnnotationStore } from "./storage/annotationStore";
import { ExportStore } from "./storage/exportStore";
import { ShareTokenStore } from "./storage/shareTokenStore";
import { IntegrationStore } from "./storage/integrationStore";
import { JobStore } from "./storage/jobStore";
import { WorkflowInputValueStore } from "./storage/workflowInputValueStore";
import { FactoryJobStore } from "./storage/factoryJobStore";

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
export type { IMentionStore } from "./storage/mentionStore";
export type { ICitationStore } from "./storage/citationStore";
export type { IMetricStore } from "./storage/metricStore";
export type { ISentimentStore } from "./storage/sentimentStore";
export type { IAnnotationStore } from "./storage/annotationStore";
export type { IExportStore } from "./storage/exportStore";
export type { IShareTokenStore } from "./storage/shareTokenStore";
export type { IIntegrationStore } from "./storage/integrationStore";
export type { IJobStore, JobListFilter, JobStatusCounts } from "./storage/jobStore";
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
export { MentionStore } from "./storage/mentionStore";
export { CitationStore } from "./storage/citationStore";
export { MetricStore } from "./storage/metricStore";
export { SentimentStore } from "./storage/sentimentStore";
export { AnnotationStore } from "./storage/annotationStore";
export { ExportStore } from "./storage/exportStore";
export { ShareTokenStore } from "./storage/shareTokenStore";
export { IntegrationStore } from "./storage/integrationStore";
export { JobStore } from "./storage/jobStore";
export { WorkflowInputValueStore } from "./storage/workflowInputValueStore";
export type { IWorkflowInputValueStore } from "./storage/workflowInputValueStore";
export { FactoryJobStore } from "./storage/factoryJobStore";
export type { IFactoryJobStore, FactoryJobListFilter } from "./storage/factoryJobStore";

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
    optional_inputs TEXT NOT NULL DEFAULT '[]',
    tags TEXT NOT NULL DEFAULT '[]',
    prompt TEXT NOT NULL DEFAULT '',
    launch_url TEXT NOT NULL DEFAULT '',
    launch_label TEXT NOT NULL DEFAULT '',
    pinned INTEGER NOT NULL DEFAULT 0,
    accepts_file_upload INTEGER NOT NULL DEFAULT 0,
    ai_adapter_slug TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS workflow_input_values (
    workflow_id INTEGER NOT NULL,
    label TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (workflow_id, label)
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
    core_services TEXT NOT NULL DEFAULT '[]',
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
    intent_type TEXT,
    brand_in_prompt INTEGER,
    service TEXT,
    prompt_family TEXT,
    commercial_value TEXT,
    measurement_purpose TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS prompt_methodologies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active',
    quotas TEXT NOT NULL DEFAULT '{}',
    validation_rules TEXT NOT NULL DEFAULT '{}',
    effective_at INTEGER,
    created_at INTEGER NOT NULL
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
  CREATE TABLE IF NOT EXISTS integrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    kind TEXT NOT NULL DEFAULT 'ga4',
    config TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'active',
    last_synced_at INTEGER,
    last_error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS share_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL DEFAULT 'export',
    resource_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    created_by_user_id INTEGER NOT NULL,
    revoked_at INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS response_sentiment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    response_id INTEGER NOT NULL,
    brand_id INTEGER NOT NULL,
    label TEXT NOT NULL DEFAULT 'neutral',
    score REAL NOT NULL DEFAULT 0,
    confidence REAL NOT NULL DEFAULT 0,
    evidence_excerpt TEXT,
    facet_labels TEXT NOT NULL DEFAULT '[]',
    reviewed_by_user_id INTEGER,
    reviewed_at INTEGER,
    override_label TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS annotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope_kind TEXT NOT NULL DEFAULT 'response',
    scope_id INTEGER NOT NULL,
    author_user_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'internal',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS report_exports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    kind TEXT NOT NULL DEFAULT 'csv-executive',
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    file_path TEXT,
    last_error TEXT,
    requested_by_user_id INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS response_mentions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    response_id INTEGER NOT NULL,
    brand_id INTEGER NOT NULL,
    matched_text TEXT NOT NULL,
    match_type TEXT NOT NULL DEFAULT 'exact',
    section TEXT NOT NULL DEFAULT 'body',
    recommendation_rank INTEGER,
    confidence REAL NOT NULL DEFAULT 1.0,
    evidence_excerpt TEXT
  );
  CREATE TABLE IF NOT EXISTS response_citations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    response_id INTEGER NOT NULL,
    url TEXT NOT NULL,
    root_domain TEXT NOT NULL,
    owned_by_brand_id INTEGER,
    position INTEGER NOT NULL,
    is_trusted_third_party INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS response_recommendations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    response_id INTEGER NOT NULL,
    brand_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    rank INTEGER,
    confidence REAL NOT NULL DEFAULT 0,
    evidence_excerpt TEXT,
    classifier_version TEXT NOT NULL,
    human_status TEXT,
    human_user_id INTEGER,
    human_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS metric_snapshots_daily (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    date_iso TEXT NOT NULL,
    scope_kind TEXT NOT NULL DEFAULT 'overall',
    scope_value TEXT,
    citation_count INTEGER NOT NULL DEFAULT 0,
    mention_count INTEGER NOT NULL DEFAULT 0,
    all_brand_mentions INTEGER NOT NULL DEFAULT 0,
    client_brand_mentions INTEGER NOT NULL DEFAULT 0,
    visibility_score_sum REAL NOT NULL DEFAULT 0,
    prompt_response_count INTEGER NOT NULL DEFAULT 0,
    methodology_version TEXT NOT NULL DEFAULT '1.0'
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
  CREATE TABLE IF NOT EXISTS factory_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL UNIQUE,
    client_id INTEGER NOT NULL,
    contract_version TEXT NOT NULL,
    job_type TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'normal',
    input TEXT NOT NULL DEFAULT '{}',
    dry_run INTEGER NOT NULL DEFAULT 0,
    approval_required INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'queued',
    last_error TEXT,
    output TEXT,
    approved_by INTEGER,
    approved_at INTEGER,
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
  listUsers(): Promise<PublicUser[]>;
  createUser(
    username: string,
    password: string,
    email?: string,
    role?: import("@shared/schema").UserRole
  ): Promise<PublicUser>;
  deleteUser(id: number): Promise<boolean>;
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
  listUsers() { return this._users.listAll(); }
  createUser(username: string, password: string, email?: string, role?: import("@shared/schema").UserRole) { return this._users.create(username, password, email, role); }
  deleteUser(id: number) { return this._users.deleteById(id); }
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
export const promptMethodologyStore = new PromptMethodologyStore(db);
export const runStore = new RunStore(db);
export const responseStore = new ResponseStore(db);
export const scheduleStore = new ScheduleStore(db);
export const mentionStore = new MentionStore(db);
export const citationStore = new CitationStore(db);
export const recommendationStore = new RecommendationStore(db);
export const metricStore = new MetricStore(db);
export const sentimentStore = new SentimentStore(db);
export const annotationStore = new AnnotationStore(db);
export const exportStore = new ExportStore(db);
export const shareTokenStore = new ShareTokenStore(db);
export const integrationStore = new IntegrationStore(db);
export const jobStore = new JobStore(db);
export const workflowInputValueStore = new WorkflowInputValueStore(db);
export const factoryJobStore = new FactoryJobStore(db);
