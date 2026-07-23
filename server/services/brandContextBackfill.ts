/*
 * Module/Script Name: brandContextBackfill.ts
 * Path: server/services/brandContextBackfill.ts
 *
 * Description:
 * Backfills prompts.brand_context for every prompt using the deterministic
 * classifier (deriveBrandContext), scoped per-client so one client's brand
 * roster never leaks into another's classification. Always recomputes -
 * safe to re-run (idempotent). Intended for the one-time production
 * backfill (issue #4 Phase 1 slice 3) and for correcting drift after a
 * brand/alias edit.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-23
 * Last Modified Date: 2026-07-23
 * Comments:
 * - v1.00 issue #4 Phase 1 slice 3 initial implementation
 */

import { prompts, promptCollections } from "@shared/schema";
import type { BrandContext } from "@shared/schema";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { BrandStore } from "../storage/brandStore";
import { AliasStore } from "../storage/aliasStore";
import { deriveBrandContext } from "./brandContext";
import type { BrandInput } from "./parser";

type DrizzleDb = ReturnType<typeof drizzle>;

export interface BrandContextBackfillSummary {
  scanned: number;
  updated: number;
  byContext: Record<BrandContext, number>;
}

interface ClientRoster {
  clientBrands: BrandInput[];
  competitorBrands: BrandInput[];
}

export async function backfillBrandContext(db: DrizzleDb): Promise<BrandContextBackfillSummary> {
  const brandStore = new BrandStore(db);
  const aliasStore = new AliasStore(db);

  const rows = db
    .select({
      id: prompts.id,
      text: prompts.text,
      clientId: promptCollections.clientId,
    })
    .from(prompts)
    .innerJoin(promptCollections, eq(prompts.collectionId, promptCollections.id))
    .all();

  const summary: BrandContextBackfillSummary = {
    scanned: rows.length,
    updated: 0,
    byContext: {
      unbranded: 0,
      client_branded: 0,
      competitor_branded: 0,
      client_and_competitor: 0,
    },
  };

  const rosterByClient = new Map<number, ClientRoster>();

  for (const row of rows) {
    let roster = rosterByClient.get(row.clientId);
    if (!roster) {
      const allBrands = await brandStore.listByClient(row.clientId);
      const brandInputs = await Promise.all(
        allBrands.map(async (b) => ({
          id: b.id,
          canonicalName: b.canonicalName,
          primaryDomain: b.primaryDomain,
          aliases: await aliasStore.listByBrand(b.id),
          kind: b.kind,
        }))
      );
      roster = {
        clientBrands: brandInputs.filter((b) => b.kind === "client"),
        competitorBrands: brandInputs.filter((b) => b.kind === "competitor"),
      };
      rosterByClient.set(row.clientId, roster);
    }

    const brandContext = deriveBrandContext(row.text, roster.clientBrands, roster.competitorBrands);
    db.update(prompts)
      .set({ brandContext, updatedAt: Date.now() })
      .where(eq(prompts.id, row.id))
      .run();

    summary.updated += 1;
    summary.byContext[brandContext] += 1;
  }

  return summary;
}
