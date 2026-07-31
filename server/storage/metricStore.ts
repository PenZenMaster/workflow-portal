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
 * Last Modified Date: 2026-07-15
 * Comments:
 * - v1.00 Sprint 4 initial implementation
 * - v1.01 YLG slice b: aggregateNonBranded live aggregate
 * - v1.02 Epic 5 slice 1 (issue #29): aggregateLiveForPeriodByPlatform -
 *   same live aggregate grouped by platform instead of pooled
 */

import {
  metricSnapshotsDaily,
  brands,
  prompts,
  promptRuns,
  responsesRaw,
  responseMentions,
  responseCitations,
  responseRecommendations,
  platforms,
  RECOMMENDED_STATUSES,
} from "@shared/schema";
import type { MetricSnapshotDaily } from "@shared/schema";
import { eq, and, gte, lt, lte, desc, sql, inArray } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { computeVisibilityScore } from "../services/scoring";

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
    methodologyVersion: row.methodologyVersion,
  };
}

type SnapshotInput = Omit<MetricSnapshotDaily, "id" | "methodologyVersion"> & {
  methodologyVersion?: string;
};

export interface AggregateResult {
  totalCitations: number;
  totalMentions: number;
  totalAllBrandMentions: number;
  totalClientBrandMentions: number;
  totalVisibilityScore: number;
  totalResponses: number;
}

// Epic 5 (issue #29) slice 1: same shape as AggregateResult, one entry per
// platform that had at least one completed response in the period. A
// platform with zero responses is omitted entirely rather than reported as
// a 0% sample.
export interface PlatformAggregateResult extends AggregateResult {
  platformId: number;
  slug: string;
  displayName: string;
}

// Live aggregate over the non-branded slice of the prompt panel (YLG
// slice b). Not snapshot-based: metric_snapshots_daily carries no
// branded/non-branded split, so this is computed from the raw tables.
export interface NonBrandedAggregate {
  nonBrandedResponses: number;   // complete responses whose prompt has brand_context = 'unbranded'
  mentionedNonBranded: number;   // distinct non-branded responses mentioning a client brand
  recommendedNonBranded: number; // distinct non-branded responses with effective status recommended-and-up for a client brand
  clientRecommended: number;     // recommendation rows (client brands) at recommended-and-up
  allBrandRecommended: number;   // recommendation rows (all brands) at recommended-and-up
}

export interface IMetricStore {
  upsert(data: SnapshotInput): Promise<MetricSnapshotDaily>;
  listByClient(clientId: number, fromDate: string, toDate: string): Promise<MetricSnapshotDaily[]>;
  aggregateForPeriod(clientId: number, fromDate: string, toDate: string): Promise<AggregateResult>;
  aggregateLiveForPeriod(clientId: number, fromDate: string, toDate: string): Promise<AggregateResult>;
  aggregateLiveForPeriodByPlatform(
    clientId: number,
    fromDate: string,
    toDate: string
  ): Promise<PlatformAggregateResult[]>;
  aggregateNonBranded(clientId: number, fromDate: string, toDate: string): Promise<NonBrandedAggregate>;
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
          methodologyVersion: data.methodologyVersion ?? "1.0",
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
        methodologyVersion: data.methodologyVersion ?? "1.0",
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

