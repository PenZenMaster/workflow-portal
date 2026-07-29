/*
 * Module/Script Name: prompts.ts
 * Path: server/routes/prompts.ts
 *
 * Description:
 * REST API routes for the AI Visibility prompt-library domain:
 * platforms, prompt collections (with clone and activate), and prompts
 * (including bulk import). All responses use the { data } envelope.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-09
 * Last Modified Date: 2026-07-29
 * Comments:
 * - v1.00 Sprint 2 initial implementation
 * - v1.01 B-18: collection archive/unarchive + guarded DELETE
 * - v1.02 issue #4 Phase 2 item 7 (cell half): existingPromptCells
 *   passed to generatePrompts, excluding unclassified prompts
 * - v1.03 issue #4 Phase 2 item 8: brandContext/brandInPrompt
 *   recomputed from text at both prompt-save endpoints, never trusting
 *   a client-supplied value
 * - v1.04 issue #4 Phase 3 item 9 (slice 1): the collection's panelType
 *   is passed into generation context
 * - v1.05 issue #4 Phase 3 item I (slice 4): withDerivedCategory
 *   overrides category from intentType (never trusting a stale
 *   client-supplied value) at all three prompt-write endpoints
 */

import type { Express } from "express";
import {
  platformStore,
  promptCollectionStore,
  promptStore,
  clientStore,
  brandStore,
  promptMethodologyStore,
  promptGenerationRunStore,
} from "../storage";
import {
  insertPromptCollectionSchema,
  insertPromptSchema,
  bulkInsertPromptsSchema,
  insertPlatformSchema,
  updatePlatformSchema,
  generatePromptsSchema,
  INTENT_TO_LEGACY_CATEGORY,
  type InsertPrompt,
} from "@shared/schema";
import { requireAuth, requireRole } from "../auth";
import { ok, created, noContent } from "../response";
import { AppError } from "../errors";
import { generatePrompts } from "../services/promptGenerator";
import { deriveBrandContext } from "../services/brandContext";
import type { BrandInput } from "../services/parser";

const ADMIN_ROLES = ["super_admin", "agency_admin"] as const;
const EDITOR_ROLES = ["super_admin", "agency_admin", "analyst"] as const;

function toBrandInput(canonicalName: string): BrandInput {
  return { id: 0, canonicalName, primaryDomain: null, aliases: [] };
}

// issue #4 Phase 3 item I: legacy category is derived from intentType,
// same "never trust the client for a derived field" precedent as
// brandContext (item 8) - a manual prompt or an edited intentType must
// not leave a mismatched category behind. intentType is optional, so
// omitting it (legacy callers, or manual prompts not yet classified)
// leaves category exactly as the client sent it.
function withDerivedCategory(data: InsertPrompt): InsertPrompt {
  if (!data.intentType) return data;
  return { ...data, category: INTENT_TO_LEGACY_CATEGORY[data.intentType] };
}

// issue #4 Phase 2 item 8: brandContext/brandInPrompt are deterministic
// from text - never trust a client-supplied value, since an analyst can
// edit prompt text after generation (or type a manual prompt) leaving a
// stale classification. Same known limitation as generation-time
// derivation: canonical brand/competitor names only, not configured
// aliases (see docs/system-documentation.md).
async function resolveBrandInputs(
  collectionId: number
): Promise<{ clientBrandInputs: BrandInput[]; competitorBrandInputs: BrandInput[] } | null> {
  const collection = await promptCollectionStore.get(collectionId);
  if (!collection) return null;
  const brands = await brandStore.listByClient(collection.clientId);
  return {
    clientBrandInputs: brands.filter((b) => b.kind === "client").map((b) => toBrandInput(b.canonicalName)),
    competitorBrandInputs: brands.filter((b) => b.kind === "competitor").map((b) => toBrandInput(b.canonicalName)),
  };
}

