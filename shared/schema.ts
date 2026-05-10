import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const workflows = sqliteTable("workflows", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  // JSON array of strings
  inputs: text("inputs").notNull().default("[]"),
  // JSON array of strings
  tags: text("tags").notNull().default("[]"),
  prompt: text("prompt").notNull().default(""),
  launchUrl: text("launch_url").notNull().default(""),
  launchLabel: text("launch_label").notNull().default(""),
  pinned: integer("pinned").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const insertWorkflowSchema = createInsertSchema(workflows)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    inputs: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    pinned: z.boolean().default(false),
    name: z.string().min(1, "Name is required"),
    category: z.string().min(1, "Category is required"),
    description: z.string().min(1, "Description is required"),
    prompt: z.string().default(""),
    launchUrl: z.string().default(""),
    launchLabel: z.string().default(""),
  });

export type InsertWorkflow = z.infer<typeof insertWorkflowSchema>;

// Hydrated workflow as returned by the API (arrays parsed, pinned as boolean)
export type Workflow = {
  id: number;
  name: string;
  category: string;
  description: string;
  inputs: string[];
  tags: string[];
  prompt: string;
  launchUrl: string;
  launchLabel: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
};

// --- Users -----------------------------------------------------------------

export type UserRole =
  | "super_admin"
  | "agency_admin"
  | "analyst"
  | "account_manager"
  | "client_viewer";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("super_admin"),
  email: text("email").unique(),
  resetTokenHash: text("reset_token_hash"),
  resetTokenExpiry: integer("reset_token_expiry"),
  createdAt: integer("created_at").notNull(),
});

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const createUserSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(40, "Username must be 40 characters or fewer")
    .regex(/^[a-zA-Z0-9_.-]+$/, "Letters, numbers, underscore, dot, dash only"),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(200, "Password too long"),
  email: z.string().email("Invalid email address").optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required"),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(200, "Password too long"),
});

export const updateProfileSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type PublicUser = {
  id: number;
  username: string;
  email?: string | null;
  role: UserRole;
};

// --- AI Visibility: Clients, Brands, Aliases, Competitors, ClientUsers -----

export const clients = sqliteTable("clients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  primaryDomain: text("primary_domain").notNull(),
  geographies: text("geographies").notNull().default("[]"), // JSON string[]
  exclusions: text("exclusions").notNull().default("[]"),   // JSON string[]
  ownerUserId: integer("owner_user_id"),
  deletedAt: integer("deleted_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const brands = sqliteTable("brands", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").notNull(),
  canonicalName: text("canonical_name").notNull(),
  kind: text("kind").notNull().default("client"), // 'client' | 'competitor'
  primaryDomain: text("primary_domain"),
  createdAt: integer("created_at").notNull(),
});

export const brandAliases = sqliteTable("brand_aliases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  brandId: integer("brand_id").notNull(),
  aliasText: text("alias_text").notNull(),
  matchType: text("match_type").notNull().default("exact"), // 'exact' | 'fuzzy' | 'regex'
  language: text("language"),
});

export const competitors = sqliteTable("competitors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").notNull(),
  brandId: integer("brand_id").notNull(),
  priority: integer("priority").notNull().default(0),
});

export const clientUsers = sqliteTable("client_users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").notNull(),
  userId: integer("user_id").notNull(),
  roleOverride: text("role_override"),
  createdAt: integer("created_at").notNull(),
});

// Zod schemas for client-domain API boundaries
export const insertClientSchema = z.object({
  name: z.string().min(1, "Name is required"),
  primaryDomain: z.string().min(1, "Primary domain is required"),
  geographies: z.array(z.string()).default([]),
  exclusions: z.array(z.string()).default([]),
  ownerUserId: z.number().int().optional(),
});

export const insertBrandSchema = z.object({
  canonicalName: z.string().min(1, "Brand name is required"),
  kind: z.enum(["client", "competitor"]).default("client"),
  primaryDomain: z.string().optional(),
});

export const insertBrandAliasSchema = z.object({
  aliasText: z.string().min(1, "Alias text is required"),
  matchType: z.enum(["exact", "fuzzy", "regex"]).default("exact"),
  language: z.string().optional(),
});

export const insertCompetitorSchema = z.object({
  canonicalName: z.string().min(1, "Competitor name is required"),
  primaryDomain: z.string().optional(),
  priority: z.number().int().default(0),
});

export const grantClientUserSchema = z.object({
  userId: z.number().int().positive("User ID is required"),
  roleOverride: z
    .enum(["analyst", "account_manager", "client_viewer"])
    .optional(),
});

