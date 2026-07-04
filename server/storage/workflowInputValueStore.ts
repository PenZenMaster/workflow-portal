/*
 * Module/Script Name: workflowInputValueStore.ts
 * Path: server/storage/workflowInputValueStore.ts
 *
 * Description:
 * Data-access layer for workflow_input_values (B-23): last-used launch
 * input values per workflow + input label, shared across all portal users
 * so rarely-changing inputs (Service Area, Core Services, API base URLs)
 * do not need re-typing on every launch. Blank values are skipped on save
 * so an empty field never clobbers a previously remembered value.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-03
 * Last Modified Date: 2026-07-03
 * Comments:
 * - v1.00 Initial implementation (launch-input persistence feature)
 */

import { workflowInputValues } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

type DrizzleDb = ReturnType<typeof drizzle>;

export interface IWorkflowInputValueStore {
  getByWorkflow(workflowId: number): Promise<Record<string, string>>;
  upsertMany(workflowId: number, values: Record<string, string>): Promise<void>;
}

export class WorkflowInputValueStore implements IWorkflowInputValueStore {
  constructor(private readonly _db: DrizzleDb) {}

  async getByWorkflow(workflowId: number): Promise<Record<string, string>> {
    const rows = this._db
      .select()
      .from(workflowInputValues)
      .where(eq(workflowInputValues.workflowId, workflowId))
      .all();
    const map: Record<string, string> = {};
    for (const row of rows) map[row.label] = row.value;
    return map;
  }

  async upsertMany(
    workflowId: number,
    values: Record<string, string>
  ): Promise<void> {
    const now = Date.now();
    for (const [label, value] of Object.entries(values)) {
      if (value.trim().length === 0) continue;
      this._db
        .insert(workflowInputValues)
        .values({ workflowId, label, value, updatedAt: now })
        .onConflictDoUpdate({
          target: [workflowInputValues.workflowId, workflowInputValues.label],
          set: { value: sql`excluded.value`, updatedAt: now },
        })
        .run();
    }
  }
}
