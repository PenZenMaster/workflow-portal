/*
 * Module/Script Name: responseStore.ts
 * Path: server/storage/responseStore.ts
 *
 * Description:
 * Data-access layer for the responses_raw table. Stores verbatim AI
 * platform responses so every metric can be traced back to source data.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-09
 * Last Modified Date: 2026-07-15
 * Comments:
 * - v1.00 Sprint 3 initial implementation
 * - v1.01 token usage columns carried (issue #2 F1)
 * - v1.02 aggregateTokensByClient per-platform aggregation
 */

import { responsesRaw, promptRuns, platforms } from "@shared/schema";
import type { ResponseRaw } from "@shared/schema";
import { eq, and, gte, lt, isNotNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

type DrizzleDb = ReturnType<typeof drizzle>;
type Row = typeof responsesRaw.$inferSelect;

function hydrate(row: Row): ResponseRaw {
  return {
    id: row.id,
    runId: row.runId,
    promptId: row.promptId,
    platformId: row.platformId,
    queryText: row.queryText,
    locale: row.locale,
    geo: row.geo,
    status: row.status as ResponseRaw["status"],
    responseText: row.responseText,
    responseSummaryBlock: row.responseSummaryBlock,
    modelVariant: row.modelVariant,
    latencyMs: row.latencyMs,
    rawPayload: row.rawPayload ? JSON.parse(row.rawPayload) : null,
    errorMessage: row.errorMessage,
    capturedAt: row.capturedAt,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
  };
}

export interface TokenUsageByPlatform {
  platformId: number;
  platformSlug: string;
  responses: number;
  inputTokens: number;
  outputTokens: number;
}

export interface ClientTokenAggregate {
  totalInputTokens: number;
  totalOutputTokens: number;
  byPlatform: TokenUsageByPlatform[];
}

export interface IResponseStore {
  listByRun(runId: number): Promise<ResponseRaw[]>;
  listFailedByRun(runId: number): Promise<ResponseRaw[]>;
  get(id: number): Promise<ResponseRaw | undefined>;
  aggregateTokensByClient(
    clientId: number,
    fromDate: string,
    toDate: string
  ): Promise<ClientTokenAggregate>;
  create(data: {
    runId: number;
    promptId: number;
    platformId: number;
    queryText: string;
    locale?: string | null;
    geo?: string | null;
  }): Promise<ResponseRaw>;
  updateResult(
    id: number,
    result: {
      status: ResponseRaw["status"];
      responseText?: string | null;
      responseSummaryBlock?: string | null;
      modelVariant?: string | null;
      latencyMs?: number | null;
      rawPayload?: unknown;
      errorMessage?: string | null;
      inputTokens?: number | null;
      outputTokens?: number | null;
    }
  ): Promise<void>;
}

export class ResponseStore implements IResponseStore {
  constructor(private readonly _db: DrizzleDb) {}

  async listByRun(runId: number): Promise<ResponseRaw[]> {
    const rows = this._db
      .select()
      .from(responsesRaw)
      .where(eq(responsesRaw.runId, runId))
      .all();
    return rows.map(hydrate);
  }

  async listFailedByRun(runId: number): Promise<ResponseRaw[]> {
    const rows = this._db
      .select()
      .from(responsesRaw)
      .where(and(eq(responsesRaw.runId, runId), eq(responsesRaw.status, "failed")))
      .all();
    return rows.map(hydrate);
  }

  async get(id: number): Promise<ResponseRaw | undefined> {
    const row = this._db
      .select()
      .from(responsesRaw)
      .where(eq(responsesRaw.id, id))
      .get();
    return row ? hydrate(row) : undefined;
  }

  async create(data: {
    runId: number;
    promptId: number;
    platformId: number;
    queryText: string;
    locale?: string | null;
    geo?: string | null;
  }): Promise<ResponseRaw> {
    const now = Date.now();
    const row = this._db
      .insert(responsesRaw)
      .values({
        runId: data.runId,
        promptId: data.promptId,
        platformId: data.platformId,
        queryText: data.queryText,
        locale: data.locale ?? null,
        geo: data.geo ?? null,
        capturedAt: now,
      })
      .returning()
      .get();
    return hydrate(row);
  }

  async updateResult(
    id: number,
    result: {
      status: ResponseRaw["status"];
      responseText?: string | null;
      responseSummaryBlock?: string | null;
      modelVariant?: string | null;
      latencyMs?: number | null;
      rawPayload?: unknown;
      errorMessage?: string | null;
      inputTokens?: number | null;
      outputTokens?: number | null;
    }
  ): Promise<void> {
    this._db
      .update(responsesRaw)
      .set({
        status: result.status,
        responseText: result.responseText ?? null,
        responseSummaryBlock: result.responseSummaryBlock ?? null,
        modelVariant: result.modelVariant ?? null,
        latencyMs: result.latencyMs ?? null,
        rawPayload:
          result.rawPayload != null ? JSON.stringify(result.rawPayload) : null,
        errorMessage: result.errorMessage ?? null,
        inputTokens: result.inputTokens ?? null,
        outputTokens: result.outputTokens ?? null,
      })
      .where(eq(responsesRaw.id, id))
      .run();
  }

  // Live per-platform token aggregation for one client (issue #2 F1).
  // Only rows with captured usage count; rows predating v1.37.0 capture
  // were backfilled from raw_payload in production.
  async aggregateTokensByClient(
    clientId: number,
    fromDate: string,
    toDate: string
  ): Promise<ClientTokenAggregate> {
    const fromMs = Date.parse(`${fromDate}T00:00:00.000Z`);
    const toExclusiveMs = Date.parse(`${toDate}T00:00:00.000Z`) + 86_400_000;

    const byPlatform = this._db
      .select({
        platformId: responsesRaw.platformId,
        platformSlug: platforms.slug,
        responses: sql<number>`count(*)`,
        inputTokens: sql<number>`coalesce(sum(${responsesRaw.inputTokens}), 0)`,
        outputTokens: sql<number>`coalesce(sum(${responsesRaw.outputTokens}), 0)`,
      })
      .from(responsesRaw)
      .innerJoin(promptRuns, eq(responsesRaw.runId, promptRuns.id))
      .innerJoin(platforms, eq(responsesRaw.platformId, platforms.id))
      .where(
        and(
          eq(promptRuns.clientId, clientId),
          gte(responsesRaw.capturedAt, fromMs),
          lt(responsesRaw.capturedAt, toExclusiveMs),
          isNotNull(responsesRaw.inputTokens)
        )
      )
      .groupBy(responsesRaw.platformId, platforms.slug)
      .orderBy(responsesRaw.platformId)
      .all();

    return {
      totalInputTokens: byPlatform.reduce((s, p) => s + p.inputTokens, 0),
      totalOutputTokens: byPlatform.reduce((s, p) => s + p.outputTokens, 0),
      byPlatform,
    };
  }
}