export type InsertClient = z.infer<typeof insertClientSchema>;
export type InsertBrand = z.infer<typeof insertBrandSchema>;
export type InsertBrandAlias = z.infer<typeof insertBrandAliasSchema>;
export type InsertCompetitor = z.infer<typeof insertCompetitorSchema>;
export type GrantClientUser = z.infer<typeof grantClientUserSchema>;

export type Client = {
  id: number;
  name: string;
  primaryDomain: string;
  geographies: string[];
  exclusions: string[];
  ownerUserId: number | null;
  createdAt: number;
  updatedAt: number;
};

export type Brand = {
  id: number;
  clientId: number;
  canonicalName: string;
  kind: "client" | "competitor";
  primaryDomain: string | null;
  createdAt: number;
};

export type BrandAlias = {
  id: number;
  brandId: number;
  aliasText: string;
  matchType: "exact" | "fuzzy" | "regex";
  language: string | null;
};

export type Competitor = {
  id: number;
  clientId: number;
  brandId: number;
  priority: number;
};

export type ClientUser = {
  id: number;
  clientId: number;
  userId: number;
  roleOverride: string | null;
  createdAt: number;
};

// --- AI Visibility: Platforms, Prompt Collections, Prompts ----------------

export const PROMPT_CATEGORIES = [
  "category",
  "problem",
  "comparison",
  "alternative",
  "brand",
  "reputation",
  "local",
] as const;
export type PromptCategory = (typeof PROMPT_CATEGORIES)[number];

export const FUNNEL_STAGES = ["awareness", "consideration", "decision"] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export const platforms = sqliteTable("platforms", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  displayName: text("display_name").notNull(),
  enabled: integer("enabled").notNull().default(1), // 0 | 1
  config: text("config").notNull().default("{}"),   // JSON
});

