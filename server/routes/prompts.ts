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
 * Last Modified Date: 2026-05-09
 * Comments:
 * - v1.00 Sprint 2 initial implementation
 */

import type { Express } from "express";
import {
  platformStore,
  promptCollectionStore,
  promptStore,
} from "../storage";
import {
  insertPromptCollectionSchema,
  insertPromptSchema,
  bulkInsertPromptsSchema,
} from "@shared/schema";
import { requireAuth, requireRole } from "../auth";
import { ok, created, noContent } from "../response";
import { AppError } from "../errors";

const ADMIN_ROLES = ["super_admin", "agency_admin"] as const;
const EDITOR_ROLES = ["super_admin", "agency_admin", "analyst"] as const;

export function registerPromptRoutes(app: Express): void {
  // --- Platforms -----------------------------------------------------------

  app.get("/api/platforms", requireAuth, async (_req, res) => {
    const data = await platformStore.list();
    ok(res, data);
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
      const prompt = await promptStore.create(collectionId, parsed.data);
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
      const created_prompts = await promptStore.bulkCreate(
        collectionId,
        parsed.data.prompts
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
      const prompt = await promptStore.update(id, parsed.data);
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