  // TD-24: period totals computed directly from the raw tables instead of
  // snapshot deltas. Cumulative snapshots are rewritten by re-parses and
  // brand pruning (history can shrink), which made delta-based ratios
  // exceed 100%. Here client mentions are a subset of all-brand mentions
  // by construction, so the derived ratios are always internally
  // consistent regardless of history rewrites.
  async aggregateLiveForPeriod(
    clientId: number,
    fromDate: string,
    toDate: string
  ): Promise<AggregateResult> {
    const fromMs = Date.parse(`${fromDate}T00:00:00.000Z`);
    const toExclusiveMs = Date.parse(`${toDate}T00:00:00.000Z`) + 86_400_000;

    const inPeriod = and(
      eq(promptRuns.clientId, clientId),
      eq(responsesRaw.status, "complete"),
      gte(responsesRaw.capturedAt, fromMs),
      lt(responsesRaw.capturedAt, toExclusiveMs)
    );

    const responseRows = this._db
      .select({ id: responsesRaw.id })
      .from(responsesRaw)
      .innerJoin(promptRuns, eq(responsesRaw.runId, promptRuns.id))
      .where(inPeriod)
      .all();

    const empty: AggregateResult = {
      totalCitations: 0,
      totalMentions: 0,
      totalAllBrandMentions: 0,
      totalClientBrandMentions: 0,
      totalVisibilityScore: 0,
      totalResponses: 0,
    };
    if (responseRows.length === 0) return empty;

    const clientBrand = this._db
      .select({ id: brands.id })
      .from(brands)
      .where(and(eq(brands.clientId, clientId), eq(brands.kind, "client")))
      .get();
    // No client brand configured: mentions cannot be attributed, so the
    // client-side counts stay 0 (mirrors the aggregate-snapshot handler).
    const clientBrandId = clientBrand?.id ?? -1;

    const mentionRows = this._db
      .select({
        responseId: responseMentions.responseId,
        brandId: responseMentions.brandId,
        section: responseMentions.section,
        recommendationRank: responseMentions.recommendationRank,
      })
      .from(responseMentions)
      .innerJoin(responsesRaw, eq(responseMentions.responseId, responsesRaw.id))
      .innerJoin(promptRuns, eq(responsesRaw.runId, promptRuns.id))
      .where(inPeriod)
      .all();

    const citationRows = this._db
      .select({
        responseId: responseCitations.responseId,
        ownedByBrandId: responseCitations.ownedByBrandId,
        isTrustedThirdParty: responseCitations.isTrustedThirdParty,
      })
      .from(responseCitations)
      .innerJoin(responsesRaw, eq(responseCitations.responseId, responsesRaw.id))
      .innerJoin(promptRuns, eq(responsesRaw.runId, promptRuns.id))
      .where(inPeriod)
      .all();

    const mentionsByResponse = new Map<number, typeof mentionRows>();
    for (const m of mentionRows) {
      const list = mentionsByResponse.get(m.responseId);
      if (list) list.push(m);
      else mentionsByResponse.set(m.responseId, [m]);
    }
    const citationsByResponse = new Map<number, typeof citationRows>();
    for (const c of citationRows) {
      const list = citationsByResponse.get(c.responseId);
      if (list) list.push(c);
      else citationsByResponse.set(c.responseId, [c]);
    }

    const result: AggregateResult = { ...empty, totalResponses: responseRows.length };
    for (const { id } of responseRows) {
      const mentions = mentionsByResponse.get(id) ?? [];
      const citations = (citationsByResponse.get(id) ?? []).map((c) => ({
        ownedByBrandId: c.ownedByBrandId,
        isTrustedThirdParty: c.isTrustedThirdParty === 1,
      }));

      const hasClientMention = mentions.some((m) => m.brandId === clientBrandId);
      const hasClientCitation = citations.some((c) => c.ownedByBrandId === clientBrandId);
      if (hasClientMention || hasClientCitation) result.totalMentions += 1;
      if (hasClientCitation) result.totalCitations += 1;
      result.totalAllBrandMentions += mentions.length;
      result.totalClientBrandMentions += mentions.filter((m) => m.brandId === clientBrandId).length;
      result.totalVisibilityScore += computeVisibilityScore(mentions, citations, clientBrandId);
    }
    return result;
  }

