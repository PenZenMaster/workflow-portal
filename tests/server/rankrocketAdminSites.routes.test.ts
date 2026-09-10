/*
 * Module/Script Name: rankrocketAdminSites.routes.test.ts
 * Path: tests/server/rankrocketAdminSites.routes.test.ts
 *
 * Description:
 * Route tests for RankRocket Site Insights admin CRUD, Part B: the
 * site-credential admin routes. All four require ADMIN_ROLES (unlike
 * Part C's question-options GET, these expose real WordPress
 * credentials on write and site metadata on read).
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-17
 * Last Modified Date: 2026-08-17
 * Comments:
 * - v1.00 RankRocket Site Insights admin CRUD, Part B
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { buildAuthApp } from "./_helpers/buildAuthApp";
import { AppError } from "../../server/errors";

const mockRankrocketQuestionOptionStore = {
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  seedDefaults: vi.fn(),
};

const mockListSitesDetail = vi.fn();
const mockUpsertSite = vi.fn();
const mockDeleteSite = vi.fn();

vi.mock("../../server/storage", () => ({
  rankrocketQuestionOptionStore: mockRankrocketQuestionOptionStore,
}));
vi.mock("../../server/mcp/sitesAdmin", () => ({
  listSitesDetail: mockListSitesDetail,
  upsertSite: mockUpsertSite,
  deleteSite: mockDeleteSite,
}));

const { registerRankrocketAdminRoutes } = await import("../../server/routes/rankrocketAdmin");

function buildApp(role?: "super_admin" | "agency_admin" | "analyst" | "account_manager" | "client_viewer") {
  return buildAuthApp((app) => registerRankrocketAdminRoutes(app), role ? { role } : {});
}

const SAMPLE_SITE = { key: "tristate-hvac", baseUrl: "https://tristate-hvac.com", authUser: "admin" };

describe("GET /api/rankrocket-mcp/sites/admin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp()).get("/api/rankrocket-mcp/sites/admin");
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin role (unlike the question-options GET)", async () => {
    const res = await request(buildApp("client_viewer")).get("/api/rankrocket-mcp/sites/admin");
    expect(res.status).toBe(403);
  });

  it("returns the site detail list for an admin role", async () => {
    mockListSitesDetail.mockResolvedValue([SAMPLE_SITE]);
    const res = await request(buildApp("agency_admin")).get("/api/rankrocket-mcp/sites/admin");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([SAMPLE_SITE]);
  });

  it("returns 502 when the MCP call fails, without leaking internals", async () => {
    mockListSitesDetail.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:443"));
    const res = await request(buildApp("agency_admin")).get("/api/rankrocket-mcp/sites/admin");
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain("10.0.0.5");
  });
});

describe("POST /api/rankrocket-mcp/sites", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp())
      .post("/api/rankrocket-mcp/sites")
      .send({ key: "new-site", baseUrl: "https://x.com", authUser: "a", appPassword: "p" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for analyst role", async () => {
    const res = await request(buildApp("analyst"))
      .post("/api/rankrocket-mcp/sites")
      .send({ key: "new-site", baseUrl: "https://x.com", authUser: "a", appPassword: "p" });
    expect(res.status).toBe(403);
  });

  it("returns 400 when appPassword is missing", async () => {
    const res = await request(buildApp("agency_admin"))
      .post("/api/rankrocket-mcp/sites")
      .send({ key: "new-site", baseUrl: "https://x.com", authUser: "a" });
    expect(res.status).toBe(400);
    expect(mockUpsertSite).not.toHaveBeenCalled();
  });

  it("calls upsertSite with operation 'add'", async () => {
    mockUpsertSite.mockResolvedValue(undefined);
    const res = await request(buildApp("super_admin"))
      .post("/api/rankrocket-mcp/sites")
      .send({ key: "new-site", baseUrl: "https://new-site.com", authUser: "admin", appPassword: "secret pass" });

    expect(res.status).toBe(201);
    expect(mockUpsertSite).toHaveBeenCalledWith("add", "new-site", {
      baseUrl: "https://new-site.com",
      authUser: "admin",
      appPassword: "secret pass",
    });
  });

  it("never echoes appPassword back in the response body", async () => {
    mockUpsertSite.mockResolvedValue(undefined);
    const res = await request(buildApp("super_admin"))
      .post("/api/rankrocket-mcp/sites")
      .send({ key: "new-site", baseUrl: "https://x.com", authUser: "a", appPassword: "super-secret-value" });

    expect(JSON.stringify(res.body)).not.toContain("super-secret-value");
  });

  it("passes through a 400 AppError from upsertSite (e.g. no matching client) instead of masking it as a generic 502", async () => {
    mockUpsertSite.mockRejectedValue(
      new AppError(400, 'No client found with a primaryDomain matching "https://x.com".', "NO_MATCHING_CLIENT")
    );
    const res = await request(buildApp("super_admin"))
      .post("/api/rankrocket-mcp/sites")
      .send({ key: "new-site", baseUrl: "https://x.com", authUser: "a", appPassword: "p" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("NO_MATCHING_CLIENT");
    expect(res.body.error).toContain("No client found");
  });

  it("still returns a generic 502 for a non-AppError failure (e.g. real MCP connectivity)", async () => {
    mockUpsertSite.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:443"));
    const res = await request(buildApp("super_admin"))
      .post("/api/rankrocket-mcp/sites")
      .send({ key: "new-site", baseUrl: "https://x.com", authUser: "a", appPassword: "p" });

    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain("10.0.0.5");
  });
});

describe("PATCH /api/rankrocket-mcp/sites/:key", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for analyst role", async () => {
    const res = await request(buildApp("analyst"))
      .patch("/api/rankrocket-mcp/sites/tristate-hvac")
      .send({ baseUrl: "https://x.com", authUser: "a", appPassword: "p" });
    expect(res.status).toBe(403);
  });

  it("returns 400 when a required field is missing (no partial-secret patch)", async () => {
    const res = await request(buildApp("agency_admin"))
      .patch("/api/rankrocket-mcp/sites/tristate-hvac")
      .send({ baseUrl: "https://x.com" });
    expect(res.status).toBe(400);
    expect(mockUpsertSite).not.toHaveBeenCalled();
  });

  it("calls upsertSite with operation 'update' and the key from the URL", async () => {
    mockUpsertSite.mockResolvedValue(undefined);
    const res = await request(buildApp("agency_admin"))
      .patch("/api/rankrocket-mcp/sites/tristate-hvac")
      .send({ baseUrl: "https://tristate-hvac.com", authUser: "admin2", appPassword: "new pass" });

    expect(res.status).toBe(200);
    expect(mockUpsertSite).toHaveBeenCalledWith("update", "tristate-hvac", {
      baseUrl: "https://tristate-hvac.com",
      authUser: "admin2",
      appPassword: "new pass",
    });
  });

  it("passes through a 400 AppError from upsertSite instead of masking it as a generic 502", async () => {
    mockUpsertSite.mockRejectedValue(
      new AppError(400, "Multiple clients match this domain.", "AMBIGUOUS_CLIENT_MATCH")
    );
    const res = await request(buildApp("agency_admin"))
      .patch("/api/rankrocket-mcp/sites/tristate-hvac")
      .send({ baseUrl: "https://tristate-hvac.com", authUser: "admin2", appPassword: "new pass" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("AMBIGUOUS_CLIENT_MATCH");
  });
});

describe("DELETE /api/rankrocket-mcp/sites/:key", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for analyst role", async () => {
    const res = await request(buildApp("analyst")).delete("/api/rankrocket-mcp/sites/tristate-hvac");
    expect(res.status).toBe(403);
  });

  it("calls deleteSite with the key from the URL and returns 204", async () => {
    mockDeleteSite.mockResolvedValue(undefined);
    const res = await request(buildApp("super_admin")).delete("/api/rankrocket-mcp/sites/tristate-hvac");

    expect(res.status).toBe(204);
    expect(mockDeleteSite).toHaveBeenCalledWith("tristate-hvac");
  });

  it("returns 502 when the delete call fails", async () => {
    mockDeleteSite.mockRejectedValue(new Error('Unknown site "nope"'));
    const res = await request(buildApp("agency_admin")).delete("/api/rankrocket-mcp/sites/nope");
    expect(res.status).toBe(502);
  });
});
