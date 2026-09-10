/*
 * Module/Script Name: workflows.promptrun.test.ts
 * Path: tests/server/workflows.promptrun.test.ts
 *
 * Description:
 * Route tests for POST /api/workflows/:id/run - the in-app RankRocket MCP
 * prompt run endpoint (Phase 3 v2, read-only slice). No CSV involved.
 * Covers auth, validation, the rankrocketMcpEnabled gate, and the success
 * envelope. Mocks runWorkflowPrompt() at the service boundary rather than
 * the registry/mcpClient/tool-loop internals it now composes - those are
 * covered by workflowPromptRun.test.ts; this file only tests route
 * concerns (auth, validation, error/response envelope).
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-15
 * Last Modified Date: 2026-08-16
 * Comments:
 * - v1.00 Initial implementation (Phase 3 v1)
 * - v2.00 Phase 3 v2: mock runWorkflowPrompt() directly, not the registry
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
const mockClientStore = { get: vi.fn() };
const mockFactoryJobStore = { create: vi.fn(), get: vi.fn() };
vi.mock("../../server/storage", () => ({
  storage: mockStorage,
  workflowInputValueStore: { getByWorkflow: vi.fn(), upsertMany: vi.fn() },
  clientStore: mockClientStore,
  growthPlanRunStore: { getPreviousRun: vi.fn(), create: vi.fn() },
  factoryJobStore: mockFactoryJobStore,
}));

const mockJobRunnerEnqueue = vi.fn();
vi.mock("../../server/jobs/runner", () => ({
  jobRunner: { enqueue: (...args: unknown[]) => mockJobRunnerEnqueue(...args) },
}));

const mockRunWorkflowPrompt = vi.fn();
vi.mock("../../server/services/workflowPromptRun", () => ({
  runWorkflowPrompt: (...args: unknown[]) => mockRunWorkflowPrompt(...args),
}));

const mockRunLocationPageBuilder = vi.fn();
vi.mock("../../server/services/factory/locationPageBuilderCell", async () => {
  const actual = await vi.importActual<
    typeof import("../../server/services/factory/locationPageBuilderCell")
  >("../../server/services/factory/locationPageBuilderCell");
  return {
    ...actual,
    runLocationPageBuilder: (...args: unknown[]) => mockRunLocationPageBuilder(...args),
  };
});

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
    expect(mockRunWorkflowPrompt).not.toHaveBeenCalled();
  });

  it("propagates a 503 thrown by runWorkflowPrompt (e.g. RANKROCKET_MCP_NOT_CONFIGURED)", async () => {
    mockRunWorkflowPrompt.mockRejectedValue(
      new AppError(503, "RankRocket MCP is not configured", "RANKROCKET_MCP_NOT_CONFIGURED")
    );
    const app = buildApp();
    const res = await request(app).post("/api/workflows/1/run").send({ inputValues: [] });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("RANKROCKET_MCP_NOT_CONFIGURED");
  });

  it("returns 200 with the response and passes the filled prompt to runWorkflowPrompt", async () => {
    mockRunWorkflowPrompt.mockResolvedValue({
      text: "The plugin is active; alt-text coverage is 92%.",
      summaryBlock: null,
      citations: [],
      requestedModel: "claude-opus-5",
      modelVariant: "claude-opus-5",
      latencyMs: 1234,
      rawPayload: {},
      usage: null,
    });

    const app = buildApp();
    const res = await request(app)
      .post("/api/workflows/1/run")
      .send({ inputValues: ["tristate-hvac", "What's the plugin status?"] });

    expect(res.status).toBe(200);
    expect(res.body.data.response).toContain("alt-text coverage is 92%");
    expect(res.body.data.modelVariant).toBe("claude-opus-5");
    expect(mockRunWorkflowPrompt).toHaveBeenCalledWith(WORKFLOW.prompt, [
      "tristate-hvac",
      "What's the plugin status?",
    ]);
  });

  it("defaults inputValues to an empty array when omitted", async () => {
    mockRunWorkflowPrompt.mockResolvedValue({
      text: "ok",
      summaryBlock: null,
      citations: [],
      requestedModel: "claude-opus-5",
      modelVariant: "claude-opus-5",
      latencyMs: 1,
      rawPayload: {},
      usage: null,
    });

    const app = buildApp();
    const res = await request(app).post("/api/workflows/1/run").send({});

    expect(res.status).toBe(200);
    expect(mockRunWorkflowPrompt).toHaveBeenCalledWith(WORKFLOW.prompt, []);
  });
});

describe("POST /api/workflows/:id/run — locationPageBuilderEnabled branch", () => {
  const LOCATION_PAGE_BUILDER_WORKFLOW = {
    ...WORKFLOW,
    rankrocketMcpEnabled: false,
    locationPageBuilderEnabled: true,
    inputs: ["Target city or service area(s)"],
    optionalInputs: [
      "Business name",
      "Primary service / money page URL",
      "Page template / content style preferences",
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.getWorkflow.mockResolvedValue(LOCATION_PAGE_BUILDER_WORKFLOW);
  });

  it("returns 400 CLIENT_ID_REQUIRED when no clientId is provided", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/workflows/1/run")
      .send({ inputValues: ["Austin, Dallas"] });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("CLIENT_ID_REQUIRED");
    expect(mockRunLocationPageBuilder).not.toHaveBeenCalled();
  });

  it("creates a queued factory job and enqueues it instead of running synchronously, returning 202", async () => {
    mockFactoryJobStore.create.mockResolvedValue({
      id: 42,
      jobId: "lpb-abc123",
      clientId: 4,
      contractVersion: "1.0",
      jobType: "content.location-page-builder",
      priority: "normal",
      input: { targetCitiesOrServiceAreas: "Austin, Dallas" },
      dryRun: false,
      approvalRequired: false,
      status: "queued",
      lastError: null,
      output: null,
      approvedBy: null,
      approvedAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const app = buildApp();
    const res = await request(app)
      .post("/api/workflows/1/run")
      .send({
        inputValues: ["Austin, Dallas", "Camphouse Country Landscaping", "", ""],
        clientId: 4,
      });

    expect(res.status).toBe(202);
    expect(res.body.data.factoryJobId).toBe(42);
    expect(res.body.data.status).toBe("queued");
    expect(mockRunLocationPageBuilder).not.toHaveBeenCalled();

    expect(mockFactoryJobStore.create).toHaveBeenCalledWith(
      expect.objectContaining({
        contractVersion: "1.0",
        clientId: 4,
        jobType: "content.location-page-builder",
        priority: "normal",
        input: {
          targetCitiesOrServiceAreas: "Austin, Dallas",
          businessName: "Camphouse Country Landscaping",
        },
        execution: { dryRun: false, approvalRequired: false },
      })
    );
    expect(mockJobRunnerEnqueue).toHaveBeenCalledWith("factory-run", { factoryJobId: 42 });
  });

  it("returns 400 when the mapped inputs are missing the required target cities field", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/workflows/1/run")
      .send({ inputValues: ["", "", "", ""], clientId: 4 });

    expect(res.status).toBe(400);
    expect(mockRunLocationPageBuilder).not.toHaveBeenCalled();
  });
});
