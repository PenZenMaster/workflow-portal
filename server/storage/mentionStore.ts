/*
 * Module/Script Name: mentionStore.ts
 * Path: server/storage/mentionStore.ts
 *
 * Description:
 * Data-access layer for the response_mentions table. Every mention row
 * traces directly to a raw response so metrics are always auditable.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-10
 * Last Modified Date: 2026-05-10
 * Comments:
 * - v1.00 Sprint 4 initial implementation
 */

import { responseMentions, responsesRaw, promptRuns } from "@shared/schema";
import type { ResponseMention } from "@shared/schema";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

type DrizzleDb = ReturnType<typeof drizzle>;
type Row = typeof responseMentions.$inferSelect;

function hydrate(row: Row): ResponseMention {
  return {
    id: row.id,
    responseId: row.responseId,
    brandId: row.brandId,
    matchedText: row.matchedText,
    matchType: row.matchType as ResponseMention["matchType"],
    section: row.section as ResponseMention["section"],
    recommendationRank: row.recommendationRank,
    confidence: row.confidence,
    evidenceExcerpt: row.evidenceExcerpt,
  };
}

type MentionInput = Omit<ResponseMention, "id">;

export interface IMentionStore {
  listByResponse(responseId: number): Promise<ResponseMention[]>;
  listByClient(clientId: number): Promise<ResponseMention[]>;
  create(data: MentionInput): Promise<ResponseMention>;
  bulkCreate(data: MentionInput[]): Promise<ResponseMention[]>;
  deleteByResponse(responseId: number): Promise<void>;
}

export class MentionStore implements IMentionStore {
  constructor(private readonly _db: DrizzleDb) {}

  async listByResponse(responseId: number): Promise<ResponseMention[]> {
    const rows = this._db
      .select()
      .from(responseMentions)
      .where(eq(responseMentions.responseId, responseId))
      .all();
    return rows.map(hydrate);
  }

  async listByClient(clientId: number): Promise<ResponseMention[]> {
    const rows = this._db
      .select({
        id: responseMentions.id,
        responseId: responseMentions.responseId,
        brandId: responseMentions.brandId,
        matchedText: responseMentions.matchedText,
        matchType: responseMentions.matchType,
        section: responseMentions.section,
        recommendationRank: responseMentions.recommendationRank,
        confidence: responseMentions.confidence,
        evidenceExcerpt: responseMentions.evidenceExcerpt,
      })
      .from(responseMentions)
      .innerJoin(responsesRaw, eq(responseMentions.responseId, responsesRaw.id))
      .innerJoin(promptRuns, eq(responsesRaw.runId, promptRuns.id))
      .where(eq(promptRuns.clientId, clientId))
      .all();
    return rows.map(hydrate);
  }

  async create(data: MentionInput): Promise<ResponseMention> {
    const row = this._db
      .insert(responseMentions)
      .values({
        responseId: data.responseId,
        brandId: data.brandId,
        matchedText: data.matchedText,
        matchType: data.matchType,
        section: data.section,
        recommendationRank: data.recommendationRank ?? null,
        confidence: data.confidence,
        evidenceExcerpt: data.evidenceExcerpt ?? null,
      })
      .returning()
      .get();
    return hydrate(row);
  }

  async bulkCreate(data: MentionInput[]): Promise<ResponseMention[]> {
    const created: ResponseMention[] = [];
    for (const item of data) {
      created.push(await this.create(item));
    }
    return created;
  }

  async deleteByResponse(responseId: number): Promise<void> {
    this._db
      .delete(responseMentions)
      .where(eq(responseMentions.responseId, responseId))
      .run();
  }
}