  // Epic 5 (issue #29) slice 1: same live-aggregate query as
  // aggregateLiveForPeriod (TD-24), grouped by platform instead of pooled.
  async aggregateLiveForPeriodByPlatform(
    clientId: number,
    fromDate: string,
    toDate: string
  ): Promise<PlatformAggregateResult[]> {
    const fromMs = Date.parse(`${fromDate}T00:00:00.000Z`);
    const toExclusiveMs = Date.parse(`${toDate}T00:00:00.000Z`) + 86_400_000;

    const inPeriod = and(
      eq(promptRuns.clientId, clientId),
      eq(responsesRaw.status, "complete"),
      gte(responsesRaw.capturedAt, fromMs),
      lt(responsesRaw.capturedAt, toExclusiveMs)
    );

    const responseRows = this._db
      .select({
        id: responsesRaw.id,
        platformId: responsesRaw.platformId,
        slug: platforms.slug,
        displayName: platforms.displayName,
      })
      .from(responsesRaw)
      .innerJoin(promptRuns, eq(responsesRaw.runId, promptRuns.id))
      .innerJoin(platforms, eq(responsesRaw.platformId, platforms.id))
      .where(inPeriod)
      .all();

    if (responseRows.length === 0) return [];

    const clientBrand = this._db
      .select({ id: brands.id })
      .from(brands)
      .where(and(eq(brands.clientId, clientId), eq(brands.kind, "client")))
      .get();
    const clientBrandId = clientBrand?.id ?? -1;

    const mentionRows = this._db
      .select({
        responseId: responseMentions.responseId,
        brandId: responseMentions.brandId,
        section: responseMentions.section,
        recommendationRank: responseMentions.recommendationRank,
      })
      .from(responseMentions)
      .innerJoin(responsesRaw, eq(responseMentions.responseId, responsesRaw.id))
      .innerJoin(promptRuns, eq(responsesRaw.runId, promptRuns.id))
      .where(inPeriod)
      .all();

    const citationRows = this._db
      .select({
        responseId: responseCitations.responseId,
        ownedByBrandId: responseCitations.ownedByBrandId,
        isTrustedThirdParty: responseCitations.isTrustedThirdParty,
      })
      .from(responseCitations)
      .innerJoin(responsesRaw, eq(responseCitations.responseId, responsesRaw.id))
      .innerJoin(promptRuns, eq(responsesRaw.runId, promptRuns.id))
      .where(inPeriod)
      .all();

    const mentionsByResponse = new Map<number, typeof mentionRows>();
    for (const m of mentionRows) {
      const list = mentionsByResponse.get(m.responseId);
      if (list) list.push(m);
      else mentionsByResponse.set(m.responseId, [m]);
    }
    const citationsByResponse = new Map<number, typeof citationRows>();
    for (const c of citationRows) {
      const list = citationsByResponse.get(c.responseId);
      if (list) list.push(c);
      else citationsByResponse.set(c.responseId, [c]);
    }

    const byPlatform = new Map<number, PlatformAggregateResult>();
    for (const { id, platformId, slug, displayName } of responseRows) {
      let bucket = byPlatform.get(platformId);
      if (!bucket) {
        bucket = {
          platformId,
          slug,
          displayName,
          totalCitations: 0,
          totalMentions: 0,
          totalAllBrandMentions: 0,
          totalClientBrandMentions: 0,
          totalVisibilityScore: 0,
          totalResponses: 0,
        };
        byPlatform.set(platformId, bucket);
      }

      const mentions = mentionsByResponse.get(id) ?? [];
      const citations = (citationsByResponse.get(id) ?? []).map((c) => ({
        ownedByBrandId: c.ownedByBrandId,
        isTrustedThirdParty: c.isTrustedThirdParty === 1,
      }));

      const hasClientMention = mentions.some((m) => m.brandId === clientBrandId);
      const hasClientCitation = citations.some((c) => c.ownedByBrandId === clientBrandId);
      bucket.totalResponses += 1;
      if (hasClientMention || hasClientCitation) bucket.totalMentions += 1;
      if (hasClientCitation) bucket.totalCitations += 1;
      bucket.totalAllBrandMentions += mentions.length;
      bucket.totalClientBrandMentions += mentions.filter((m) => m.brandId === clientBrandId).length;
      bucket.totalVisibilityScore += computeVisibilityScore(mentions, citations, clientBrandId);
    }

    return Array.from(byPlatform.values());
  }

