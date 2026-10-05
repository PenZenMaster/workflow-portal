import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { buildAuthApp } from "./_helpers/buildAuthApp";

const mockClientStore = { list: vi.fn(), get: vi.fn() };
const mockClientUserStore = { canAccess: vi.fn() };
const mockMetricStore = { aggregateLiveForPeriod: vi.fn(), listByClient: vi.fn() };
const mockApiTokenStore = { findByHash: vi.fn(), touchLastUsed: vi.fn() };

vi.mock("../../server/storage", () => ({
  storage: { countUsers: vi.fn() },
  platformStore: { seedDefaults: vi.fn().mockResolvedValue(undefined) },
  exportStore: {},
  clientStore: mockClientStore,
  clientUserStore: mockClientUserStore,
  metricStore: mockMetricStore,
  apiTokenStore: mockApiTokenStore,
}));

vi.mock("../../server/jobs/runner", () => ({
  jobRunner: { enqueue: vi.fn(), register: vi.fn() },
}));

const { registerExportRoutes } = await import("../../server/routes/exports");

type Role = "super_admin" | "agency_admin" | "analyst" | "account_manager" | "client_viewer";

function buildApp(role?: Role) {
  return buildAuthApp((app) => registerExportRoutes(app), role ? { role, userId: 7 } : {});
}

function snap(dateIso: string, over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    clientId: 4,
    dateIso,
    scopeKind: "overall",
    scopeValue: null,
    citationCount: 74,
    mentionCount: 144,
    allBrandMentions: 434,
    clientBrandMentions: 100,
    visibilityScoreSum: 565.44,
    promptResponseCount: 228,
    methodologyVersion: "1.0",
    ...over,
  };
}

const URL_OK = "/api/clients/4/exports/executive.csv?from=2026-07-01&to=2026-09-30";

describe("GET /api/clients/:id/exports/executive.csv", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClientStore.get.mockResolvedValue({ id: 4, name: "Salvo Metal Works" });
    mockClientUserStore.canAccess.mockResolvedValue(true);
    mockMetricStore.listByClient.mockResolvedValue([]);
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp()).get(URL_OK);
    expect(res.status).toBe(401);
  });

  it("returns the executive snapshot CSV, one row per date, ascending, overall scope only", async () => {
    mockMetricStore.listByClient.mockResolvedValue([
      snap("2026-07-14", { mentionCount: 167, citationCount: 82, allBrandMentions: 529, promptResponseCount: 268, visibilityScoreSum: 651.24 }),
      snap("2026-07-07"),
      snap("2026-07-07", { scopeKind: "platform", scopeValue: "perplexity", mentionCount: 1 }),
    ]);

    const res = await request(buildApp("analyst")).get(URL_OK);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toBe(
      'attachment; filename="executive-4-2026-07-01-2026-09-30.csv"'
    );
    const lines = res.text.trim().split("\n");
    expect(lines).toEqual([
      "date,mentionCount,citationCount,allBrandMentions,promptResponseCount,avgVisibilityScore",
      "2026-07-07,144,74,434,228,2.48",
      "2026-07-14,167,82,529,268,2.43",
    ]);
    expect(mockMetricStore.listByClient).toHaveBeenCalledWith(4, "2026-07-01", "2026-09-30");
  });

  it("defaults to the last 30 days when from and to are omitted", async () => {
    const res = await request(buildApp("analyst")).get("/api/clients/4/exports/executive.csv");
    expect(res.status).toBe(200);
    const [, from, to] = mockMetricStore.listByClient.mock.calls[0];
    expect((Date.parse(to) - Date.parse(from)) / 86_400_000).toBe(30);
  });

  it.each([
    ["non-numeric client id", "/api/clients/abc/exports/executive.csv?from=2026-07-01&to=2026-07-31"],
    ["malformed from", "/api/clients/4/exports/executive.csv?from=07/01/2026&to=2026-07-31"],
    ["impossible date", "/api/clients/4/exports/executive.csv?from=2026-02-30&to=2026-03-31"],
    ["from after to", "/api/clients/4/exports/executive.csv?from=2026-08-01&to=2026-07-01"],
    ["range over 366 days", "/api/clients/4/exports/executive.csv?from=2025-01-01&to=2026-07-01"],
    ["only from supplied", "/api/clients/4/exports/executive.csv?from=2026-07-01"],
    ["only to supplied", "/api/clients/4/exports/executive.csv?to=2026-07-01"],
  ])("returns 400 for %s", async (_label, url) => {
    const res = await request(buildApp("analyst")).get(url);
    expect(res.status).toBe(400);
    expect(mockMetricStore.listByClient).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown client when the caller has agency access", async () => {
    mockClientStore.get.mockResolvedValue(undefined);
    const res = await request(buildApp("agency_admin")).get(URL_OK);
    expect(res.status).toBe(404);
  });

  it.each(["super_admin", "agency_admin", "analyst"] as const)(
    "lets %s read any client without a client_users check",
    async (role) => {
      const res = await request(buildApp(role)).get(URL_OK);
      expect(res.status).toBe(200);
      expect(mockClientUserStore.canAccess).not.toHaveBeenCalled();
    }
  );

  it.each(["account_manager", "client_viewer"] as const)(
    "lets %s read a client they are assigned to",
    async (role) => {
      const res = await request(buildApp(role)).get(URL_OK);
      expect(res.status).toBe(200);
      expect(mockClientUserStore.canAccess).toHaveBeenCalledWith(7, 4);
    }
  );

  it.each(["account_manager", "client_viewer"] as const)(
    "returns 403 for %s on a client they are not assigned to, without touching metrics",
    async (role) => {
      mockClientUserStore.canAccess.mockResolvedValue(false);
      const res = await request(buildApp(role)).get(URL_OK);
      expect(res.status).toBe(403);
      expect(mockMetricStore.listByClient).not.toHaveBeenCalled();
    }
  );

  it("returns 403 (not 404) to an unassigned viewer asking about a client that does not exist", async () => {
    mockClientStore.get.mockResolvedValue(undefined);
    mockClientUserStore.canAccess.mockResolvedValue(false);
    const res = await request(buildApp("client_viewer")).get(URL_OK);
    expect(res.status).toBe(403);
  });
});

