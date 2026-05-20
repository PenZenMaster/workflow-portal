/*
 * Module/Script Name: workflows.ts
 * Path: server/routes/workflows.ts
 *
 * Description:
 * Workflow CRUD REST API routes (list, get, create, update, delete).
 * All routes require authentication.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-09
 * Last Modified Date: 2026-05-09
 * Comments:
 * - v1.00 Carved out of server/routes.ts for Sprint 0 route/storage split
 */

import type { Express } from "express";
import { storage } from "../storage";
import { insertWorkflowSchema } from "@shared/schema";
import { requireAuth } from "../auth";

export function registerWorkflowRoutes(app: Express): void {
  app.get("/api/workflows", requireAuth, async (_req, res) => {
    const items = await storage.listWorkflows();
    res.json(items);
  });

  app.get("/api/workflows/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const item = await storage.getWorkflow(id);
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json(item);
  });

  app.post("/api/workflows", requireAuth, async (req, res) => {
    const parsed = insertWorkflowSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Validation failed", details: parsed.error.flatten() });
    }
    const created = await storage.createWorkflow(parsed.data);
    res.status(201).json(created);
  });

  app.put("/api/workflows/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const parsed = insertWorkflowSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Validation failed", details: parsed.error.flatten() });
    }
    const updated = await storage.updateWorkflow(id, parsed.data);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  });

  app.delete("/api/workflows/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const ok = await storage.deleteWorkflow(id);
    if (!ok) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  });
}
