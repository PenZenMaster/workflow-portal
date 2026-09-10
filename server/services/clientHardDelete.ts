/*
 * Module/Script Name: clientHardDelete.ts
 * Path: server/services/clientHardDelete.ts
 *
 * Description:
 * Permanently deletes an already-archived client and every row across the
 * app that transitively references it - the "this client is not coming
 * back" complement to clientStore's soft delete()/restore(). Runs as a
 * single db.transaction() so a failure partway through leaves nothing
 * half-deleted; this is the first use of db.transaction() in this
 * codebase (drizzle-orm/better-sqlite3's transaction() is synchronous -
 * the driver itself is sync - and returns the callback's value directly).
 * Only clients already soft-deleted (clientStore.delete()) can be
 * hard-deleted; this function re-checks that itself rather than trusting
 * the caller, since it is the last line of defense before an irreversible
 * operation.
 *
 * Cascade order is leaves-before-parents even though this schema declares
 * no SQL-level foreign keys (plain integer columns, no .references() /
 * ON DELETE), so SQLite itself would not reject an out-of-order delete -
 * the ordering exists for our own correctness, not because the database
 * enforces it.
 *
 * Two tables use a polymorphic scope instead of a plain clientId column
 * and need their target ids collected before they can be cleaned up:
 *   - annotations: scopeKind (run|prompt|response|client) + scopeId
 *   - share_tokens: kind (export|live-dashboard) + resourceId
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-09-10
 * Last Modified Date: 2026-09-10
 * Comments:
 * - v1.00 Initial implementation
 */

import { eq, and, inArray } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/better-sqlite3";
import {
  clients,
  brands,
  brandAliases,
  competitors,
  clientUsers,
  promptCollections,
  promptGenerationRuns,
  prompts,
  promptRuns,
  responsesRaw,
  responseSentiment,
  responseMentions,
  responseCitations,
  responseRecommendations,
  measurementRunManifests,
  measurementHealthOverrides,
  integrations,
  reportExports,
  metricSnapshotsDaily,
  growthPlanRuns,
  runSchedules,
  factoryJobs,
  annotations,
  shareTokens,
} from "@shared/schema";

type DrizzleDb = ReturnType<typeof drizzle>;

/**
 * Permanently deletes an archived client and every row that transitively
 * references it. Returns false without deleting anything if the client
 * does not exist or is not currently archived (deletedAt === null).
 *
 * @param database The shared drizzle db instance.
 * @param clientId The client to permanently delete.
 */
export function hardDeleteClient(database: DrizzleDb, clientId: number): boolean {
  return database.transaction((tx) => {
    const client = tx.select().from(clients).where(eq(clients.id, clientId)).get();
    if (!client || client.deletedAt === null) return false;

    const brandIds = tx
      .select({ id: brands.id })
      .from(brands)
      .where(eq(brands.clientId, clientId))
      .all()
      .map((r) => r.id);
    const collectionIds = tx
      .select({ id: promptCollections.id })
      .from(promptCollections)
      .where(eq(promptCollections.clientId, clientId))
      .all()
      .map((r) => r.id);
    const runIds = tx
      .select({ id: promptRuns.id })
      .from(promptRuns)
      .where(eq(promptRuns.clientId, clientId))
      .all()
      .map((r) => r.id);
    const promptIds = collectionIds.length
      ? tx
          .select({ id: prompts.id })
          .from(prompts)
          .where(inArray(prompts.collectionId, collectionIds))
          .all()
          .map((r) => r.id)
      : [];
    const responseIds = runIds.length
      ? tx
          .select({ id: responsesRaw.id })
          .from(responsesRaw)
          .where(inArray(responsesRaw.runId, runIds))
          .all()
          .map((r) => r.id)
      : [];
    const reportExportIds = tx
      .select({ id: reportExports.id })
      .from(reportExports)
      .where(eq(reportExports.clientId, clientId))
      .all()
      .map((r) => r.id);

    // Response-level tables
    if (responseIds.length) {
      tx.delete(responseSentiment).where(inArray(responseSentiment.responseId, responseIds)).run();
      tx.delete(responseMentions).where(inArray(responseMentions.responseId, responseIds)).run();
      tx.delete(responseCitations).where(inArray(responseCitations.responseId, responseIds)).run();
      tx.delete(responseRecommendations)
        .where(inArray(responseRecommendations.responseId, responseIds))
        .run();
    }

    // Annotations - polymorphic scope (run|prompt|response|client)
    tx.delete(annotations)
      .where(and(eq(annotations.scopeKind, "client"), eq(annotations.scopeId, clientId)))
      .run();
    if (runIds.length) {
      tx.delete(annotations)
        .where(and(eq(annotations.scopeKind, "run"), inArray(annotations.scopeId, runIds)))
        .run();
    }
    if (promptIds.length) {
      tx.delete(annotations)
        .where(and(eq(annotations.scopeKind, "prompt"), inArray(annotations.scopeId, promptIds)))
        .run();
    }
    if (responseIds.length) {
      tx.delete(annotations)
        .where(
          and(eq(annotations.scopeKind, "response"), inArray(annotations.scopeId, responseIds))
        )
        .run();
    }

    // Share tokens - polymorphic resource (export -> report_exports.id,
    // live-dashboard -> the client's own id)
    if (reportExportIds.length) {
      tx.delete(shareTokens)
        .where(and(eq(shareTokens.kind, "export"), inArray(shareTokens.resourceId, reportExportIds)))
        .run();
    }
    tx.delete(shareTokens)
      .where(and(eq(shareTokens.kind, "live-dashboard"), eq(shareTokens.resourceId, clientId)))
      .run();

    if (runIds.length) {
      tx.delete(responsesRaw).where(inArray(responsesRaw.runId, runIds)).run();
      tx.delete(measurementHealthOverrides)
        .where(inArray(measurementHealthOverrides.runId, runIds))
        .run();
    }
    tx.delete(measurementRunManifests).where(eq(measurementRunManifests.clientId, clientId)).run();
    tx.delete(promptRuns).where(eq(promptRuns.clientId, clientId)).run();

    if (collectionIds.length) {
      tx.delete(prompts).where(inArray(prompts.collectionId, collectionIds)).run();
    }
    tx.delete(promptGenerationRuns).where(eq(promptGenerationRuns.clientId, clientId)).run();
    tx.delete(promptCollections).where(eq(promptCollections.clientId, clientId)).run();

    if (brandIds.length) {
      tx.delete(brandAliases).where(inArray(brandAliases.brandId, brandIds)).run();
    }
    tx.delete(competitors).where(eq(competitors.clientId, clientId)).run();
    tx.delete(brands).where(eq(brands.clientId, clientId)).run();

    tx.delete(clientUsers).where(eq(clientUsers.clientId, clientId)).run();
    tx.delete(integrations).where(eq(integrations.clientId, clientId)).run();
    tx.delete(reportExports).where(eq(reportExports.clientId, clientId)).run();
    tx.delete(metricSnapshotsDaily).where(eq(metricSnapshotsDaily.clientId, clientId)).run();
    tx.delete(growthPlanRuns).where(eq(growthPlanRuns.clientId, clientId)).run();
    tx.delete(runSchedules).where(eq(runSchedules.clientId, clientId)).run();
    tx.delete(factoryJobs).where(eq(factoryJobs.clientId, clientId)).run();

    tx.delete(clients).where(eq(clients.id, clientId)).run();

    return true;
  });
}