describe("GET /api/clients/:id/exports/executive.csv - API token access", () => {
  const RAW = "wfp_" + "b".repeat(64);

  beforeEach(() => {
    vi.clearAllMocks();
    mockClientStore.get.mockResolvedValue({ id: 4, name: "Salvo Metal Works" });
    mockMetricStore.listByClient.mockResolvedValue([snap("2026-07-07")]);
    mockApiTokenStore.touchLastUsed.mockResolvedValue(undefined);
    mockApiTokenStore.findByHash.mockResolvedValue({
      id: 11, clientId: 4, name: "Suite", tokenHash: "h", tokenPrefix: "wfp_bbbbbb",
      expiresAt: Date.now() + 86_400_000, createdByUserId: 1, revokedAt: null, lastUsedAt: null, createdAt: 1,
    });
  });

  it("serves the CSV to a bearer token for its own client with no session", async () => {
    const res = await request(buildApp()).get(URL_OK).set("Authorization", `Bearer ${RAW}`);
    expect(res.status).toBe(200);
    expect(res.text.trim().split("\n")[1]).toBe("2026-07-07,144,74,434,228,2.48");
    expect(mockClientUserStore.canAccess).not.toHaveBeenCalled();
  });

  it("refuses a bearer token for a different client", async () => {
    const res = await request(buildApp()).get("/api/clients/5/exports/executive.csv?from=2026-07-01&to=2026-09-30")
      .set("Authorization", `Bearer ${RAW}`);
    expect(res.status).toBe(403);
    expect(mockMetricStore.listByClient).not.toHaveBeenCalled();
  });

  it("refuses an invalid bearer token", async () => {
    mockApiTokenStore.findByHash.mockResolvedValue(undefined);
    const res = await request(buildApp()).get(URL_OK).set("Authorization", `Bearer ${RAW}`);
    expect(res.status).toBe(401);
  });
});
