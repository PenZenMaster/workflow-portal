import { sqliteTable, text, integer, real, primaryKey } from "drizzle-orm/sqlite-core";
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
  optionalInputs: text("optional_inputs").notNull().default("[]"),
  // JSON array of strings
  tags: text("tags").notNull().default("[]"),
  prompt: text("prompt").notNull().default(""),
  launchUrl: text("launch_url").notNull().default(""),
  launchLabel: text("launch_label").notNull().default(""),
  pinned: integer("pinned").notNull().default(0),
  acceptsFileUpload: integer("accepts_file_upload").notNull().default(0),
  // Adapter slug for "Run with AI"; null = first configured adapter
  aiAdapterSlug: text("ai_adapter_slug"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// Last-used launch input values, shared across users (B-23). One row per
// workflow + input label; the label is the join key because workflow inputs
// are stored as free-text label lists, not entities.
export const workflowInputValues = sqliteTable(
  "workflow_input_values",
  {
    workflowId: integer("workflow_id").notNull(),
    label: text("label").notNull(),
    value: text("value").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.workflowId, t.label] }),
  })
);

export const saveInputValuesSchema = z.object({
  values: z.record(z.string()),
});

export const insertWorkflowSchema = createInsertSchema(workflows)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    inputs: z.array(z.string()).default([]),
    optionalInputs: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    pinned: z.boolean().default(false),
    acceptsFileUpload: z.boolean().default(false),
    aiAdapterSlug: z.string().nullable().default(null),
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
  optionalInputs: string[];
  tags: string[];
  prompt: string;
  launchUrl: string;
  launchLabel: string;
  pinned: boolean;
  acceptsFileUpload: boolean;
  aiAdapterSlug: string | null;
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

export const USER_ROLES = [
  "super_admin",
  "agency_admin",
  "analyst",
  "account_manager",
  "client_viewer",
] as const satisfies readonly UserRole[];

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
  coreServices: text("core_services").notNull().default("[]"), // JSON string[]
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
  coreServices: z.array(z.string()).default([]),
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
  coreServices: string[];
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
  "informational",
  "comparative",
  "commercial",
  "local",
  "problem_aware",
  "alternative",
] as const;
export type PromptCategory = (typeof PROMPT_CATEGORIES)[number];

// Canonical YLG intent taxonomy (locked 2026-07-12). category is retained
// for backward compatibility during migration; intent_type is the
// measurement-oriented replacement.
export const PROMPT_INTENT_TYPES = [
  "provider_recommendation",
  "service_specific",
  "geographic_discovery",
  "problem_solution",
  "comparison",
  "trust_validation",
  "brand_validation",
  "alternative",
] as const;
export type PromptIntentType = (typeof PROMPT_INTENT_TYPES)[number];

export const COMMERCIAL_VALUES = ["low", "medium", "high"] as const;
export type CommercialValue = (typeof COMMERCIAL_VALUES)[number];

export const MEASUREMENT_PURPOSES = [
  "mention",
  "recommendation",
  "citation",
  "comparison",
  "validation",
] as const;
export type MeasurementPurpose = (typeof MEASUREMENT_PURPOSES)[number];

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
  geo: text("geo"), // doubles as the YLG "location" attribute
  deviceContext: text("device_context"),
  priorityWeight: real("priority_weight").notNull().default(1.0),
  status: text("status").notNull().default("active"), // 'draft' | 'active'
  targetPlatforms: text("target_platforms").notNull().default("[]"), // JSON string[]
  position: integer("position").notNull().default(0),
  // YLG measurement metadata (nullable = not yet classified)
  intentType: text("intent_type"),
  brandInPrompt: integer("brand_in_prompt"), // 0 | 1 | null (null = unvalidated)
  service: text("service"),
  promptFamily: text("prompt_family"),
  commercialValue: text("commercial_value"),
  measurementPurpose: text("measurement_purpose"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const promptMethodologies = sqliteTable("prompt_methodologies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  version: text("version").notNull().unique(),
  status: text("status").notNull().default("active"), // 'draft' | 'active' | 'retired'
  quotas: text("quotas").notNull().default("{}"),               // JSON MethodologyQuotas
  validationRules: text("validation_rules").notNull().default("{}"), // JSON
  effectiveAt: integer("effective_at"),
  createdAt: integer("created_at").notNull(),
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
  intentType: z.enum(PROMPT_INTENT_TYPES).optional(),
  brandInPrompt: z.boolean().optional(),
  service: z.string().optional(),
  promptFamily: z.string().optional(),
  commercialValue: z.enum(COMMERCIAL_VALUES).optional(),
  measurementPurpose: z.enum(MEASUREMENT_PURPOSES).optional(),
});

