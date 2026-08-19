import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { buildAuthApp } from "./_helpers/buildAuthApp";

const { mockCollectAdminAlerts } = vi.hoisted(() => ({
  mockCollectAdminAlerts: vi.fn(),
}));

vi.mock("../../server/services/adminAlerts", () => ({
  collectAdminAlerts: mockCollectAdminAlerts,
}));

const { registerAdminAlertRoutes } = await import("../../server/routes/adminAlerts");

function buildApp(role?: "super_admin" | "agency_admin" | "analyst" | "account_manager" | "client_viewer") {
  return buildAuthApp((app) => registerAdminAlertRoutes(app), role ? { role } : {});
}

const SAMPLE_ALERT = {
  id: "integration-1",
  kind: "integration_failing" as const,
  clientId: 4,
  clientName: "Salvo Metal Works",
  message: "ga4 integration failing: token expired",
  detailHref: "/ai/clients/4/settings/integrations",
  occurredAt: 2000,
};

describe("GET /api/admin/alerts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp()).get("/api/admin/alerts");
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super_admin", async () => {
    const res = await request(buildApp("agency_admin")).get("/api/admin/alerts");
    expect(res.status).toBe(403);
  });

  it("returns the aggregated alert list for super_admin", async () => {
    mockCollectAdminAlerts.mockResolvedValue([SAMPLE_ALERT]);

    const res = await request(buildApp("super_admin")).get("/api/admin/alerts");

    expect(res.status).toBe(200);
    expect(res.body.data.alerts).toEqual([SAMPLE_ALERT]);
  });
});