export const promptCollections = sqliteTable("prompt_collections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").notNull(),
  name: text("name").notNull(),
  version: integer("version").notNull().default(1),
  status: text("status").notNull().default("draft"), // 'draft' | 'active' | 'archived'
  notes: text("notes"),
  parentCollectionId: integer("parent_collection_id"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const prompts = sqliteTable("prompts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  collectionId: integer("collection_id").notNull(),
  text: text("text").notNull(),
  category: text("category").notNull().default("category"),
  funnelStage: text("funnel_stage").notNull().default("awareness"),
  geo: text("geo"),
  deviceContext: text("device_context"),
  priorityWeight: real("priority_weight").notNull().default(1.0),
  status: text("status").notNull().default("active"), // 'draft' | 'active'
  targetPlatforms: text("target_platforms").notNull().default("[]"), // JSON string[]
  position: integer("position").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const insertPromptCollectionSchema = z.object({
  name: z.string().min(1, "Name is required"),
  notes: z.string().optional(),
});

export const insertPromptSchema = z.object({
  text: z.string().min(1, "Prompt text is required"),
  category: z.enum(PROMPT_CATEGORIES),
  funnelStage: z.enum(FUNNEL_STAGES).default("awareness"),
  geo: z.string().optional(),
  deviceContext: z.string().optional(),
  priorityWeight: z.number().min(0).max(10).default(1),
  status: z.enum(["draft", "active"]).default("active"),
  targetPlatforms: z.array(z.string()).default([]),
  position: z.number().int().default(0),
});

export const bulkInsertPromptsSchema = z.object({
  prompts: z
    .array(insertPromptSchema)
    .min(1, "At least one prompt required")
    .max(200, "Maximum 200 prompts per bulk import"),
});

export type InsertPromptCollection = z.infer<typeof insertPromptCollectionSchema>;
export type InsertPrompt = z.infer<typeof insertPromptSchema>;
export type BulkInsertPrompts = z.infer<typeof bulkInsertPromptsSchema>;

export type Platform = {
  id: number;
  slug: string;
  displayName: string;
  enabled: boolean;
  config: Record<string, unknown>;
};

export type PromptCollection = {
  id: number;
  clientId: number;
  name: string;
  version: number;
  status: "draft" | "active" | "archived";
  notes: string | null;
  parentCollectionId: number | null;
  createdAt: number;
  updatedAt: number;
};

export type Prompt = {
  id: number;
  collectionId: number;
  text: string;
  category: PromptCategory;
  funnelStage: FunnelStage;
  geo: string | null;
  deviceContext: string | null;
  priorityWeight: number;
  status: "draft" | "active";
  targetPlatforms: string[];
  position: number;
  createdAt: number;
  updatedAt: number;
};

// --- AI Visibility: Runs, Responses, Schedules ----------------------------

export const promptRuns = sqliteTable("prompt_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").notNull(),
  collectionId: integer("collection_id").notNull(),
  batchId: text("batch_id").notNull(),
  status: text("status").notNull().default("queued"), // queued|running|partial|complete|failed
  triggeredBy: text("triggered_by").notNull().default("manual"), // manual|schedule
  triggeredByUserId: integer("triggered_by_user_id"),
  totalPrompts: integer("total_prompts").notNull().default(0),
  completedPrompts: integer("completed_prompts").notNull().default(0),
  failedPrompts: integer("failed_prompts").notNull().default(0),
  startedAt: integer("started_at"),
  finishedAt: integer("finished_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const responsesRaw = sqliteTable("responses_raw", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: integer("run_id").notNull(),
  promptId: integer("prompt_id").notNull(),
  platformId: integer("platform_id").notNull(),
  queryText: text("query_text").notNull(),
  locale: text("locale"),
  geo: text("geo"),
  status: text("status").notNull().default("queued"), // queued|running|complete|failed
  responseText: text("response_text"),
  responseSummaryBlock: text("response_summary_block"),
  modelVariant: text("model_variant"),
  latencyMs: integer("latency_ms"),
  rawPayload: text("raw_payload"), // JSON
  errorMessage: text("error_message"),
  capturedAt: integer("captured_at").notNull(),
});

export const runSchedules = sqliteTable("run_schedules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").notNull(),
  collectionId: integer("collection_id").notNull(),
  platformIds: text("platform_ids").notNull().default("[]"), // JSON number[]
  cadence: text("cadence").notNull().default("weekly"), // weekly|monthly
  dayOfWeek: integer("day_of_week"), // 0-6
  dayOfMonth: integer("day_of_month"), // 1-28
  hourUtc: integer("hour_utc").notNull().default(0),
  lastFiredAt: integer("last_fired_at"),
  nextFireAt: integer("next_fire_at").notNull(),
  enabled: integer("enabled").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const triggerRunSchema = z.object({
  collectionId: z.number().int().positive("Collection ID is required"),
  platformIds: z
    .array(z.number().int().positive())
    .min(1, "At least one platform is required"),
});

export const insertScheduleSchema = z.object({
  collectionId: z.number().int().positive(),
  platformIds: z.array(z.number().int().positive()).min(1),
  cadence: z.enum(["weekly", "monthly"]),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  dayOfMonth: z.number().int().min(1).max(28).optional(),
  hourUtc: z.number().int().min(0).max(23).default(0),
  nextFireAt: z.number().int().optional(),
  enabled: z.boolean().default(true),
});

export type TriggerRun = z.infer<typeof triggerRunSchema>;
export type InsertSchedule = z.infer<typeof insertScheduleSchema>;

export type PromptRun = {
  id: number;
  clientId: number;
  collectionId: number;
  batchId: string;
  status: "queued" | "running" | "partial" | "complete" | "failed";
  triggeredBy: "manual" | "schedule";
  triggeredByUserId: number | null;
  totalPrompts: number;
  completedPrompts: number;
  failedPrompts: number;
  startedAt: number | null;
  finishedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type ResponseRaw = {
  id: number;
  runId: number;
  promptId: number;
  platformId: number;
  queryText: string;
  locale: string | null;
  geo: string | null;
  status: "queued" | "running" | "complete" | "failed";
  responseText: string | null;
  responseSummaryBlock: string | null;
  modelVariant: string | null;
  latencyMs: number | null;
  rawPayload: unknown;
  errorMessage: string | null;
  capturedAt: number;
};

export type RunSchedule = {
  id: number;
  clientId: number;
  collectionId: number;
  platformIds: number[];
  cadence: "weekly" | "monthly";
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  hourUtc: number;
  lastFiredAt: number | null;
  nextFireAt: number;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};

// --- Jobs ------------------------------------------------------------------

export const jobs = sqliteTable("jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind").notNull(),
  payload: text("payload").notNull().default("{}"),
  status: text("status").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  nextRunAt: integer("next_run_at").notNull(),
  lockedUntil: integer("locked_until"),
  lastError: text("last_error"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// --- Constants -------------------------------------------------------------

export const CATEGORIES = [
  "Audit",
  "Schema",
  "Reporting",
  "Verification",
  "Automation",
  "Content",
  "Local SEO",
  "Other",
] as const;
