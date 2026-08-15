/*
 * Module/Script Name: workflows.promptrun.test.ts
 * Path: tests/server/workflows.promptrun.test.ts
 *
 * Description:
 * Route tests for POST /api/workflows/:id/run - the in-app RankRocket MCP
 * prompt run endpoint (Phase 3, read-only slice). No CSV involved. Covers
 * auth, validation, the rankrocketMcpEnabled gate, missing-config 503, and
 * the success envelope.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-15
 * Last Modified Date: 2026-08-15
 * Comments:
 * - v1.00 Initial implementation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import session from "express-session";

const mockStorage = {
  getWorkflow: vi.fn(),
  listWorkflows: vi.fn(),
  createWorkflow: vi.fn(),
  updateWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(),
};
vi.mock("../../server/storage", () => ({
  storage: mockStorage,
  workflowInputValueStore: { getByWorkflow: vi.fn(), upsertMany: vi.fn() },
}));

const mockGetRankRocketMcpAdapter = vi.fn();
vi.mock("../../server/adapters/registry", () => ({
  getAdapter: () => undefined,
  getUtilityAdapter: () => undefined,
  getConfiguredSlugs: () => [],
  getRankRocketMcpAdapter: () => mockGetRankRocketMcpAdapter(),
}));

const { registerWorkflowRoutes } = await import("../../server/routes/workflows");
const { AppError } = await import("../../server/errors");

const WORKFLOW = {
  id: 1,
  name: "RankRocket Site Insights",
  category: "Audit",
  description: "Ask about a RankRocket-managed site's SEO status",
  inputs: ["Site key", "Question"],
  optionalInputs: [],
  tags: [],
  prompt: "Site key: <PASTE>\nQuestion: <PASTE>",
  launchUrl: "",
  launchLabel: "",
  pinned: false,
  acceptsFileUpload: false,
  aiAdapterSlug: null,
  rankrocketMcpEnabled: true,
  createdAt: 1,
  updatedAt: 1,
};

function buildApp(authenticated = true) {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: "test-secret-32-chars-minimum-ok",
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false },
    })
  );
  if (authenticated) {
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.session.user = { id: 1, username: "testuser", role: "agency_admin" };
      next();
    });
  }
  registerWorkflowRoutes(app);
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message, code: err.code ?? null });
    }
    res.status(500).json({ error: "Internal server error" });
  });
  return app;
}

describe("POST /api/workflows/:id/run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.getWorkflow.mockResolvedValue(WORKFLOW);
    mockGetRankRocketMcpAdapter.mockReturnValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    const app = buildApp(false);
    const res = await request(app).post("/api/workflows/1/run").send({ inputValues: [] });
    expect(res.status).toBe(401);
  });

  it("returns 400 for a non-numeric id", async () => {
    const app = buildApp();
    const res = await request(app).post("/api/workflows/abc/run").send({ inputValues: [] });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the workflow does not exist", async () => {
    mockStorage.getWorkflow.mockResolvedValue(undefined);
    const app = buildApp();
    const res = await request(app).post("/api/workflows/999/run").send({ inputValues: [] });
    expect(res.status).toBe(404);
  });

  it("returns 400 RANKROCKET_MCP_NOT_ENABLED when the workflow doesn't have the flag set", async () => {
    mockStorage.getWorkflow.mockResolvedValue({ ...WORKFLOW, rankrocketMcpEnabled: false });
    const app = buildApp();
    const res = await request(app).post("/api/workflows/1/run").send({ inputValues: [] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("RANKROCKET_MCP_NOT_ENABLED");
  });

  it("returns 503 RANKROCKET_MCP_NOT_CONFIGURED when the adapter is not configured", async () => {
    const app = buildApp();
    const res = await request(app).post("/api/workflows/1/run").send({ inputValues: [] });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("RANKROCKET_MCP_NOT_CONFIGURED");
  });

  it("returns 200 with the response and passes the filled prompt to the adapter", async () => {
    const run = vi.fn().mockResolvedValue({
      text: "The plugin is active; alt-text coverage is 92%.",
      summaryBlock: null,
      citations: [],
      requestedModel: "claude-opus-5",
      modelVariant: "claude-opus-5",
      latencyMs: 1234,
      rawPayload: {},
      usage: null,
    });
    mockGetRankRocketMcpAdapter.mockReturnValue({ id: "anthropic", run });

    const app = buildApp();
    const res = await request(app)
      .post("/api/workflows/1/run")
      .send({ inputValues: ["tristate-hvac", "What's the plugin status?"] });

    expect(res.status).toBe(200);
    expect(res.body.data.response).toContain("alt-text coverage is 92%");
    expect(res.body.data.modelVariant).toBe("claude-opus-5");

    const sentPrompt = run.mock.calls[0][0] as string;
    expect(sentPrompt).toBe("Site key: tristate-hvac\nQuestion: What's the plugin status?");
  });

  it("defaults inputValues to an empty array when omitted", async () => {
    const run = vi.fn().mockResolvedValue({
      text: "ok",
      summaryBlock: null,
      citations: [],
      requestedModel: "claude-opus-5",
      modelVariant: "claude-opus-5",
      latencyMs: 1,
      rawPayload: {},
      usage: null,
    });
    mockGetRankRocketMcpAdapter.mockReturnValue({ id: "anthropic", run });

    const app = buildApp();
    const res = await request(app).post("/api/workflows/1/run").send({});

    expect(res.status).toBe(200);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
