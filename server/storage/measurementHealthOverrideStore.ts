/*
 * Module/Script Name: measurementHealthOverrideStore.ts
 * Path: server/storage/measurementHealthOverrideStore.ts
 *
 * Description:
 * Data-access layer for the measurement_health_overrides table (issue
 * #30 slice 5b): one row per run, admin-recorded override of a computed
 * measurement-health status with a required reason. The machine-computed
 * status from computeMeasurementHealth is never overwritten in place -
 * server/services/measurementHealth.ts's applyMeasurementHealthOverride
 * and effectiveHealthStatus resolve "effective status" as
 * override?.status ?? computed status.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-10
 * Last Modified Date: 2026-08-10
 * Comments:
 * - v1.00 issue #30 slice 5b initial implementation
 */

import { measurementHealthOverrides } from "@shared/schema";
import type { MeasurementHealthOverride, MeasurementHealthStatus } from "@shared/schema";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

type DrizzleDb = ReturnType<typeof drizzle>;
type Row = typeof measurementHealthOverrides.$inferSelect;

function hydrate(row: Row): MeasurementHealthOverride {
  return {
    id: row.id,
    runId: row.runId,
    status: row.status as MeasurementHealthStatus,
    reason: row.reason,
    overriddenByUserId: row.overriddenByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface IMeasurementHealthOverrideStore {
  getByRunId(runId: number): Promise<MeasurementHealthOverride | undefined>;
  set(
    runId: number,
    status: MeasurementHealthStatus,
    reason: string,
    userId: number
  ): Promise<MeasurementHealthOverride>;
  clear(runId: number): Promise<boolean>;
}

export class MeasurementHealthOverrideStore implements IMeasurementHealthOverrideStore {
  constructor(private readonly _db: DrizzleDb) {}

  async getByRunId(runId: number): Promise<MeasurementHealthOverride | undefined> {
    const row = this._db
      .select()
      .from(measurementHealthOverrides)
      .where(eq(measurementHealthOverrides.runId, runId))
      .get();
    return row ? hydrate(row) : undefined;
  }

  async set(
    runId: number,
    status: MeasurementHealthStatus,
    reason: string,
    userId: number
  ): Promise<MeasurementHealthOverride> {
    const now = Date.now();
    const row = this._db
      .insert(measurementHealthOverrides)
      .values({
        runId,
        status,
        reason,
        overriddenByUserId: userId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: measurementHealthOverrides.runId,
        set: {
          status,
          reason,
          overriddenByUserId: userId,
          updatedAt: now,
        },
      })
      .returning()
      .get();
    return hydrate(row);
  }

  async clear(runId: number): Promise<boolean> {
    const result = this._db
      .delete(measurementHealthOverrides)
      .where(eq(measurementHealthOverrides.runId, runId))
      .run();
    return result.changes > 0;
  }
}