  async aggregateNonBranded(
    clientId: number,
    fromDate: string,
    toDate: string
  ): Promise<NonBrandedAggregate> {
    const fromMs = Date.parse(`${fromDate}T00:00:00.000Z`);
    const toExclusiveMs = Date.parse(`${toDate}T00:00:00.000Z`) + 86_400_000;

    const inPeriod = and(
      eq(promptRuns.clientId, clientId),
      eq(responsesRaw.status, "complete"),
      gte(responsesRaw.capturedAt, fromMs),
      lt(responsesRaw.capturedAt, toExclusiveMs)
    );
    const nonBranded = and(inPeriod, eq(prompts.brandContext, "unbranded"));
    // Human override wins over the machine status (FR-11).
    const effectiveRecommended = inArray(
      sql`coalesce(${responseRecommendations.humanStatus}, ${responseRecommendations.status})`,
      [...RECOMMENDED_STATUSES]
    );

    const clientBrandIds = this._db
      .select({ id: brands.id })
      .from(brands)
      .where(and(eq(brands.clientId, clientId), eq(brands.kind, "client")))
      .all()
      .map((b) => b.id);

    const countResponses = (where: SQL | undefined): number =>
      this._db
        .select({ n: sql<number>`count(distinct ${responsesRaw.id})` })
        .from(responsesRaw)
        .innerJoin(promptRuns, eq(responsesRaw.runId, promptRuns.id))
        .innerJoin(prompts, eq(responsesRaw.promptId, prompts.id))
        .where(where)
        .get()?.n ?? 0;

    const countRecommendations = (where: SQL | undefined): number =>
      this._db
        .select({ n: sql<number>`count(distinct ${responseRecommendations.id})` })
        .from(responseRecommendations)
        .innerJoin(responsesRaw, eq(responseRecommendations.responseId, responsesRaw.id))
        .innerJoin(promptRuns, eq(responsesRaw.runId, promptRuns.id))
        .innerJoin(prompts, eq(responsesRaw.promptId, prompts.id))
        .where(where)
        .get()?.n ?? 0;

    const mentionedNonBranded =
      clientBrandIds.length === 0
        ? 0
        : this._db
            .select({ n: sql<number>`count(distinct ${responsesRaw.id})` })
            .from(responsesRaw)
            .innerJoin(promptRuns, eq(responsesRaw.runId, promptRuns.id))
            .innerJoin(prompts, eq(responsesRaw.promptId, prompts.id))
            .innerJoin(responseMentions, eq(responseMentions.responseId, responsesRaw.id))
            .where(and(nonBranded, inArray(responseMentions.brandId, clientBrandIds)))
            .get()?.n ?? 0;

    const recommendedNonBranded =
      clientBrandIds.length === 0
        ? 0
        : this._db
            .select({ n: sql<number>`count(distinct ${responsesRaw.id})` })
            .from(responsesRaw)
            .innerJoin(promptRuns, eq(responsesRaw.runId, promptRuns.id))
            .innerJoin(prompts, eq(responsesRaw.promptId, prompts.id))
            .innerJoin(responseRecommendations, eq(responseRecommendations.responseId, responsesRaw.id))
            .where(
              and(
                nonBranded,
                inArray(responseRecommendations.brandId, clientBrandIds),
                effectiveRecommended
              )
            )
            .get()?.n ?? 0;

    return {
      nonBrandedResponses: countResponses(nonBranded),
      mentionedNonBranded,
      recommendedNonBranded,
      clientRecommended:
        clientBrandIds.length === 0
          ? 0
          : countRecommendations(
              and(
                nonBranded,
                inArray(responseRecommendations.brandId, clientBrandIds),
                effectiveRecommended
              )
            ),
      allBrandRecommended: countRecommendations(and(nonBranded, effectiveRecommended)),
    };
  }
}
