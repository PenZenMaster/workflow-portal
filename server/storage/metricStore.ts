/*
 * Module/Script Name: metricStore.ts
 * Path: server/storage/metricStore.ts
 *
 * Description:
 * Data-access layer for the metric_snapshots_daily table. upsert() is
 * idempotent — rerunning aggregate-snapshot-daily for the same
 * client+date+scope always produces the same result.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-10
 * Last Modified Date: 2026-05-10
 * Comments:
 * - v1.00 Sprint 4 initial implementation
 */

import { metricSnapshotsDaily } from "@shared/schema";
import type { MetricSnapshotDaily } from "@shared/schema";
import { eq, and, gte, lt, lte, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

type DrizzleDb = ReturnType<typeof drizzle>;
type Row = typeof metricSnapshotsDaily.$inferSelect;

function hydrate(row: Row): MetricSnapshotDaily {
  return {
    id: row.id,
    clientId: row.clientId,
    dateIso: row.dateIso,
    scopeKind: row.scopeKind as MetricSnapshotDaily["scopeKind"],
    scopeValue: row.scopeValue,
    citationCount: row.citationCount,
    mentionCount: row.mentionCount,
    allBrandMentions: row.allBrandMentions,
    clientBrandMentions: row.clientBrandMentions,
    visibilityScoreSum: row.visibilityScoreSum,
    promptResponseCount: row.promptResponseCount,
  };
}

type SnapshotInput = Omit<MetricSnapshotDaily, "id">;

export interface AggregateResult {
  totalCitations: number;
  totalMentions: number;
  totalAllBrandMentions: number;
  totalClientBrandMentions: number;
  totalVisibilityScore: number;
  totalResponses: number;
}

export interface IMetricStore {
  upsert(data: SnapshotInput): Promise<MetricSnapshotDaily>;
  listByClient(clientId: number, fromDate: string, toDate: string): Promise<MetricSnapshotDaily[]>;
  aggregateForPeriod(clientId: number, fromDate: string, toDate: string): Promise<AggregateResult>;
}

export class MetricStore implements IMetricStore {
  constructor(private readonly _db: DrizzleDb) {}

  async upsert(data: SnapshotInput): Promise<MetricSnapshotDaily> {
    const existing = this._db
      .select()
      .from(metricSnapshotsDaily)
      .where(
        and(
          eq(metricSnapshotsDaily.clientId, data.clientId),
          eq(metricSnapshotsDaily.dateIso, data.dateIso),
          eq(metricSnapshotsDaily.scopeKind, data.scopeKind),
          data.scopeValue != null
            ? eq(metricSnapshotsDaily.scopeValue, data.scopeValue)
            : sql`${metricSnapshotsDaily.scopeValue} IS NULL`
        )
      )
      .get();

    if (existing) {
      const row = this._db
        .update(metricSnapshotsDaily)
        .set({
          citationCount: data.citationCount,
          mentionCount: data.mentionCount,
          allBrandMentions: data.allBrandMentions,
          clientBrandMentions: data.clientBrandMentions,
          visibilityScoreSum: data.visibilityScoreSum,
          promptResponseCount: data.promptResponseCount,
        })
        .where(eq(metricSnapshotsDaily.id, existing.id))
        .returning()
        .get();
      return hydrate(row);
    }

    const row = this._db
      .insert(metricSnapshotsDaily)
      .values({
        clientId: data.clientId,
        dateIso: data.dateIso,
        scopeKind: data.scopeKind,
        scopeValue: data.scopeValue ?? null,
        citationCount: data.citationCount,
        mentionCount: data.mentionCount,
        allBrandMentions: data.allBrandMentions,
        clientBrandMentions: data.clientBrandMentions,
        visibilityScoreSum: data.visibilityScoreSum,
        promptResponseCount: data.promptResponseCount,
      })
      .returning()
      .get();
    return hydrate(row);
  }

  async listByClient(
    clientId: number,
    fromDate: string,
    toDate: string
  ): Promise<MetricSnapshotDaily[]> {
    const rows = this._db
      .select()
      .from(metricSnapshotsDaily)
      .where(
        and(
          eq(metricSnapshotsDaily.clientId, clientId),
          gte(metricSnapshotsDaily.dateIso, fromDate),
          lte(metricSnapshotsDaily.dateIso, toDate)
        )
      )
      .all();
    return rows.map(hydrate);
  }

  // Each snapshot row holds cumulative lifetime totals as of its dateIso (see
  // aggregate-snapshot-daily handler), so a period's totals are the delta
  // between the latest snapshot at/before toDate and the latest snapshot
  // strictly before fromDate — not a sum across the rows in range.
  async aggregateForPeriod(
    clientId: number,
    fromDate: string,
    toDate: string
  ): Promise<AggregateResult> {
    const end = this._db
      .select()
      .from(metricSnapshotsDaily)
      .where(
        and(
          eq(metricSnapshotsDaily.clientId, clientId),
          eq(metricSnapshotsDaily.scopeKind, "overall"),
          lte(metricSnapshotsDaily.dateIso, toDate)
        )
      )
      .orderBy(desc(metricSnapshotsDaily.dateIso))
      .limit(1)
      .get();

    const baseline = this._db
      .select()
      .from(metricSnapshotsDaily)
      .where(
        and(
          eq(metricSnapshotsDaily.clientId, clientId),
          eq(metricSnapshotsDaily.scopeKind, "overall"),
          lt(metricSnapshotsDaily.dateIso, fromDate)
        )
      )
      .orderBy(desc(metricSnapshotsDaily.dateIso))
      .limit(1)
      .get();

    return {
      totalCitations: (end?.citationCount ?? 0) - (baseline?.citationCount ?? 0),
      totalMentions: (end?.mentionCount ?? 0) - (baseline?.mentionCount ?? 0),
      totalAllBrandMentions: (end?.allBrandMentions ?? 0) - (baseline?.allBrandMentions ?? 0),
      totalClientBrandMentions:
        (end?.clientBrandMentions ?? 0) - (baseline?.clientBrandMentions ?? 0),
      totalVisibilityScore: (end?.visibilityScoreSum ?? 0) - (baseline?.visibilityScoreSum ?? 0),
      totalResponses: (end?.promptResponseCount ?? 0) - (baseline?.promptResponseCount ?? 0),
    };
  }
}
