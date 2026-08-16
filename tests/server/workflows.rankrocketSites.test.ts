/*
 * Module/Script Name: workflows.rankrocketSites.test.ts
 * Path: tests/server/workflows.rankrocketSites.test.ts
 *
 * Description:
 * Route tests for GET /api/rankrocket-mcp/sites - reads the boot-time
 * RankRocket site-list cache (server/mcp/sitesCache.ts) for the "RankRocket
 * Site Insights" card's site dropdown.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-16
 * Last Modified Date: 2026-08-16
 * Comments:
 * - v1.00 Initial tests
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

const mockGetAdapter = vi.fn();
vi.mock("../../server/adapters/registry", () => ({
  getAdapter: (slug: string) => mockGetAdapter(slug),
  getConfiguredSlugs: () => [],
}));

const mockGetCachedRankRocketSites = vi.fn();
vi.mock("../../server/mcp/sitesCache", () => ({
  getCachedRankRocketSites: () => mockGetCachedRankRocketSites(),
}));

const { registerWorkflowRoutes } = await import("../../server/routes/workflows");

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
  app.use((_err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: "Internal server error" });
  });
  return app;
}

describe("GET /api/rankrocket-mcp/sites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await request(buildApp(false)).get("/api/rankrocket-mcp/sites");
    expect(res.status).toBe(401);
  });

  it("returns the cached site list in a data envelope", async () => {
    mockGetCachedRankRocketSites.mockReturnValue(["tristate-hvac", "trevoraspiranti"]);
    const res = await request(buildApp()).get("/api/rankrocket-mcp/sites");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(["tristate-hvac", "trevoraspiranti"]);
  });

  it("returns an empty array when the cache has not populated", async () => {
    mockGetCachedRankRocketSites.mockReturnValue([]);
    const res = await request(buildApp()).get("/api/rankrocket-mcp/sites");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});
