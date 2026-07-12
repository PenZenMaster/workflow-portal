/*
 * Module/Script Name: promptMethodologyStore.ts
 * Path: server/storage/promptMethodologyStore.ts
 *
 * Description:
 * Data-access layer for the prompt_methodologies table. seedDefaults
 * inserts the YLG methodology v1.0 (panel quotas approved 2026-07-12)
 * on startup without duplicating it. Methodology rows are versioned and
 * never edited in place - a quota change is a new version.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-12
 * Last Modified Date: 2026-07-12
 * Comments:
 * - v1.00 YLG foundation sprint initial implementation
 */

import { promptMethodologies } from "@shared/schema";
import type { PromptMethodology, MethodologyQuotas } from "@shared/schema";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

type DrizzleDb = ReturnType<typeof drizzle>;
type Row = typeof promptMethodologies.$inferSelect;

// YLG methodology v1.0 - approved as written 2026-07-12. The 30-prompt
// panel distribution comes from the prompt-generation spec section 4.1;
// replicates/surfaces/cadence from the visibility spec Phase 0.
export const METHODOLOGY_V1_QUOTAS: MethodologyQuotas = {
  panelSize: 30,
  nonBranded: 24,
  branded: 6,
  intentQuotas: {
    provider_recommendation: 8,
    service_specific: 6,
    problem_solution: 5,
    geographic_discovery: 5,
    comparison: 3,
    brand_validation: 3,
  },
  replicates: { nonBranded: 3, branded: 1 },
  surfaces: ["chatgpt-search", "google-ai", "gemini", "perplexity"],
  cadence: { full: "monthly", sentinel: "weekly", sentinelSize: 8 },
};

function hydrate(row: Row): PromptMethodology {
  return {
    id: row.id,
    version: row.version,
    status: row.status as PromptMethodology["status"],
    quotas: JSON.parse(row.quotas || "{}") as MethodologyQuotas,
    validationRules: JSON.parse(row.validationRules || "{}") as Record<string, unknown>,
    effectiveAt: row.effectiveAt,
    createdAt: row.createdAt,
  };
}

export interface IPromptMethodologyStore {
  list(): Promise<PromptMethodology[]>;
  getActive(): Promise<PromptMethodology | undefined>;
  getByVersion(version: string): Promise<PromptMethodology | undefined>;
  seedDefaults(): Promise<void>;
}

export class PromptMethodologyStore implements IPromptMethodologyStore {
  constructor(private readonly _db: DrizzleDb) {}

  async list(): Promise<PromptMethodology[]> {
    const rows = this._db.select().from(promptMethodologies).all();
    return rows.map(hydrate);
  }

  async getActive(): Promise<PromptMethodology | undefined> {
    const row = this._db
      .select()
      .from(promptMethodologies)
      .where(eq(promptMethodologies.status, "active"))
      .get();
    return row ? hydrate(row) : undefined;
  }

  async getByVersion(version: string): Promise<PromptMethodology | undefined> {
    const row = this._db
      .select()
      .from(promptMethodologies)
      .where(eq(promptMethodologies.version, version))
      .get();
    return row ? hydrate(row) : undefined;
  }

  async seedDefaults(): Promise<void> {
    this._db
      .insert(promptMethodologies)
      .values({
        version: "1.0",
        status: "active",
        quotas: JSON.stringify(METHODOLOGY_V1_QUOTAS),
        validationRules: "{}",
        effectiveAt: Date.now(),
        createdAt: Date.now(),
      })
      .onConflictDoNothing()
      .run();
  }
}
