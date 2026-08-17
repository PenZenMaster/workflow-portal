/*
 * Module/Script Name: rankrocketAdmin.routes.test.ts
 * Path: tests/server/rankrocketAdmin.routes.test.ts
 *
 * Description:
 * Route tests for RankRocket Site Insights admin CRUD, Part C: the
 * question-options list. GET is available to any authenticated role;
 * POST/PATCH/DELETE require ADMIN_ROLES, same pattern as /api/platforms.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-17
 * Last Modified Date: 2026-08-17
 * Comments:
 * - v1.00 RankRocket Site Insights admin CRUD, Part C
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { buildAuthApp } from "./_helpers/buildAuthApp";

const mockRankrocketQuestionOptionStore = {
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  seedDefaults: vi.fn(),
};

vi.mock("../../server/storage", () => ({
  rankrocketQuestionOptionStore: mockRankrocketQuestionOptionStore,
}));

const { registerRankrocketAdminRoutes } = await import("../../server/routes/rankrocketAdmin");

function buildApp(role?: "super_admin" | "agency_admin" | "analyst" | "account_manager" | "client_viewer") {
  return buildAuthApp((app) => registerRankrocketAdminRoutes(app), role ? { role } : {});
}

const SAMPLE_OPTION = { id: 1, label: "Broken links across the site", sortOrder: 1 };

describe("GET /api/rankrocket-question-options", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp()).get("/api/rankrocket-question-options");
    expect(res.status).toBe(401);
  });

  it("returns the option list for any authenticated role", async () => {
    mockRankrocketQuestionOptionStore.list.mockResolvedValue([SAMPLE_OPTION]);
    const res = await request(buildApp("client_viewer")).get("/api/rankrocket-question-options");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([SAMPLE_OPTION]);
  });
});

describe("POST /api/rankrocket-question-options", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp()).post("/api/rankrocket-question-options").send({ label: "New question" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for analyst role", async () => {
    const res = await request(buildApp("analyst"))
      .post("/api/rankrocket-question-options")
      .send({ label: "New question" });
    expect(res.status).toBe(403);
  });

  it("returns 400 for an empty label", async () => {
    const res = await request(buildApp("agency_admin"))
      .post("/api/rankrocket-question-options")
      .send({ label: "" });
    expect(res.status).toBe(400);
  });

  it("creates a new option", async () => {
    mockRankrocketQuestionOptionStore.create.mockResolvedValue({ id: 9, label: "New question", sortOrder: 8 });
    const res = await request(buildApp("super_admin"))
      .post("/api/rankrocket-question-options")
      .send({ label: "New question" });
    expect(res.status).toBe(201);
    expect(res.body.data.label).toBe("New question");
    expect(mockRankrocketQuestionOptionStore.create).toHaveBeenCalledWith({ label: "New question" });
  });
});

describe("PATCH /api/rankrocket-question-options/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp()).patch("/api/rankrocket-question-options/1").send({ label: "x" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for analyst role", async () => {
    const res = await request(buildApp("analyst"))
      .patch("/api/rankrocket-question-options/1")
      .send({ label: "x" });
    expect(res.status).toBe(403);
  });

  it("returns 404 when the option is not found", async () => {
    mockRankrocketQuestionOptionStore.update.mockResolvedValue(undefined);
    const res = await request(buildApp("agency_admin"))
      .patch("/api/rankrocket-question-options/999")
      .send({ label: "x" });
    expect(res.status).toBe(404);
  });

  it("updates an option", async () => {
    mockRankrocketQuestionOptionStore.update.mockResolvedValue({ id: 1, label: "Updated", sortOrder: 0 });
    const res = await request(buildApp("agency_admin"))
      .patch("/api/rankrocket-question-options/1")
      .send({ label: "Updated" });
    expect(res.status).toBe(200);
    expect(res.body.data.label).toBe("Updated");
  });
});

describe("DELETE /api/rankrocket-question-options/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp()).delete("/api/rankrocket-question-options/1");
    expect(res.status).toBe(401);
  });

  it("returns 403 for analyst role", async () => {
    const res = await request(buildApp("analyst")).delete("/api/rankrocket-question-options/1");
    expect(res.status).toBe(403);
  });

  it("returns 404 when the option is not found", async () => {
    mockRankrocketQuestionOptionStore.delete.mockResolvedValue(false);
    const res = await request(buildApp("agency_admin")).delete("/api/rankrocket-question-options/999");
    expect(res.status).toBe(404);
  });

  it("deletes an option", async () => {
    mockRankrocketQuestionOptionStore.delete.mockResolvedValue(true);
    const res = await request(buildApp("super_admin")).delete("/api/rankrocket-question-options/1");
    expect(res.status).toBe(204);
  });
});
