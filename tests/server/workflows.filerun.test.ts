/*
 * Module/Script Name: workflows.filerun.test.ts
 * Path: tests/server/workflows.filerun.test.ts
 *
 * Description:
 * Route tests for POST /api/workflows/:id/run-with-file - the CSV upload +
 * AI run endpoint. Covers auth, validation, the acceptsFileUpload gate,
 * missing-adapter 503, and the success envelope.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-01
 * Last Modified Date: 2026-07-01
 * Comments:
 * - v1.00 Initial tests (workflow CSV upload feature, v1.20.0)
 * - v1.01 B-21: JSON body variant with inputValues; token-line stripping
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
const mockGrowthPlanRunStore = { getPreviousRun: vi.fn(), create: vi.fn() };
vi.mock("../../server/storage", () => ({
  storage: mockStorage,
  workflowInputValueStore: { getByWorkflow: vi.fn(), upsertMany: vi.fn() },
  clientStore: mockClientStore,
  growthPlanRunStore: mockGrowthPlanRunStore,
}));

const mockGetAdapter = vi.fn();
vi.mock("../../server/adapters/registry", () => ({
  getAdapter: (slug: string) => mockGetAdapter(slug),
  // Route-level tests exercise the same adapter regardless of tier; the
  // tier split itself is covered in workflowFileRun.test.ts.
  getUtilityAdapter: (slug: string) => mockGetAdapter(slug),
  getConfiguredSlugs: () => [],
}));

const mockRunRankingGrowthPlan = vi.fn();
vi.mock("../../server/services/factory/rankingGrowthPlanCell", async () => {
  const actual = await vi.importActual<
    typeof import("../../server/services/factory/rankingGrowthPlanCell")
  >("../../server/services/factory/rankingGrowthPlanCell");
  return {
    ...actual,
    runRankingGrowthPlan: (...args: unknown[]) => mockRunRankingGrowthPlan(...args),
  };
});

const { registerWorkflowRoutes } = await import("../../server/routes/workflows");
const { AppError } = await import("../../server/errors");

const WORKFLOW = {
  id: 1,
  name: "Rank Tracker Analysis",
  category: "Reporting",
  description: "Analyze a rank tracker CSV export",
  inputs: [],
  tags: [],
  prompt: "You are an SEO analyst. Analyze this rank tracker export.",
  launchUrl: "",
  launchLabel: "",
  pinned: false,
  acceptsFileUpload: true,
  createdAt: 1,
  updatedAt: 1,
};

const CSV = "Keyword,Rank\nfoundation repair,3\nbasement waterproofing,7\n";

function buildApp(authenticated = true) {
  const app = express();
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
  app.use(
    (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (err instanceof AppError) {
        return res
          .status(err.statusCode)
          .json({ error: err.message, code: err.code ?? null });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  );
  return app;
}

function postCsv(app: express.Express, id: string, body: string, filename?: string) {
  const url =
    `/api/workflows/${id}/run-with-file` +
    (filename ? `?filename=${encodeURIComponent(filename)}` : "");
  return request(app).post(url).set("Content-Type", "text/csv").send(body);
}

describe("POST /api/workflows/:id/run-with-file", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.getWorkflow.mockResolvedValue(WORKFLOW);
    mockGetAdapter.mockReturnValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    const app = buildApp(false);
    const res = await postCsv(app, "1", CSV);
    expect(res.status).toBe(401);
  });

  it("returns 400 for a non-numeric id", async () => {
    const app = buildApp();
    const res = await postCsv(app, "abc", CSV);
    expect(res.status).toBe(400);
  });

  it("returns 404 when the workflow does not exist", async () => {
    mockStorage.getWorkflow.mockResolvedValue(undefined);
    const app = buildApp();
    const res = await postCsv(app, "999", CSV);
    expect(res.status).toBe(404);
  });

  it("returns 400 FILE_UPLOAD_NOT_ENABLED when the workflow does not accept uploads", async () => {
    mockStorage.getWorkflow.mockResolvedValue({ ...WORKFLOW, acceptsFileUpload: false });
    const app = buildApp();
    const res = await postCsv(app, "1", CSV);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("FILE_UPLOAD_NOT_ENABLED");
  });

  it("returns 400 EMPTY_FILE when the body is empty", async () => {
    const app = buildApp();
    const res = await postCsv(app, "1", "   \n  ");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("EMPTY_FILE");
  });

  it("returns 503 NO_GENERATION_ADAPTER when no LLM adapter is configured", async () => {
    const app = buildApp();
    const res = await postCsv(app, "1", CSV);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("NO_GENERATION_ADAPTER");
  });

  it("returns 200 with the AI response and passes the workflow prompt + CSV to the adapter", async () => {
    const run = vi.fn().mockResolvedValue({
      text: "Local pack rankings are strong; organic mobile lags on 14 keywords.",
      summaryBlock: null,
      citations: [],
      modelVariant: "gpt-test",
      latencyMs: 1234,
      rawPayload: {},
    });
    mockGetAdapter.mockImplementation((slug: string) =>
      slug === "openai" ? { id: "openai", run } : undefined
    );

    const app = buildApp();
    const res = await postCsv(app, "1", CSV, "ranks-jun-2026.csv");

    expect(res.status).toBe(200);
    expect(res.body.data.response).toContain("Local pack rankings are strong");
    expect(res.body.data.modelVariant).toBe("gpt-test");

    const sentPrompt = run.mock.calls[0][0] as string;
    expect(sentPrompt).toContain(WORKFLOW.prompt);
    expect(sentPrompt).toContain("foundation repair,3");
    expect(sentPrompt).toContain("ranks-jun-2026.csv");
  });

  it("accepts a JSON body with inputValues and fills the prompt's <PASTE> tokens", async () => {
    mockStorage.getWorkflow.mockResolvedValue({
      ...WORKFLOW,
      inputs: ["Client Name", "Domain"],
      prompt: "Client Name: <PASTE>\nDomain: <PASTE>\nAnalyze the export.",
    });
    const run = vi.fn().mockResolvedValue({
      text: "ok",
      summaryBlock: null,
      citations: [],
      modelVariant: "gpt-test",
      latencyMs: 1,
      rawPayload: {},
    });
    mockGetAdapter.mockImplementation((slug: string) =>
      slug === "openai" ? { id: "openai", run } : undefined
    );

    const app = buildApp();
    const res = await request(app)
      .post("/api/workflows/1/run-with-file?filename=ranks.csv")
      .set("Content-Type", "application/json")
      .send({ csv: CSV, inputValues: ["Acme Foundation Repair", "acme.com"] });

    expect(res.status).toBe(200);
    const sentPrompt = run.mock.calls[0][0] as string;
    expect(sentPrompt).toContain("Client Name: Acme Foundation Repair");
    expect(sentPrompt).toContain("Domain: acme.com");
    expect(sentPrompt).toContain("foundation repair,3");
    expect(sentPrompt).not.toContain("<PASTE>");
  });

  it("returns 400 EMPTY_FILE for a JSON body with a blank csv field", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/workflows/1/run-with-file")
      .set("Content-Type", "application/json")
      .send({ csv: "  \n ", inputValues: [] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("EMPTY_FILE");
  });

  it("runs on the workflow's configured adapter when aiAdapterSlug is set", async () => {
    mockStorage.getWorkflow.mockResolvedValue({
      ...WORKFLOW,
      aiAdapterSlug: "anthropic",
    });
    const anthropicRun = vi.fn().mockResolvedValue({
      text: "claude response",
      summaryBlock: null,
      citations: [],
      modelVariant: "claude-test",
      latencyMs: 1,
      rawPayload: {},
    });
    mockGetAdapter.mockImplementation((slug: string) => {
      if (slug === "anthropic") return { id: "anthropic", run: anthropicRun };
      if (slug === "openai") return { id: "openai", run: vi.fn() };
      return undefined;
    });

    const app = buildApp();
    const res = await postCsv(app, "1", CSV);

    expect(res.status).toBe(200);
    expect(res.body.data.modelVariant).toBe("claude-test");
    expect(anthropicRun).toHaveBeenCalledTimes(1);
  });

  it("strips unfilled token lines on the legacy text/csv path", async () => {
    mockStorage.getWorkflow.mockResolvedValue({
      ...WORKFLOW,
      prompt: "Client Name: <PASTE>\nAnalyze the export.",
    });
    const run = vi.fn().mockResolvedValue({
      text: "ok",
      summaryBlock: null,
      citations: [],
      modelVariant: "gpt-test",
      latencyMs: 1,
      rawPayload: {},
    });
    mockGetAdapter.mockImplementation((slug: string) =>
      slug === "openai" ? { id: "openai", run } : undefined
    );

    const app = buildApp();
    const res = await postCsv(app, "1", CSV);

    expect(res.status).toBe(200);
    const sentPrompt = run.mock.calls[0][0] as string;
    expect(sentPrompt).not.toContain("<PASTE>");
    expect(sentPrompt).not.toContain("Client Name:");
    expect(sentPrompt).toContain("Analyze the export.");
  });
});

describe("POST /api/workflows/:id/run-with-file — growthPlanEnabled branch", () => {
  const GROWTH_PLAN_WORKFLOW = {
    ...WORKFLOW,
    growthPlanEnabled: true,
    inputs: [],
    optionalInputs: ["target_service_areas", "core_services"],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.getWorkflow.mockResolvedValue(GROWTH_PLAN_WORKFLOW);
  });

  it("returns 400 CLIENT_ID_REQUIRED when no clientId is provided", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/workflows/1/run-with-file")
      .set("Content-Type", "application/json")
      .send({ csv: CSV, inputValues: [] });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("CLIENT_ID_REQUIRED");
    expect(mockRunRankingGrowthPlan).not.toHaveBeenCalled();
  });

  it("calls runRankingGrowthPlan with the CSV, mapped optional inputs, and clientId", async () => {
    mockRunRankingGrowthPlan.mockResolvedValue({
      markdown: "# Keyword Ranking Growth Plan\n...",
      sources: { rankrocketMcp: "ok" },
      skippedUnchanged: false,
    });

    const app = buildApp();
    const res = await request(app)
      .post("/api/workflows/1/run-with-file")
      .set("Content-Type", "application/json")
      .send({
        csv: CSV,
        inputValues: ["Springfield, Shelbyville", "roof repair"],
        clientId: 4,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.response).toBe("# Keyword Ranking Growth Plan\n...");
    expect(mockRunRankingGrowthPlan).toHaveBeenCalledWith(
      4,
      {
        rankingCsv: CSV,
        targetServiceAreas: "Springfield, Shelbyville",
        coreServices: "roof repair",
      },
      { clientStore: mockClientStore, growthPlanRunStore: mockGrowthPlanRunStore }
    );
  });

  it("slices only the optional-input tail even when the workflow also has required inputs", async () => {
    mockStorage.getWorkflow.mockResolvedValue({
      ...GROWTH_PLAN_WORKFLOW,
      inputs: ["Some Required Field"],
    });
    mockRunRankingGrowthPlan.mockResolvedValue({
      markdown: "ok",
      sources: {},
      skippedUnchanged: false,
    });

    const app = buildApp();
    await request(app)
      .post("/api/workflows/1/run-with-file")
      .set("Content-Type", "application/json")
      .send({
        csv: CSV,
        inputValues: ["required value", "Springfield, Shelbyville", "roof repair"],
        clientId: 4,
      });

    expect(mockRunRankingGrowthPlan).toHaveBeenCalledWith(
      4,
      expect.objectContaining({
        targetServiceAreas: "Springfield, Shelbyville",
        coreServices: "roof repair",
      }),
      expect.anything()
    );
  });

  it("returns 400 GROWTH_PLAN_RUN_FAILED with the underlying error message on failure", async () => {
    mockRunRankingGrowthPlan.mockRejectedValue(
      new Error("No RankRocket site key configured for client 4")
    );

    const app = buildApp();
    const res = await request(app)
      .post("/api/workflows/1/run-with-file")
      .set("Content-Type", "application/json")
      .send({ csv: CSV, inputValues: [], clientId: 4 });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("GROWTH_PLAN_RUN_FAILED");
    expect(res.body.error).toContain("No RankRocket site key configured");
  });
});
