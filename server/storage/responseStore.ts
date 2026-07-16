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
 * Last Modified Date: 2026-05-09
 * Comments:
 * - v1.00 Sprint 3 initial implementation
 */

import { responsesRaw } from "@shared/schema";
import type { ResponseRaw } from "@shared/schema";
import { eq, and } from "drizzle-orm";
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

export interface IResponseStore {
  listByRun(runId: number): Promise<ResponseRaw[]>;
  listFailedByRun(runId: number): Promise<ResponseRaw[]>;
  get(id: number): Promise<ResponseRaw | undefined>;
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
}
