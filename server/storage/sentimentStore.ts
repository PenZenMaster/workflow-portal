/*
 * Module/Script Name: sentimentStore.ts
 * Path: server/storage/sentimentStore.ts
 *
 * Description:
 * Data-access layer for the response_sentiment table. getReviewQueue
 * returns items below the confidence threshold that have no override,
 * surfacing them to analysts for manual review.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-10
 * Last Modified Date: 2026-05-10
 * Comments:
 * - v1.00 Sprint 5 initial implementation
 */

import { responseSentiment } from "@shared/schema";
import type { ResponseSentiment, SentimentLabel } from "@shared/schema";
import { eq, and, lt, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

type DrizzleDb = ReturnType<typeof drizzle>;
type Row = typeof responseSentiment.$inferSelect;

const REVIEW_THRESHOLD = 0.6;

function hydrate(row: Row): ResponseSentiment {
  return {
    id: row.id,
    responseId: row.responseId,
    brandId: row.brandId,
    label: row.label as ResponseSentiment["label"],
    score: row.score,
    confidence: row.confidence,
    evidenceExcerpt: row.evidenceExcerpt,
    facetLabels: JSON.parse(row.facetLabels || "[]") as string[],
    reviewedByUserId: row.reviewedByUserId,
    reviewedAt: row.reviewedAt,
    overrideLabel: row.overrideLabel,
    createdAt: row.createdAt,
  };
}

type SentimentInput = Omit<ResponseSentiment, "id" | "reviewedByUserId" | "reviewedAt" | "overrideLabel" | "createdAt">;

export interface ISentimentStore {
  listByResponse(responseId: number): Promise<ResponseSentiment[]>;
  listByClient(clientId: number): Promise<ResponseSentiment[]>;
  getReviewQueue(clientId: number): Promise<ResponseSentiment[]>;
  create(data: SentimentInput): Promise<ResponseSentiment>;
  override(id: number, label: SentimentLabel, reviewedByUserId: number): Promise<ResponseSentiment | undefined>;
  deleteByResponse(responseId: number): Promise<void>;
}

export class SentimentStore implements ISentimentStore {
  constructor(private readonly _db: DrizzleDb) {}

  async listByResponse(responseId: number): Promise<ResponseSentiment[]> {
    const rows = this._db
      .select()
      .from(responseSentiment)
      .where(eq(responseSentiment.responseId, responseId))
      .all();
    return rows.map(hydrate);
  }

  async listByClient(_clientId: number): Promise<ResponseSentiment[]> {
    const rows = this._db.select().from(responseSentiment).all();
    return rows.map(hydrate);
  }

  async getReviewQueue(_clientId: number): Promise<ResponseSentiment[]> {
    const rows = this._db
      .select()
      .from(responseSentiment)
      .where(
        and(
          lt(responseSentiment.confidence, REVIEW_THRESHOLD),
          isNull(responseSentiment.overrideLabel)
        )
      )
      .all();
    return rows.map(hydrate);
  }

  async create(data: SentimentInput): Promise<ResponseSentiment> {
    const row = this._db
      .insert(responseSentiment)
      .values({
        responseId: data.responseId,
        brandId: data.brandId,
        label: data.label,
        score: data.score,
        confidence: data.confidence,
        evidenceExcerpt: data.evidenceExcerpt ?? null,
        facetLabels: JSON.stringify(data.facetLabels ?? []),
        createdAt: Date.now(),
      })
      .returning()
      .get();
    return hydrate(row);
  }

  async override(
    id: number,
    label: SentimentLabel,
    reviewedByUserId: number
  ): Promise<ResponseSentiment | undefined> {
    const row = this._db
      .update(responseSentiment)
      .set({ overrideLabel: label, reviewedByUserId, reviewedAt: Date.now() })
      .where(eq(responseSentiment.id, id))
      .returning()
      .get();
    return row ? hydrate(row) : undefined;
  }

  async deleteByResponse(responseId: number): Promise<void> {
    this._db
      .delete(responseSentiment)
      .where(eq(responseSentiment.responseId, responseId))
      .run();
  }
}
