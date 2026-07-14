/*
 * Module/Script Name: citationStore.ts
 * Path: server/storage/citationStore.ts
 *
 * Description:
 * Data-access layer for the response_citations table. Stores extracted
 * URLs with root domain, ownership, and position metadata.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-10
 * Last Modified Date: 2026-07-14
 * Comments:
 * - v1.00 Sprint 4 initial implementation
 * - v1.01 YLG source registry slice: sourceClass column carried
 */

import { responseCitations, responsesRaw, promptRuns } from "@shared/schema";
import type { ResponseCitation, SourceClass } from "@shared/schema";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

type DrizzleDb = ReturnType<typeof drizzle>;
type Row = typeof responseCitations.$inferSelect;

function hydrate(row: Row): ResponseCitation {
  return {
    id: row.id,
    responseId: row.responseId,
    url: row.url,
    rootDomain: row.rootDomain,
    ownedByBrandId: row.ownedByBrandId,
    position: row.position,
    isTrustedThirdParty: row.isTrustedThirdParty === 1,
    sourceClass: row.sourceClass as SourceClass,
  };
}

// sourceClass is optional on insert: rows written before the classifier
// ran (or by legacy callers) take the unknown_or_low_trust default.
type CitationInput = Omit<ResponseCitation, "id" | "sourceClass"> & {
  sourceClass?: SourceClass;
};

export interface ICitationStore {
  listByResponse(responseId: number): Promise<ResponseCitation[]>;
  listByClient(clientId: number): Promise<ResponseCitation[]>;
  create(data: CitationInput): Promise<ResponseCitation>;
  bulkCreate(data: CitationInput[]): Promise<ResponseCitation[]>;
  deleteByResponse(responseId: number): Promise<void>;
}

export class CitationStore implements ICitationStore {
  constructor(private readonly _db: DrizzleDb) {}

  async listByResponse(responseId: number): Promise<ResponseCitation[]> {
    const rows = this._db
      .select()
      .from(responseCitations)
      .where(eq(responseCitations.responseId, responseId))
      .all();
    return rows.map(hydrate).sort((a, b) => a.position - b.position);
  }

  async listByClient(clientId: number): Promise<ResponseCitation[]> {
    const rows = this._db
      .select({
        id: responseCitations.id,
        responseId: responseCitations.responseId,
        url: responseCitations.url,
        rootDomain: responseCitations.rootDomain,
        ownedByBrandId: responseCitations.ownedByBrandId,
        position: responseCitations.position,
        isTrustedThirdParty: responseCitations.isTrustedThirdParty,
        sourceClass: responseCitations.sourceClass,
      })
      .from(responseCitations)
      .innerJoin(responsesRaw, eq(responseCitations.responseId, responsesRaw.id))
      .innerJoin(promptRuns, eq(responsesRaw.runId, promptRuns.id))
      .where(eq(promptRuns.clientId, clientId))
      .all();
    return rows.map(hydrate).sort((a, b) => a.position - b.position);
  }

  async create(data: CitationInput): Promise<ResponseCitation> {
    const row = this._db
      .insert(responseCitations)
      .values({
        responseId: data.responseId,
        url: data.url,
        rootDomain: data.rootDomain,
        ownedByBrandId: data.ownedByBrandId ?? null,
        position: data.position,
        isTrustedThirdParty: data.isTrustedThirdParty ? 1 : 0,
        sourceClass: data.sourceClass ?? "unknown_or_low_trust",
      })
      .returning()
      .get();
    return hydrate(row);
  }

  async bulkCreate(data: CitationInput[]): Promise<ResponseCitation[]> {
    const created: ResponseCitation[] = [];
    for (const item of data) {
      created.push(await this.create(item));
    }
    return created;
  }

  async deleteByResponse(responseId: number): Promise<void> {
    this._db
      .delete(responseCitations)
      .where(eq(responseCitations.responseId, responseId))
      .run();
  }
}
