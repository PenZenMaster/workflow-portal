/*
 * Module/Script Name: workflows.ts
 * Path: server/routes/workflows.ts
 *
 * Description:
 * Workflow CRUD REST API routes (list, get, create, update, delete) plus
 * the CSV upload + AI run endpoint (run-with-file). All routes require
 * authentication.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-09
 * Last Modified Date: 2026-07-01
 * Comments:
 * - v1.00 Carved out of server/routes.ts for Sprint 0 route/storage split
 * - v1.01 Added POST /api/workflows/:id/run-with-file (CSV upload feature)
 */

import express, { type Express } from "express";
import { storage } from "../storage";
import { insertWorkflowSchema } from "@shared/schema";
import { requireAuth } from "../auth";
import { runWorkflowWithCsv, MAX_CSV_BYTES } from "../services/workflowFileRun";

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

  // CSV upload + AI run. The body is the raw CSV text (Content-Type:
  // text/csv), which bypasses the app-wide JSON parser and its 100kb limit.
  // The file content is never written to disk.
  app.post(
    "/api/workflows/:id/run-with-file",
    requireAuth,
    express.text({ type: ["text/csv", "text/plain"], limit: MAX_CSV_BYTES }),
    async (req, res) => {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) {
        return res.status(400).json({ error: "Invalid id" });
      }

      const workflow = await storage.getWorkflow(id);
      if (!workflow) {
        return res.status(404).json({ error: "Not found" });
      }
      if (!workflow.acceptsFileUpload) {
        return res.status(400).json({
          error: "This workflow does not accept file uploads",
          code: "FILE_UPLOAD_NOT_ENABLED",
        });
      }

      const csvText = typeof req.body === "string" ? req.body : "";
      if (csvText.trim().length === 0) {
        return res.status(400).json({
          error: "CSV file is empty",
          code: "EMPTY_FILE",
        });
      }

      const filename =
        typeof req.query.filename === "string" ? req.query.filename : undefined;

      const response = await runWorkflowWithCsv(
        workflow.prompt,
        csvText,
        filename
      );
      res.json({
        data: {
          response: response.text,
          modelVariant: response.modelVariant,
          latencyMs: response.latencyMs,
        },
      });
    }
  );
}