export const bulkInsertPromptsSchema = z.object({
  prompts: z
    .array(insertPromptSchema)
    .min(1, "At least one prompt required")
    .max(200, "Maximum 200 prompts per bulk import"),
});

export const generatePromptsSchema = z.object({
  count: z.number().int().min(1).max(50).default(12),
});

export type InsertPromptCollection = z.infer<typeof insertPromptCollectionSchema>;
export type InsertPrompt = z.infer<typeof insertPromptSchema>;
export type BulkInsertPrompts = z.infer<typeof bulkInsertPromptsSchema>;
export type GeneratePromptsInput = z.infer<typeof generatePromptsSchema>;

export type GeneratedPromptCandidate = {
  text: string;
  category: PromptCategory; // legacy, derived from intentType during migration
  funnelStage: FunnelStage;
  intentType: PromptIntentType;
  brandInPrompt: boolean;
  service: string | null;
  geo: string | null;
  rationale: string | null; // analyst-facing justification, not persisted
};

export type GenerationInvalidItem = { item: unknown; errors: string[] };

export type GenerationResult = {
  candidates: GeneratedPromptCandidate[];
  invalid: GenerationInvalidItem[];
  warnings: string[];
};

export type ClientReadiness = {
  clientId: number;
  hasClientBrand: boolean;
  competitorBrandCount: number;
  competitorBrandsWithAliasCount: number;
  hasActivePromptCollectionWithPrompts: boolean;
  ready: boolean;
  issues: string[];
};

export type Platform = {
  id: number;
  slug: string;
  displayName: string;
  enabled: boolean;
  config: Record<string, unknown>;
};

export const insertPlatformSchema = z.object({
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase letters, numbers, and hyphens"),
  displayName: z.string().min(1, "Display name is required").max(100),
  config: z.record(z.unknown()).default({}),
});

export const updatePlatformSchema = z.object({
  displayName: z.string().min(1, "Display name is required").max(100).optional(),
  enabled: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});

export type InsertPlatform = z.infer<typeof insertPlatformSchema>;
export type UpdatePlatform = z.infer<typeof updatePlatformSchema>;

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
  intentType: PromptIntentType | null;
  brandInPrompt: boolean | null;
  service: string | null;
  promptFamily: string | null;
  commercialValue: CommercialValue | null;
  measurementPurpose: MeasurementPurpose | null;
  createdAt: number;
  updatedAt: number;
};

export type MethodologyQuotas = {
  panelSize: number;
  nonBranded: number;
  branded: number;
  intentQuotas: Record<string, number>;
  replicates: { nonBranded: number; branded: number };
  surfaces: string[];
  cadence: { full: string; sentinel: string; sentinelSize: number };
};

export type PromptMethodology = {
  id: number;
  version: string;
  status: "draft" | "active" | "retired";
  quotas: MethodologyQuotas;
  validationRules: Record<string, unknown>;
  effectiveAt: number | null;
  createdAt: number;
};

// --- AI Visibility: Integrations ------------------------------------------

export const integrations = sqliteTable("integrations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").notNull(),
  kind: text("kind").notNull().default("ga4"), // ga4 | gsc | crm
  config: text("config").notNull().default("{}"), // JSON (non-sensitive: propertyId, etc.)
  status: text("status").notNull().default("active"), // active | failing | disabled
  lastSyncedAt: integer("last_synced_at"),
  lastError: text("last_error"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const insertIntegrationSchema = z.object({
  kind: z.enum(["ga4", "gsc", "crm"]),
  config: z.record(z.unknown()).default({}),
});

export type InsertIntegration = z.infer<typeof insertIntegrationSchema>;

export type Integration = {
  id: number;
  clientId: number;
  kind: "ga4" | "gsc" | "crm";
  config: Record<string, unknown>;
  status: "active" | "failing" | "disabled";
  lastSyncedAt: number | null;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
};

// --- AI Visibility: Share Tokens ------------------------------------------

export const shareTokens = sqliteTable("share_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind").notNull().default("export"), // export | live-dashboard
  resourceId: integer("resource_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: integer("expires_at").notNull(),
  createdByUserId: integer("created_by_user_id").notNull(),
  revokedAt: integer("revoked_at"),
  createdAt: integer("created_at").notNull(),
});

