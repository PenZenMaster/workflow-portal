import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { buildAuthApp } from "./_helpers/buildAuthApp";

const mockClientStore = { list: vi.fn() };
const mockMetricStore = { aggregateLiveForPeriod: vi.fn() };

vi.mock("../../server/storage", () => ({
  storage: { countUsers: vi.fn() },
  platformStore: { seedDefaults: vi.fn().mockResolvedValue(undefined) },
  exportStore: {},
  clientStore: mockClientStore,
  metricStore: mockMetricStore,
}));

vi.mock("../../server/jobs/runner", () => ({
  jobRunner: { enqueue: vi.fn(), register: vi.fn() },
}));

const { registerExportRoutes } = await import("../../server/routes/exports");

function buildApp(role?: "analyst" | "client_viewer") {
  return buildAuthApp((app) => registerExportRoutes(app), role ? { role } : {});
}

const aggregate = {
  totalCitations: 5, totalMentions: 8, totalAllBrandMentions: 20,
  totalClientBrandMentions: 6, totalVisibilityScore: 40, totalResponses: 10,
  totalAllCitations: 6, totalClientOwnedCitations: 5,
  totalCompetitorOwnedCitations: 1, totalTrustedResponses: 3,
};
const emptyAggregate = {
  totalCitations: 0, totalMentions: 0, totalAllBrandMentions: 0,
  totalClientBrandMentions: 0, totalVisibilityScore: 0, totalResponses: 0,
  totalAllCitations: 0, totalClientOwnedCitations: 0,
  totalCompetitorOwnedCitations: 0, totalTrustedResponses: 0,
};

describe("GET /api/exports/overview.csv", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp()).get("/api/exports/overview.csv");
    expect(res.status).toBe(401);
  });

  it("returns a CSV with one row per active client using the 30-day aggregate", async () => {
    mockClientStore.list.mockResolvedValue([
      { id: 1, name: "Alpha", primaryDomain: "alpha.com" },
      { id: 2, name: "Beta", primaryDomain: "beta.com" },
    ]);
    mockMetricStore.aggregateLiveForPeriod
      .mockResolvedValueOnce(aggregate)
      .mockResolvedValueOnce(emptyAggregate);

    const res = await request(buildApp("analyst")).get("/api/exports/overview.csv");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toMatch(/attachment; filename="overview-all-clients-\d{4}-\d{2}-\d{2}\.csv"/);

    const lines = res.text.trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("citation_frequency_pct");
    expect(lines[1]).toMatch(/^1,Alpha,alpha\.com,\d{4}-\d{2}-\d{2},\d{4}-\d{2}-\d{2},10,50\.00,80\.00,30\.00,4\.00$/);
    expect(lines[2]).toMatch(/^2,Beta,beta\.com,\d{4}-\d{2}-\d{2},\d{4}-\d{2}-\d{2},0,0\.00,0\.00,0\.00,0\.00$/);

    const [clientId, from, to] = mockMetricStore.aggregateLiveForPeriod.mock.calls[0];
    expect(clientId).toBe(1);
    const spanDays = (Date.parse(to) - Date.parse(from)) / 86_400_000;
    expect(spanDays).toBe(30);
  });
});

describe("GET /api/exports/overview.csv - role limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClientStore.list.mockResolvedValue([]);
  });

  it.each(["super_admin", "agency_admin", "analyst"] as const)("allows %s", async (role) => {
    const res = await request(buildAuthApp((app) => registerExportRoutes(app), { role })).get("/api/exports/overview.csv");
    expect(res.status).toBe(200);
  });

  it.each(["account_manager", "client_viewer"] as const)(
    "returns 403 for %s without reading any client data",
    async (role) => {
      const res = await request(buildAuthApp((app) => registerExportRoutes(app), { role })).get("/api/exports/overview.csv");
      expect(res.status).toBe(403);
      expect(mockClientStore.list).not.toHaveBeenCalled();
      expect(mockMetricStore.aggregateLiveForPeriod).not.toHaveBeenCalled();
    }
  );
});
