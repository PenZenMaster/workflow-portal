/*
 * Module/Script Name: growthPlanRunStore.ts
 * Path: server/storage/growthPlanRunStore.ts
 *
 * Description:
 * Data-access layer for growth_plan_runs - cross-run memory for the
 * ranking growth-plan workflow (server/services/factory/
 * rankingGrowthPlanCell.ts). Runs are immutable: one row per run, created
 * after a successful analysis, no update path. Modeled directly on
 * manifestStore.ts's shape and getPreviousManifest query pattern.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-09-03
 * Last Modified Date: 2026-09-03
 * Comments:
 * - v1.00 Full-parity growth-plan memory (skip-if-unchanged + carry-forward
 *   priority actions)
 */

import { growthPlanRuns } from "@shared/schema";
import type { GrowthPlanRun, GrowthPlanPriorityAction } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

type DrizzleDb = ReturnType<typeof drizzle>;
type Row = typeof growthPlanRuns.$inferSelect;

function hydrate(row: Row): GrowthPlanRun {
  let priorityActions: GrowthPlanPriorityAction[] = [];
  try {
    priorityActions = JSON.parse(row.priorityActions) as GrowthPlanPriorityAction[];
  } catch {
    priorityActions = [];
  }
  return {
    id: row.id,
    clientId: row.clientId,
    inputHash: row.inputHash,
    markdown: row.markdown,
    priorityActions,
    createdAt: row.createdAt,
  };
}

export interface GrowthPlanRunCreateInput {
  clientId: number;
  inputHash: string;
  markdown: string;
  priorityActions: GrowthPlanPriorityAction[];
}

export interface IGrowthPlanRunStore {
  create(data: GrowthPlanRunCreateInput): Promise<GrowthPlanRun>;
  getPreviousRun(clientId: number): Promise<GrowthPlanRun | undefined>;
}

export class GrowthPlanRunStore implements IGrowthPlanRunStore {
  constructor(private readonly _db: DrizzleDb) {}

  async create(data: GrowthPlanRunCreateInput): Promise<GrowthPlanRun> {
    const row = this._db
      .insert(growthPlanRuns)
      .values({
        clientId: data.clientId,
        inputHash: data.inputHash,
        markdown: data.markdown,
        priorityActions: JSON.stringify(data.priorityActions),
        createdAt: Date.now(),
      })
      .returning()
      .get();
    return hydrate(row);
  }

  // The most recent run for this client, regardless of what triggered it -
  // used both to decide whether to skip an unchanged re-run and to carry
  // forward the prior priority-actions list into the next prompt.
  async getPreviousRun(clientId: number): Promise<GrowthPlanRun | undefined> {
    const row = this._db
      .select()
      .from(growthPlanRuns)
      .where(eq(growthPlanRuns.clientId, clientId))
      .orderBy(desc(growthPlanRuns.id))
      .limit(1)
      .get();
    return row ? hydrate(row) : undefined;
  }
}
