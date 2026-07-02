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
vi.mock("../../server/storage", () => ({ storage: mockStorage }));

const mockGetAdapter = vi.fn();
vi.mock("../../server/adapters/registry", () => ({
  getAdapter: (slug: string) => mockGetAdapter(slug),
  getConfiguredSlugs: () => [],
}));

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
});