export const createShareLinkSchema = z.object({
  kind: z.enum(["export", "live-dashboard"]).default("export"),
  resourceId: z.number().int().positive(),
  ttlDays: z.number().int().min(1).max(365).default(30),
});

export type CreateShareLink = z.infer<typeof createShareLinkSchema>;

export type ShareToken = {
  id: number;
  kind: "export" | "live-dashboard";
  resourceId: number;
  tokenHash: string;
  expiresAt: number;
  createdByUserId: number;
  revokedAt: number | null;
  createdAt: number;
};

// --- AI Visibility: Sentiment, Annotations, Exports -----------------------

export const responseSentiment = sqliteTable("response_sentiment", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  responseId: integer("response_id").notNull(),
  brandId: integer("brand_id").notNull(),
  label: text("label").notNull().default("neutral"), // positive|neutral|negative|mixed
  score: real("score").notNull().default(0),          // -1.0 to +1.0
  confidence: real("confidence").notNull().default(0),
  evidenceExcerpt: text("evidence_excerpt"),
  facetLabels: text("facet_labels").notNull().default("[]"), // JSON string[]
  reviewedByUserId: integer("reviewed_by_user_id"),
  reviewedAt: integer("reviewed_at"),
  overrideLabel: text("override_label"),
  createdAt: integer("created_at").notNull(),
});

export const annotations = sqliteTable("annotations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  scopeKind: text("scope_kind").notNull().default("response"), // run|prompt|response|client
  scopeId: integer("scope_id").notNull(),
  authorUserId: integer("author_user_id").notNull(),
  body: text("body").notNull(),
  visibility: text("visibility").notNull().default("internal"), // internal|client
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const reportExports = sqliteTable("report_exports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").notNull(),
  kind: text("kind").notNull().default("csv-executive"), // csv-executive|csv-analyst|csv-mentions
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  status: text("status").notNull().default("queued"), // queued|ready|failed
  filePath: text("file_path"),
  lastError: text("last_error"),
  requestedByUserId: integer("requested_by_user_id"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const insertAnnotationSchema = z.object({
  scopeKind: z.enum(["run", "prompt", "response", "client"]),
  scopeId: z.number().int().positive(),
  body: z.string().min(1, "Annotation body is required"),
  visibility: z.enum(["internal", "client"]).default("internal"),
});

export const triggerExportSchema = z.object({
  kind: z.enum(["csv-executive", "csv-analyst", "csv-mentions"]),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required"),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required"),
});

export const sentimentOverrideSchema = z.object({
  label: z.enum(["positive", "neutral", "negative", "mixed"]),
});

export type InsertAnnotation = z.infer<typeof insertAnnotationSchema>;
export type TriggerExport = z.infer<typeof triggerExportSchema>;
export type SentimentLabel = "positive" | "neutral" | "negative" | "mixed";

export type ResponseSentiment = {
  id: number;
  responseId: number;
  brandId: number;
  label: SentimentLabel;
  score: number;
  confidence: number;
  evidenceExcerpt: string | null;
  facetLabels: string[];
  reviewedByUserId: number | null;
  reviewedAt: number | null;
  overrideLabel: string | null;
  createdAt: number;
};

export type Annotation = {
  id: number;
  scopeKind: "run" | "prompt" | "response" | "client";
  scopeId: number;
  authorUserId: number;
  body: string;
  visibility: "internal" | "client";
  createdAt: number;
  updatedAt: number;
};

export type ReportExport = {
  id: number;
  clientId: number;
  kind: "csv-executive" | "csv-analyst" | "csv-mentions";
  periodStart: string;
  periodEnd: string;
  status: "queued" | "ready" | "failed";
  filePath: string | null;
  lastError: string | null;
  requestedByUserId: number | null;
  createdAt: number;
  updatedAt: number;
};

// --- AI Visibility: Mentions, Citations, Metric Snapshots -----------------

export const responseMentions = sqliteTable("response_mentions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  responseId: integer("response_id").notNull(),
  brandId: integer("brand_id").notNull(),
  matchedText: text("matched_text").notNull(),
  matchType: text("match_type").notNull().default("exact"), // exact | fuzzy | regex
  section: text("section").notNull().default("body"),       // summary | list | body
  recommendationRank: integer("recommendation_rank"),
  confidence: real("confidence").notNull().default(1.0),
  evidenceExcerpt: text("evidence_excerpt"),
});

