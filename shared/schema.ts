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
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
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
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type PublicUser = { id: number; username: string };

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
