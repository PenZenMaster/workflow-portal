/*
 * Module/Script Name: recommendations.routes.test.ts
 * Path: tests/server/recommendations.routes.test.ts
 *
 * Description:
 * Route tests for the recommendation-classification domain: per-response
 * listing with brand names, and the analyst human-status override
 * (YLG defensibility slice d).
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-15
 * Last Modified Date: 2026-07-15
 * Comments:
 * - v1.00 slice d initial implementation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { buildAuthApp } from "./_helpers/buildAuthApp";

// --- mocks ------------------------------------------------------------------

const mockRecommendationStore = {
  listByResponse: vi.fn(),
  listByClient: vi.fn(),
  bulkCreate: vi.fn(),
  deleteByResponse: vi.fn(),
  setHumanStatus: vi.fn(),
};
const mockResponseStore = { get: vi.fn() };
const mockRunStore = { get: vi.fn() };
const mockBrandStore = { listByClient: vi.fn() };

vi.mock("../../server/storage", () => ({
  storage: { countUsers: vi.fn() },
  recommendationStore: mockRecommendationStore,
  responseStore: mockResponseStore,
  runStore: mockRunStore,
  brandStore: mockBrandStore,
}));

const { registerRecommendationRoutes } = await import("../../server/routes/recommendations");

// ---------------------------------------------------------------------------

function buildApp(role?: "super_admin" | "agency_admin" | "analyst" | "account_manager" | "client_viewer") {
  return buildAuthApp((app) => registerRecommendationRoutes(app), role ? { role } : {});
}

const REC = {
  id: 5,
  responseId: 11,
  brandId: 10,
  status: "listed_option",
  rank: 2,
  confidence: 0.7,
  evidenceExcerpt: "2. Salvo Metal Works - known for...",
  classifierVersion: "rules-1.0",
  humanStatus: null,
  humanUserId: null,
  humanAt: null,
};

describe("GET /api/responses/:id/recommendations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp()).get("/api/responses/11/recommendations");
    expect(res.status).toBe(401);
  });

  it("returns 400 for a non-numeric response id", async () => {
    const res = await request(buildApp("analyst")).get("/api/responses/abc/recommendations");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_ID");
  });

  it("returns 404 when the response does not exist", async () => {
    mockResponseStore.get.mockResolvedValue(undefined);
    const res = await request(buildApp("analyst")).get("/api/responses/999/recommendations");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("RESPONSE_NOT_FOUND");
  });

  it("returns classifications enriched with brand names", async () => {
    mockResponseStore.get.mockResolvedValue({ id: 11, runId: 1 });
    mockRunStore.get.mockResolvedValue({ id: 1, clientId: 4 });
    mockBrandStore.listByClient.mockResolvedValue([
      { id: 10, clientId: 4, canonicalName: "Salvo Metal Works", kind: "client" },
      { id: 11, clientId: 4, canonicalName: "K&M SHEET METAL", kind: "competitor" },
    ]);
    mockRecommendationStore.listByResponse.mockResolvedValue([REC]);

    const res = await request(buildApp("client_viewer")).get("/api/responses/11/recommendations");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].brandName).toBe("Salvo Metal Works");
    expect(res.body.data[0].status).toBe("listed_option");
    expect(res.body.data[0].humanStatus).toBeNull();
    expect(mockRecommendationStore.listByResponse).toHaveBeenCalledWith(11);
  });
});

describe("PATCH /api/response-recommendations/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp())
      .patch("/api/response-recommendations/5")
      .send({ status: "recommended" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for roles below analyst", async () => {
    const res = await request(buildApp("account_manager"))
      .patch("/api/response-recommendations/5")
      .send({ status: "recommended" });
    expect(res.status).toBe(403);
  });

  it("rejects an invalid status value", async () => {
    const res = await request(buildApp("analyst"))
      .patch("/api/response-recommendations/5")
      .send({ status: "definitely_the_best" });
    expect(res.status).toBe(400);
    expect(mockRecommendationStore.setHumanStatus).not.toHaveBeenCalled();
  });

  it("returns 404 when the recommendation row does not exist", async () => {
    mockRecommendationStore.setHumanStatus.mockResolvedValue(undefined);
    const res = await request(buildApp("analyst"))
      .patch("/api/response-recommendations/999")
      .send({ status: "recommended" });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("RECOMMENDATION_NOT_FOUND");
  });

  it("records the override with the session user and returns the updated row", async () => {
    const updated = { ...REC, humanStatus: "recommended", humanUserId: 1, humanAt: Date.now() };
    mockRecommendationStore.setHumanStatus.mockResolvedValue(updated);

    const res = await request(buildApp("analyst"))
      .patch("/api/response-recommendations/5")
      .send({ status: "recommended" });
    expect(res.status).toBe(200);
    expect(mockRecommendationStore.setHumanStatus).toHaveBeenCalledWith(5, "recommended", 1);
    expect(res.body.data.humanStatus).toBe("recommended");
    expect(res.body.data.status).toBe("listed_option"); // machine result retained
  });
});
