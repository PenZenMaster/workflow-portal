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
 * Last Modified Date: 2026-07-03
 * Comments:
 * - v1.00 Carved out of server/routes.ts for Sprint 0 route/storage split
 * - v1.01 Added POST /api/workflows/:id/run-with-file (CSV upload feature)
 * - v1.02 B-21: run-with-file accepts JSON { csv, inputValues }
 * - v1.03 Added POST /api/workflows/:id/run (Phase 3 read-only slice:
 *   in-app run via the RankRocket MCP connector, no CSV)
 */

import express, { type Express } from "express";
import { z } from "zod";
import { storage, workflowInputValueStore } from "../storage";
import { insertWorkflowSchema, saveInputValuesSchema } from "@shared/schema";
import { requireAuth } from "../auth";
import { runWorkflowWithCsv, MAX_CSV_BYTES } from "../services/workflowFileRun";
import { runWorkflowPrompt } from "../services/workflowPromptRun";

const runWithFileJsonSchema = z.object({
  csv: z.string(),
  inputValues: z.array(z.string()).default([]),
});

const runPromptJsonSchema = z.object({
  inputValues: z.array(z.string()).default([]),
});

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

  // Last-used launch input values (B-23), shared across users so
  // rarely-changing inputs are prefilled on the next launch.
  app.get("/api/workflows/:id/input-values", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const workflow = await storage.getWorkflow(id);
    if (!workflow) return res.status(404).json({ error: "Not found" });
    const values = await workflowInputValueStore.getByWorkflow(id);
    res.json({ data: values });
  });

  app.put("/api/workflows/:id/input-values", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const parsed = saveInputValuesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Validation failed", details: parsed.error.flatten() });
    }
    const workflow = await storage.getWorkflow(id);
    if (!workflow) return res.status(404).json({ error: "Not found" });
    await workflowInputValueStore.upsertMany(id, parsed.data.values);
    res.json({ data: parsed.data.values });
  });

  // CSV upload + AI run. Two body formats are accepted, both mounted
  // route-level to bypass the app-wide JSON parser and its 100kb limit:
  // - text/csv (legacy): the raw CSV text, no input values.
  // - application/json (B-21): { csv, inputValues } so the workflow's
  //   <PASTE> tokens can be filled before the prompt is sent to the model.
  // The file content is never written to disk.
  app.post(
    "/api/workflows/:id/run-with-file",
    requireAuth,
    express.text({ type: ["text/csv", "text/plain"], limit: MAX_CSV_BYTES }),
    express.json({ limit: MAX_CSV_BYTES }),
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

      let csvText = "";
      let inputValues: string[] = [];
      if (typeof req.body === "string") {
        csvText = req.body;
      } else {
        const parsed = runWithFileJsonSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: "Validation failed",
            code: "VALIDATION_ERROR",
            details: parsed.error.flatten(),
          });
        }
        csvText = parsed.data.csv;
        inputValues = parsed.data.inputValues;
      }

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
        filename,
        inputValues,
        workflow.aiAdapterSlug
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

  // In-app run via the RankRocket MCP connector (Phase 3, read-only slice).
  // No CSV, no external launch - Claude calls rankrocket-mcp's tools
  // server-side via Anthropic's MCP connector.
  app.post("/api/workflows/:id/run", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const workflow = await storage.getWorkflow(id);
    if (!workflow) {
      return res.status(404).json({ error: "Not found" });
    }
    if (!workflow.rankrocketMcpEnabled) {
      return res.status(400).json({
        error: "This workflow does not have RankRocket MCP enabled",
        code: "RANKROCKET_MCP_NOT_ENABLED",
      });
    }

    const parsed = runPromptJsonSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        details: parsed.error.flatten(),
      });
    }

    const response = await runWorkflowPrompt(workflow.prompt, parsed.data.inputValues);
    res.json({
      data: {
        response: response.text,
        modelVariant: response.modelVariant,
        latencyMs: response.latencyMs,
      },
    });
  });
}
