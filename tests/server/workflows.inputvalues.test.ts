/*
 * Module/Script Name: workflows.inputvalues.test.ts
 * Path: tests/server/workflows.inputvalues.test.ts
 *
 * Description:
 * Route tests for GET/PUT /api/workflows/:id/input-values (B-23) - the
 * per-workflow launch-input persistence endpoints.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-03
 * Last Modified Date: 2026-07-03
 * Comments:
 * - v1.00 Initial tests (launch-input persistence feature)
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
const mockInputValueStore = {
  getByWorkflow: vi.fn(),
  upsertMany: vi.fn(),
};
vi.mock("../../server/storage", () => ({
  storage: mockStorage,
  workflowInputValueStore: mockInputValueStore,
}));

const mockGetAdapter = vi.fn();
vi.mock("../../server/adapters/registry", () => ({
  getAdapter: (slug: string) => mockGetAdapter(slug),
  getConfiguredSlugs: () => [],
}));

const { registerWorkflowRoutes } = await import("../../server/routes/workflows");

const WORKFLOW = {
  id: 1,
  name: "Ranking Audit",
  category: "Audit",
  description: "Audit",
  inputs: ["Service Area"],
  optionalInputs: [],
  tags: [],
  prompt: "",
  launchUrl: "",
  launchLabel: "",
  pinned: false,
  acceptsFileUpload: true,
  aiAdapterSlug: null,
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
    res.status(500).json({ error: "Internal server error" });
  });
  return app;
}

describe("GET /api/workflows/:id/input-values", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.getWorkflow.mockResolvedValue(WORKFLOW);
    mockInputValueStore.getByWorkflow.mockResolvedValue({});
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await request(buildApp(false)).get("/api/workflows/1/input-values");
    expect(res.status).toBe(401);
  });

  it("returns 404 when the workflow does not exist", async () => {
    mockStorage.getWorkflow.mockResolvedValue(undefined);
    const res = await request(buildApp()).get("/api/workflows/999/input-values");
    expect(res.status).toBe(404);
  });

  it("returns the saved values in a data envelope", async () => {
    mockInputValueStore.getByWorkflow.mockResolvedValue({
      "Service Area": "Nashville, TN",
    });
    const res = await request(buildApp()).get("/api/workflows/1/input-values");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ "Service Area": "Nashville, TN" });
  });
});

describe("PUT /api/workflows/:id/input-values", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.getWorkflow.mockResolvedValue(WORKFLOW);
    mockInputValueStore.upsertMany.mockResolvedValue(undefined);
  });

  it("returns 400 for a body without a values object", async () => {
    const res = await request(buildApp())
      .put("/api/workflows/1/input-values")
      .send({ nope: true });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the workflow does not exist", async () => {
    mockStorage.getWorkflow.mockResolvedValue(undefined);
    const res = await request(buildApp())
      .put("/api/workflows/999/input-values")
      .send({ values: { "Service Area": "Nashville, TN" } });
    expect(res.status).toBe(404);
  });

  it("saves the values and returns them", async () => {
    const res = await request(buildApp())
      .put("/api/workflows/1/input-values")
      .send({ values: { "Service Area": "Nashville, TN" } });
    expect(res.status).toBe(200);
    expect(mockInputValueStore.upsertMany).toHaveBeenCalledWith(1, {
      "Service Area": "Nashville, TN",
    });
    expect(res.body.data).toEqual({ "Service Area": "Nashville, TN" });
  });
});