export const responseCitations = sqliteTable("response_citations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  responseId: integer("response_id").notNull(),
  url: text("url").notNull(),
  rootDomain: text("root_domain").notNull(),
  ownedByBrandId: integer("owned_by_brand_id"),
  position: integer("position").notNull(),
  isTrustedThirdParty: integer("is_trusted_third_party").notNull().default(0),
});

export const metricSnapshotsDaily = sqliteTable("metric_snapshots_daily", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").notNull(),
  dateIso: text("date_iso").notNull(),         // YYYY-MM-DD
  scopeKind: text("scope_kind").notNull().default("overall"), // overall|category|geo|platform|competitor
  scopeValue: text("scope_value"),
  citationCount: integer("citation_count").notNull().default(0),
  mentionCount: integer("mention_count").notNull().default(0),
  allBrandMentions: integer("all_brand_mentions").notNull().default(0),
  clientBrandMentions: integer("client_brand_mentions").notNull().default(0),
  visibilityScoreSum: real("visibility_score_sum").notNull().default(0),
  promptResponseCount: integer("prompt_response_count").notNull().default(0),
  methodologyVersion: text("methodology_version").notNull().default("1.0"),
});

export type ResponseMention = {
  id: number;
  responseId: number;
  brandId: number;
  matchedText: string;
  matchType: "exact" | "fuzzy" | "regex";
  section: "summary" | "list" | "body";
  recommendationRank: number | null;
  confidence: number;
  evidenceExcerpt: string | null;
};

export type ResponseCitation = {
  id: number;
  responseId: number;
  url: string;
  rootDomain: string;
  ownedByBrandId: number | null;
  position: number;
  isTrustedThirdParty: boolean;
};

export type MetricSnapshotDaily = {
  id: number;
  clientId: number;
  dateIso: string;
  scopeKind: "overall" | "category" | "geo" | "platform" | "competitor";
  scopeValue: string | null;
  citationCount: number;
  mentionCount: number;
  allBrandMentions: number;
  clientBrandMentions: number;
  visibilityScoreSum: number;
  promptResponseCount: number;
  methodologyVersion: string;
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

export const JOB_STATUSES = [
  "queued",
  "running",
  "done",
  "failed",
  "cancelled",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export type Job = {
  id: number;
  kind: string;
  payload: string;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  nextRunAt: number;
  lockedUntil: number | null;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
};

// --- Factory (Lights-Out SEO Factory) --------------------------------------

export const factoryJobs = sqliteTable("factory_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: text("job_id").notNull().unique(),
  clientId: integer("client_id").notNull(),
  contractVersion: text("contract_version").notNull(),
  jobType: text("job_type").notNull(),
  priority: text("priority").notNull().default("normal"),
  // JSON object: the contract's input payload
  input: text("input").notNull().default("{}"),
  dryRun: integer("dry_run").notNull().default(0),
  approvalRequired: integer("approval_required").notNull().default(0),
  status: text("status").notNull().default("queued"),
  lastError: text("last_error"),
  // JSON object: the producing cell's result, null until the job completes
  output: text("output"),
  approvedBy: integer("approved_by"),
  approvedAt: integer("approved_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const FACTORY_JOB_STATUSES = [
  "queued",
  "awaiting_approval",
  "running",
  "qa_failed",
  "done",
  "failed",
  "cancelled",
] as const;
export type FactoryJobStatus = (typeof FACTORY_JOB_STATUSES)[number];

export type FactoryJobRecord = {
  id: number;
  jobId: string;
  clientId: number;
  contractVersion: string;
  jobType: string;
  priority: string;
  input: Record<string, unknown>;
  dryRun: boolean;
  approvalRequired: boolean;
  status: FactoryJobStatus;
  lastError: string | null;
  output: Record<string, unknown> | null;
  approvedBy: number | null;
  approvedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

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
