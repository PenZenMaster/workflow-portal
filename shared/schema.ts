import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
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
