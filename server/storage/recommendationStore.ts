/*
 * Module/Script Name: recommendationStore.ts
 * Path: server/storage/recommendationStore.ts
 *
 * Description:
 * Data-access layer for the response_recommendations table. Rows are
 * deleted and recreated per response on re-parse (same idempotency
 * pattern as mentions/citations). listByClient joins through
 * responses_raw -> prompt_runs so results are always client-scoped (the
 * cross-client leak pattern fixed in v1.4.2/v1.6.1 cannot recur here).
 * setHumanStatus records an analyst override while retaining the
 * machine-classified status (FR-11).
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-12
 * Last Modified Date: 2026-07-12
 * Comments:
 * - v1.00 YLG classifier sprint initial implementation
 */

import { responseRecommendations, responsesRaw, promptRuns } from "@shared/schema";
import type { ResponseRecommendation, RecommendationStatus } from "@shared/schema";
import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

type DrizzleDb = ReturnType<typeof drizzle>;
type Row = typeof responseRecommendations.$inferSelect;

function hydrate(row: Row): ResponseRecommendation {
  return {
    id: row.id,
    responseId: row.responseId,
    brandId: row.brandId,
    status: row.status as RecommendationStatus,
    rank: row.rank,
    confidence: row.confidence,
    evidenceExcerpt: row.evidenceExcerpt,
    classifierVersion: row.classifierVersion,
    humanStatus: row.humanStatus as RecommendationStatus | null,
    humanUserId: row.humanUserId,
    humanAt: row.humanAt,
  };
}

type RecommendationInput = Omit<ResponseRecommendation, "id" | "humanStatus" | "humanUserId" | "humanAt"> & {
  evidenceExcerpt?: string | null;
  rank?: number | null;
};

export interface IRecommendationStore {
  listByResponse(responseId: number): Promise<ResponseRecommendation[]>;
  listByClient(clientId: number): Promise<ResponseRecommendation[]>;
  bulkCreate(data: RecommendationInput[]): Promise<ResponseRecommendation[]>;
  deleteByResponse(responseId: number): Promise<void>;
  setHumanStatus(
    id: number,
    status: RecommendationStatus,
    userId: number
  ): Promise<ResponseRecommendation | undefined>;
}

export class RecommendationStore implements IRecommendationStore {
  constructor(private readonly _db: DrizzleDb) {}

  async listByResponse(responseId: number): Promise<ResponseRecommendation[]> {
    const rows = this._db
      .select()
      .from(responseRecommendations)
      .where(eq(responseRecommendations.responseId, responseId))
      .all();
    return rows.map(hydrate);
  }

  async listByClient(clientId: number): Promise<ResponseRecommendation[]> {
    const rows = this._db
      .select({
        id: responseRecommendations.id,
        responseId: responseRecommendations.responseId,
        brandId: responseRecommendations.brandId,
        status: responseRecommendations.status,
        rank: responseRecommendations.rank,
        confidence: responseRecommendations.confidence,
        evidenceExcerpt: responseRecommendations.evidenceExcerpt,
        classifierVersion: responseRecommendations.classifierVersion,
        humanStatus: responseRecommendations.humanStatus,
        humanUserId: responseRecommendations.humanUserId,
        humanAt: responseRecommendations.humanAt,
      })
      .from(responseRecommendations)
      .innerJoin(responsesRaw, eq(responseRecommendations.responseId, responsesRaw.id))
      .innerJoin(promptRuns, eq(responsesRaw.runId, promptRuns.id))
      .where(eq(promptRuns.clientId, clientId))
      .orderBy(desc(responseRecommendations.id))
      .all();
    return rows.map(hydrate);
  }

  async bulkCreate(data: RecommendationInput[]): Promise<ResponseRecommendation[]> {
    const created: ResponseRecommendation[] = [];
    for (const item of data) {
      const row = this._db
        .insert(responseRecommendations)
        .values({
          responseId: item.responseId,
          brandId: item.brandId,
          status: item.status,
          rank: item.rank ?? null,
          confidence: item.confidence,
          evidenceExcerpt: item.evidenceExcerpt ?? null,
          classifierVersion: item.classifierVersion,
        })
        .returning()
        .get();
      created.push(hydrate(row));
    }
    return created;
  }

  async deleteByResponse(responseId: number): Promise<void> {
    this._db
      .delete(responseRecommendations)
      .where(eq(responseRecommendations.responseId, responseId))
      .run();
  }

  async setHumanStatus(
    id: number,
    status: RecommendationStatus,
    userId: number
  ): Promise<ResponseRecommendation | undefined> {
    const row = this._db
      .update(responseRecommendations)
      .set({ humanStatus: status, humanUserId: userId, humanAt: Date.now() })
      .where(eq(responseRecommendations.id, id))
      .returning()
      .get();
    return row ? hydrate(row) : undefined;
  }
}