export function registerPromptRoutes(app: Express): void {
  // --- Platforms -----------------------------------------------------------

  app.get("/api/platforms", requireAuth, async (_req, res) => {
    const data = await platformStore.list();
    ok(res, data);
  });

  app.post("/api/platforms", requireRole(...ADMIN_ROLES), async (req, res) => {
    const parsed = insertPlatformSchema.safeParse(req.body);
    if (!parsed.success)
      throw new AppError(400, "Validation failed", "VALIDATION_ERROR");
    const existing = await platformStore.getBySlug(parsed.data.slug);
    if (existing)
      throw new AppError(409, "Platform slug already exists", "DUPLICATE_SLUG");
    const platform = await platformStore.create(parsed.data);
    created(res, platform);
  });

  app.patch("/api/platforms/:id", requireRole(...ADMIN_ROLES), async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");
    const parsed = updatePlatformSchema.safeParse(req.body);
    if (!parsed.success)
      throw new AppError(400, "Validation failed", "VALIDATION_ERROR");
    const platform = await platformStore.update(id, parsed.data);
    if (!platform)
      throw new AppError(404, "Platform not found", "PLATFORM_NOT_FOUND");
    ok(res, platform);
  });

  app.delete("/api/platforms/:id", requireRole(...ADMIN_ROLES), async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");
    const platform = await platformStore.get(id);
    if (!platform)
      throw new AppError(404, "Platform not found", "PLATFORM_NOT_FOUND");
    const responseCount = await platformStore.countResponses(id);
    if (responseCount > 0)
      throw new AppError(409, "Platform is in use by existing responses", "PLATFORM_IN_USE");
    await platformStore.delete(id);
    noContent(res);
  });

  // --- Prompt Collections --------------------------------------------------

  app.get(
    "/api/clients/:clientId/prompt-collections",
    requireAuth,
    async (req, res) => {
      const clientId = Number(req.params.clientId);
      if (Number.isNaN(clientId))
        throw new AppError(400, "Invalid client id", "INVALID_ID");
      const data = await promptCollectionStore.listByClient(clientId);
      ok(res, data);
    }
  );

  // Get a single collection by id
  app.get("/api/prompt-collections/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");
    const collection = await promptCollectionStore.get(id);
    if (!collection)
      throw new AppError(404, "Collection not found", "COLLECTION_NOT_FOUND");
    ok(res, collection);
  });

  app.post(
    "/api/clients/:clientId/prompt-collections",
    requireRole(...EDITOR_ROLES),
    async (req, res) => {
      const clientId = Number(req.params.clientId);
      if (Number.isNaN(clientId))
        throw new AppError(400, "Invalid client id", "INVALID_ID");
      const parsed = insertPromptCollectionSchema.safeParse(req.body);
      if (!parsed.success)
        throw new AppError(400, "Validation failed", "VALIDATION_ERROR");
      const collection = await promptCollectionStore.create(clientId, parsed.data);
      created(res, collection);
    }
  );

  app.patch(
    "/api/prompt-collections/:id",
    requireRole(...EDITOR_ROLES),
    async (req, res) => {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");
      const parsed = insertPromptCollectionSchema.safeParse(req.body);
      if (!parsed.success)
        throw new AppError(400, "Validation failed", "VALIDATION_ERROR");
      const collection = await promptCollectionStore.update(id, parsed.data);
      if (!collection)
        throw new AppError(404, "Collection not found", "COLLECTION_NOT_FOUND");
      ok(res, collection);
    }
  );

  app.post(
    "/api/prompt-collections/:id/clone",
    requireRole(...EDITOR_ROLES),
    async (req, res) => {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");
      try {
        const cloned = await promptCollectionStore.clone(id);
        created(res, cloned);
      } catch {
        throw new AppError(404, "Collection not found", "COLLECTION_NOT_FOUND");
      }
    }
  );

  app.post(
    "/api/prompt-collections/:id/activate",
    requireRole(...EDITOR_ROLES),
    async (req, res) => {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");
      const collection = await promptCollectionStore.activate(id);
      if (!collection)
        throw new AppError(404, "Collection not found", "COLLECTION_NOT_FOUND");
      ok(res, collection);
    }
  );

  app.post(
    "/api/prompt-collections/:id/archive",
    requireRole(...EDITOR_ROLES),
    async (req, res) => {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");
      const collection = await promptCollectionStore.setStatus(id, "archived");
      if (!collection)
        throw new AppError(404, "Collection not found", "COLLECTION_NOT_FOUND");
      ok(res, collection);
    }
  );

  app.post(
    "/api/prompt-collections/:id/unarchive",
    requireRole(...EDITOR_ROLES),
    async (req, res) => {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");
      const collection = await promptCollectionStore.setStatus(id, "draft");
      if (!collection)
        throw new AppError(404, "Collection not found", "COLLECTION_NOT_FOUND");
      ok(res, collection);
    }
  );

  // Hard delete is admin-only and blocked while runs reference the
  // collection (mirrors the PLATFORM_IN_USE pattern). Archive instead when
  // history must be kept.
  app.delete(
    "/api/prompt-collections/:id",
    requireRole(...ADMIN_ROLES),
    async (req, res) => {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");
      const collection = await promptCollectionStore.get(id);
      if (!collection)
        throw new AppError(404, "Collection not found", "COLLECTION_NOT_FOUND");
      const runCount = await promptCollectionStore.countRuns(id);
      if (runCount > 0)
        throw new AppError(
          409,
          "Collection has runs referencing it - archive it instead",
          "COLLECTION_IN_USE"
        );
      await promptCollectionStore.delete(id);
      noContent(res);
    }
  );

  app.post(
    "/api/clients/:clientId/prompt-collections/:id/generate-prompts",
    requireRole(...EDITOR_ROLES),
    async (req, res) => {
      const clientId = Number(req.params.clientId);
      const collectionId = Number(req.params.id);
      if (Number.isNaN(clientId) || Number.isNaN(collectionId))
        throw new AppError(400, "Invalid id", "INVALID_ID");

      const client = await clientStore.get(clientId);
      if (!client)
        throw new AppError(404, "Client not found", "CLIENT_NOT_FOUND");

      const collection = await promptCollectionStore.get(collectionId);
      if (!collection)
        throw new AppError(404, "Collection not found", "COLLECTION_NOT_FOUND");
      // FR-01: generation must never cross client boundaries. 404 (not
      // 403) so collection ids of other clients cannot be probed.
      if (collection.clientId !== clientId)
        throw new AppError(404, "Collection not found", "COLLECTION_NOT_FOUND");

      const parsed = generatePromptsSchema.safeParse(req.body ?? {});
      if (!parsed.success)
        throw new AppError(400, "Validation failed", "VALIDATION_ERROR");

      const brands = await brandStore.listByClient(clientId);
      const clientBrandNames = brands
        .filter((b) => b.kind === "client")
        .map((b) => b.canonicalName);
      const competitorNames = brands
        .filter((b) => b.kind === "competitor")
        .map((b) => b.canonicalName);

      const existingPrompts = await promptStore.listByCollection(collectionId);

      // issue #4 Phase 2 item 7 (cell half): a prompt without a real
      // intentType/brandContext isn't a real measurement cell yet, so it
      // can't meaningfully collide with a new candidate's cell - exclude it
      // rather than comparing against an "unclassified" bucket.
      const existingPromptCells = existingPrompts
        .filter((p) => p.intentType != null && p.brandContext != null)
        .map((p) => ({
          intentType: p.intentType as NonNullable<typeof p.intentType>,
          service: p.service,
          geo: p.geo,
          brandContext: p.brandContext as NonNullable<typeof p.brandContext>,
        }));

      const context = {
        clientName: client.name,
        primaryDomain: client.primaryDomain,
        geographies: client.geographies,
        clientBrandNames: clientBrandNames.length > 0 ? clientBrandNames : [client.name],
        competitorNames,
        coreServices: client.coreServices,
        exclusions: client.exclusions,
        existingPromptTexts: existingPrompts.map((p) => p.text),
        existingPromptCells,
        count: parsed.data.count,
        panelType: collection.panelType,
      };
      const { provenance, ...result } = await generatePrompts(context);

      // E2c: immutable provenance record for this generation event. The
      // snapshot stores the audit-relevant context; existing prompt texts
      // are reduced to a count (they live in the prompts table).
      const methodology = await promptMethodologyStore.getActive();
      const { existingPromptTexts, ...auditContext } = context;
      const run = await promptGenerationRunStore.create({
        clientId,
        collectionId,
        requestedCount: parsed.data.count,
        adapterSlug: provenance.adapterSlug,
        modelVariant: provenance.modelVariant,
        methodologyVersion: methodology?.version ?? "unknown",
        contextSnapshot: JSON.stringify({
          ...auditContext,
          existingPromptCount: existingPromptTexts.length,
        }),
        rawOutput: provenance.rawText,
        validCount: result.candidates.length,
        invalidCount: result.invalid.length,
        warnings: result.warnings,
        invalidItems: result.invalid,
        createdByUserId: req.session.user?.id ?? null,
      });

      ok(res, { ...result, generationRunId: run.id });
    }
  );

  // --- Generation provenance (E2c) ------------------------------------------

  app.get(
    "/api/prompt-collections/:id/generation-runs",
    requireRole(...EDITOR_ROLES),
    async (req, res) => {
      const collectionId = Number(req.params.id);
      if (Number.isNaN(collectionId))
        throw new AppError(400, "Invalid id", "INVALID_ID");
      const runs = await promptGenerationRunStore.listByCollection(collectionId);
      ok(res, runs);
    }
  );

  app.get(
    "/api/generation-runs/:id",
    requireRole(...EDITOR_ROLES),
    async (req, res) => {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");
      const run = await promptGenerationRunStore.get(id);
      if (!run)
        throw new AppError(404, "Generation run not found", "GENERATION_RUN_NOT_FOUND");
      ok(res, run);
    }
  );

  // --- Prompts -------------------------------------------------------------

  app.get(
    "/api/prompt-collections/:id/prompts",
    requireAuth,
    async (req, res) => {
      const collectionId = Number(req.params.id);
      if (Number.isNaN(collectionId))
        throw new AppError(400, "Invalid id", "INVALID_ID");
      const data = await promptStore.listByCollection(collectionId);
      ok(res, data);
    }
  );

  app.post(
    "/api/prompt-collections/:id/prompts",
    requireRole(...EDITOR_ROLES),
    async (req, res) => {
      const collectionId = Number(req.params.id);
      if (Number.isNaN(collectionId))
        throw new AppError(400, "Invalid id", "INVALID_ID");
      const parsed = insertPromptSchema.safeParse(req.body);
      if (!parsed.success)
        throw new AppError(400, "Validation failed", "VALIDATION_ERROR");

      let data = withDerivedCategory(parsed.data);
      const brandInputs = await resolveBrandInputs(collectionId);
      if (brandInputs) {
        const brandContext = deriveBrandContext(data.text, brandInputs.clientBrandInputs, brandInputs.competitorBrandInputs);
        data = {
          ...data,
          brandContext,
          brandInPrompt: brandContext === "client_branded" || brandContext === "client_and_competitor",
        };
      }

      const prompt = await promptStore.create(collectionId, data);
      created(res, prompt);
    }
  );

  app.post(
    "/api/prompt-collections/:id/prompts/bulk",
    requireRole(...EDITOR_ROLES),
    async (req, res) => {
      const collectionId = Number(req.params.id);
      if (Number.isNaN(collectionId))
        throw new AppError(400, "Invalid id", "INVALID_ID");
      const parsed = bulkInsertPromptsSchema.safeParse(req.body);
      if (!parsed.success)
        throw new AppError(400, "Validation failed", "VALIDATION_ERROR");

      let prompts = parsed.data.prompts.map(withDerivedCategory);
      const brandInputs = await resolveBrandInputs(collectionId);
      if (brandInputs) {
        prompts = prompts.map((p) => {
          const brandContext = deriveBrandContext(p.text, brandInputs.clientBrandInputs, brandInputs.competitorBrandInputs);
          return {
            ...p,
            brandContext,
            brandInPrompt: brandContext === "client_branded" || brandContext === "client_and_competitor",
          };
        });
      }

      const created_prompts = await promptStore.bulkCreate(
        collectionId,
        prompts,
        parsed.data.generationRunId
      );
      created(res, created_prompts);
    }
  );

  app.patch(
    "/api/prompts/:id",
    requireRole(...EDITOR_ROLES),
    async (req, res) => {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");
      const parsed = insertPromptSchema.safeParse(req.body);
      if (!parsed.success)
        throw new AppError(400, "Validation failed", "VALIDATION_ERROR");
      const prompt = await promptStore.update(id, withDerivedCategory(parsed.data));
      if (!prompt)
        throw new AppError(404, "Prompt not found", "PROMPT_NOT_FOUND");
      ok(res, prompt);
    }
  );

  app.delete(
    "/api/prompts/:id",
    requireRole(...ADMIN_ROLES),
    async (req, res) => {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) throw new AppError(400, "Invalid id", "INVALID_ID");
      const deleted = await promptStore.delete(id);
      if (!deleted)
        throw new AppError(404, "Prompt not found", "PROMPT_NOT_FOUND");
      noContent(res);
    }
  );
}
