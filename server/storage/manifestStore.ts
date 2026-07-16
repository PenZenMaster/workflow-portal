/*
 * Module/Script Name: manifestStore.ts
 * Path: server/storage/manifestStore.ts
 *
 * Description:
 * Data-access layer for measurement_run_manifests (issue #3 Epic 2
 * slice E2a). Manifests are immutable: one row per run, created at run
 * creation, no update path. The unique run_id constraint enforces this
 * at the database level.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-15
 * Last Modified Date: 2026-07-15
 * Comments:
 * - v1.00 E2a initial implementation
 */

import { measurementRunManifests } from "@shared/schema";
import type { MeasurementRunManifest, RunPurpose } from "@shared/schema";
import { and, desc, eq, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { ManifestCreateInput } from "../services/manifest";

type DrizzleDb = ReturnType<typeof drizzle>;
type Row = typeof measurementRunManifests.$inferSelect;

function hydrate(row: Row): MeasurementRunManifest {
  return {
    id: row.id,
    runId: row.runId,
    clientId: row.clientId,
    collectionId: row.collectionId,
    purpose: row.purpose as RunPurpose,
    methodologyVersion: row.methodologyVersion,
    panelVersion: row.panelVersion,
    scoringVersion: row.scoringVersion,
    parserVersion: row.parserVersion,
    classifierVersion: row.classifierVersion,
    platformIds: JSON.parse(row.platformIds) as number[],
    promptCount: row.promptCount,
    replicateCount: row.replicateCount,
    expectedResponseCount: row.expectedResponseCount,
    configSnapshot: row.configSnapshot,
    configHash: row.configHash,
    createdAt: row.createdAt,
  };
}

export interface IManifestStore {
  create(data: ManifestCreateInput): Promise<MeasurementRunManifest>;
  getByRunId(runId: number): Promise<MeasurementRunManifest | undefined>;
  getPreviousManifest(
    clientId: number,
    collectionId: number,
    beforeRunId: number
  ): Promise<MeasurementRunManifest | undefined>;
}

export class ManifestStore implements IManifestStore {
  constructor(private readonly _db: DrizzleDb) {}

  async create(data: ManifestCreateInput): Promise<MeasurementRunManifest> {
    const row = this._db
      .insert(measurementRunManifests)
      .values({
        runId: data.runId,
        clientId: data.clientId,
        collectionId: data.collectionId,
        purpose: data.purpose,
        methodologyVersion: data.methodologyVersion,
        panelVersion: data.panelVersion,
        scoringVersion: data.scoringVersion,
        parserVersion: data.parserVersion,
        classifierVersion: data.classifierVersion,
        platformIds: JSON.stringify(data.platformIds),
        promptCount: data.promptCount,
        replicateCount: data.replicateCount,
        expectedResponseCount: data.expectedResponseCount,
        configSnapshot: data.configSnapshot,
        configHash: data.configHash,
        createdAt: Date.now(),
      })
      .returning()
      .get();
    return hydrate(row);
  }

  async getByRunId(runId: number): Promise<MeasurementRunManifest | undefined> {
    const row = this._db
      .select()
      .from(measurementRunManifests)
      .where(eq(measurementRunManifests.runId, runId))
      .get();
    return row ? hydrate(row) : undefined;
  }

  // E2b: comparability baseline — the most recent earlier run of the same
  // client+collection that has a manifest (runs before v1.40.0 have none).
  async getPreviousManifest(
    clientId: number,
    collectionId: number,
    beforeRunId: number
  ): Promise<MeasurementRunManifest | undefined> {
    const row = this._db
      .select()
      .from(measurementRunManifests)
      .where(
        and(
          eq(measurementRunManifests.clientId, clientId),
          eq(measurementRunManifests.collectionId, collectionId),
          lt(measurementRunManifests.runId, beforeRunId)
        )
      )
      .orderBy(desc(measurementRunManifests.runId))
      .limit(1)
      .get();
    return row ? hydrate(row) : undefined;
  }
}
