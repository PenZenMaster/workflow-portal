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
 * Last Modified Date: 2026-07-24
 * Comments:
 * - v1.00 YLG foundation sprint initial implementation
 * - v1.01 issue #4 Phase 1 slice 6: methodology v2.0 re-lock + activateVersion
 * - v1.02 fix: seedDefaults now retires any pre-existing active row on the
 *   upgrade path, so getActive() can't return two 'active' rows when an
 *   install already had an older version seeded active before a re-lock
 */

import { promptMethodologies } from "@shared/schema";
import type { PromptMethodology, MethodologyQuotas } from "@shared/schema";
import { eq, and, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

type DrizzleDb = ReturnType<typeof drizzle>;
type Row = typeof promptMethodologies.$inferSelect;

// YLG methodology v1.0 - approved as written 2026-07-12. The 30-prompt
// panel distribution comes from the prompt-generation spec section 4.1;
// replicates/surfaces/cadence from the visibility spec Phase 0. RETIRED
// by v2.0 (issue #4 Phase 1 slice 6) - never edit; historical snapshots
// reference these exact values.
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

// YLG methodology v2.0 - issue #4 Phase 1 re-lock (educational intent,
// brandContext-based non-branded definition; see docs/system-
// documentation.md "Methodology versioning"). Same 30-prompt panel size
// and 24/6 non-branded/branded split as v1.0, but intentQuotas now
// covers all 9 canonical intent types (v1.0 only quota'd 6 of its 8).
export const METHODOLOGY_V2_QUOTAS: MethodologyQuotas = {
  panelSize: 30,
  nonBranded: 24,
  branded: 6,
  intentQuotas: {
    provider_recommendation: 7,
    service_specific: 5,
    problem_solution: 4,
    geographic_discovery: 4,
    educational: 4,
    trust_validation: 2,
    comparison: 2,
    brand_validation: 1,
    alternative: 1,
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
  activateVersion(version: string): Promise<PromptMethodology | undefined>;
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
    // v1.0 is historical and retired - v2.0 is the active methodology
    // (issue #4 Phase 1 slice 6 re-lock). Two independent idempotent
    // inserts, not an activateVersion() call: v1.0's retired status here
    // is a seed-time fact, not a transition. onConflictDoNothing means
    // an install that already has 1.0 seeded active from before this
    // re-lock shipped won't have its row touched by the insert, so the
    // trailing retire-others step below is what actually enforces the
    // single-active invariant on that upgrade path.
    this._db
      .insert(promptMethodologies)
      .values({
        version: "1.0",
        status: "retired",
        quotas: JSON.stringify(METHODOLOGY_V1_QUOTAS),
        validationRules: "{}",
        effectiveAt: Date.now(),
        createdAt: Date.now(),
      })
      .onConflictDoNothing()
      .run();

    this._db
      .insert(promptMethodologies)
      .values({
        version: "2.0",
        status: "active",
        quotas: JSON.stringify(METHODOLOGY_V2_QUOTAS),
        validationRules: "{}",
        effectiveAt: Date.now(),
        createdAt: Date.now(),
      })
      .onConflictDoNothing()
      .run();

    this._db
      .update(promptMethodologies)
      .set({ status: "retired" })
      .where(and(eq(promptMethodologies.status, "active"), ne(promptMethodologies.version, "2.0")))
      .run();
  }

  async activateVersion(version: string): Promise<PromptMethodology | undefined> {
    const target = this._db
      .select()
      .from(promptMethodologies)
      .where(eq(promptMethodologies.version, version))
      .get();
    if (!target) return undefined;

    this._db
      .update(promptMethodologies)
      .set({ status: "retired" })
      .where(and(eq(promptMethodologies.status, "active"), ne(promptMethodologies.version, version)))
      .run();

    const row = this._db
      .update(promptMethodologies)
      .set({ status: "active" })
      .where(eq(promptMethodologies.version, version))
      .returning()
      .get();
    return hydrate(row);
  }
}
