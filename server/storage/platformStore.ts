/*
 * Module/Script Name: platformStore.ts
 * Path: server/storage/platformStore.ts
 *
 * Description:
 * Data-access layer for the platforms table. Manages the catalog of
 * supported AI engines. seedDefaults ensures the Perplexity platform
 * exists on startup without duplicating it.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-09
 * Last Modified Date: 2026-05-09
 * Comments:
 * - v1.00 Sprint 2 initial implementation
 */

import { platforms, responsesRaw } from "@shared/schema";
import type { Platform } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

type DrizzleDb = ReturnType<typeof drizzle>;
type Row = typeof platforms.$inferSelect;

function hydrate(row: Row): Platform {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.displayName,
    enabled: row.enabled === 1,
    config: JSON.parse(row.config || "{}") as Record<string, unknown>,
  };
}

const DEFAULT_PLATFORMS = [
  { slug: "perplexity", displayName: "Perplexity" },
  { slug: "openai",     displayName: "ChatGPT (OpenAI)" },
  { slug: "anthropic",  displayName: "Claude (Anthropic)" },
  { slug: "gemini",     displayName: "Gemini (Google)" },
  { slug: "groq",       displayName: "Llama via Groq" },
  { slug: "mistral",    displayName: "Mistral" },
  { slug: "deepseek",   displayName: "DeepSeek" },
] as const;

type CreatePlatformInput = {
  slug: string;
  displayName: string;
  config?: Record<string, unknown>;
};

type UpdatePlatformInput = {
  displayName?: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
};

export interface IPlatformStore {
  list(): Promise<Platform[]>;
  get(id: number): Promise<Platform | undefined>;
  getBySlug(slug: string): Promise<Platform | undefined>;
  create(data: CreatePlatformInput): Promise<Platform>;
  update(id: number, data: UpdatePlatformInput): Promise<Platform | undefined>;
  delete(id: number): Promise<boolean>;
  countResponses(id: number): Promise<number>;
  seedDefaults(): Promise<void>;
}

export class PlatformStore implements IPlatformStore {
  constructor(private readonly _db: DrizzleDb) {}

  async list(): Promise<Platform[]> {
    const rows = this._db.select().from(platforms).all();
    return rows.map(hydrate);
  }

  async get(id: number): Promise<Platform | undefined> {
    const row = this._db
      .select()
      .from(platforms)
      .where(eq(platforms.id, id))
      .get();
    return row ? hydrate(row) : undefined;
  }

  async getBySlug(slug: string): Promise<Platform | undefined> {
    const row = this._db
      .select()
      .from(platforms)
      .where(eq(platforms.slug, slug))
      .get();
    return row ? hydrate(row) : undefined;
  }

  async create(data: CreatePlatformInput): Promise<Platform> {
    const row = this._db
      .insert(platforms)
      .values({
        slug: data.slug,
        displayName: data.displayName,
        enabled: 1,
        config: JSON.stringify(data.config ?? {}),
      })
      .returning()
      .get();
    return hydrate(row);
  }

  async update(id: number, data: UpdatePlatformInput): Promise<Platform | undefined> {
    const existing = this._db.select().from(platforms).where(eq(platforms.id, id)).get();
    if (!existing) return undefined;

    const row = this._db
      .update(platforms)
      .set({
        displayName: data.displayName ?? existing.displayName,
        enabled: data.enabled === undefined ? existing.enabled : data.enabled ? 1 : 0,
        config: data.config === undefined ? existing.config : JSON.stringify(data.config),
      })
      .where(eq(platforms.id, id))
      .returning()
      .get();
    return hydrate(row);
  }

  async delete(id: number): Promise<boolean> {
    const result = this._db.delete(platforms).where(eq(platforms.id, id)).run();
    return result.changes > 0;
  }

  async countResponses(id: number): Promise<number> {
    const row = this._db
      .select({ count: sql<number>`count(*)` })
      .from(responsesRaw)
      .where(eq(responsesRaw.platformId, id))
      .get();
    return row?.count ?? 0;
  }

  async seedDefaults(): Promise<void> {
    // INSERT OR IGNORE per slug — safe to call on existing DBs; adds new platforms
    // without touching existing rows (fixes the "short-circuit on any rows" bug).
    for (const p of DEFAULT_PLATFORMS) {
      this._db
        .insert(platforms)
        .values({ slug: p.slug, displayName: p.displayName, enabled: 1, config: "{}" })
        .onConflictDoNothing()
        .run();
    }
  }
}
