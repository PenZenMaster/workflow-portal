import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { buildAuthApp } from "./_helpers/buildAuthApp";

// --- mocks ------------------------------------------------------------------

const mockMentionStore = { listByResponse: vi.fn(), listByClient: vi.fn(), countByClient: vi.fn(), bulkCreate: vi.fn(), deleteByResponse: vi.fn(), create: vi.fn() };
const mockCitationStore = { listByResponse: vi.fn(), bulkCreate: vi.fn(), deleteByResponse: vi.fn(), create: vi.fn() };
const mockMetricStore = { upsert: vi.fn(), listByClient: vi.fn(), aggregateForPeriod: vi.fn() };
const mockResponseStore = { get: vi.fn() };
const mockBrandStore = { listByClient: vi.fn() };
const mockAliasStore = { listByBrand: vi.fn() };

vi.mock("../../server/storage", () => ({
  storage: { countUsers: vi.fn() },
  platformStore: { seedDefaults: vi.fn().mockResolvedValue(undefined) },
  mentionStore: mockMentionStore,
  citationStore: mockCitationStore,
  metricStore: mockMetricStore,
  responseStore: mockResponseStore,
  brandStore: mockBrandStore,
  aliasStore: mockAliasStore,
  clientStore: {},
  competitorStore: {},
  clientUserStore: {},
  promptStore: {},
  promptCollectionStore: {},
  runStore: {},
  scheduleStore: {},
}));

vi.mock("../../server/jobs/runner", () => ({
  jobRunner: { enqueue: vi.fn(), register: vi.fn() },
}));

const { registerMetricRoutes } = await import("../../server/routes/metrics");

// ---------------------------------------------------------------------------

function buildApp(role?: "super_admin" | "agency_admin" | "analyst" | "account_manager" | "client_viewer") {
  return buildAuthApp(
    (app) => registerMetricRoutes(app),
    role ? { role } : {}
  );
}

// ---------------------------------------------------------------------------
describe("GET /api/clients/:id/metrics/overview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp()).get("/api/clients/1/metrics/overview");
    expect(res.status).toBe(401);
  });

  it("returns 200 with aggregate metrics", async () => {
    mockMetricStore.aggregateForPeriod.mockResolvedValue({
      totalCitations: 5, totalMentions: 8, totalAllBrandMentions: 20,
      totalClientBrandMentions: 6,
      totalVisibilityScore: 42.5, totalResponses: 10,
    });
    const res = await request(buildApp("analyst")).get("/api/clients/1/metrics/overview?period=30d");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("citationFrequency");
    expect(res.body.data).toHaveProperty("mentionRate");
    expect(res.body.data).toHaveProperty("aiSoV");
    expect(res.body.data).toHaveProperty("avgVisibilityScore");
  });

  it("computes aiSoV from client brand mentions, not response-count mentions, so it cannot exceed 100", async () => {
    mockMetricStore.aggregateForPeriod.mockResolvedValue({
      totalCitations: 5, totalMentions: 8, totalAllBrandMentions: 20,
      totalClientBrandMentions: 6,
      totalVisibilityScore: 42.5, totalResponses: 10,
    });
    const res = await request(buildApp("analyst")).get("/api/clients/1/metrics/overview?period=30d");
    expect(res.status).toBe(200);
    expect(res.body.data.aiSoV).toBe(30);
  });
});

describe("GET /api/clients/:id/metrics/trend", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 with trend data", async () => {
    mockMetricStore.listByClient.mockResolvedValue([
      { dateIso: "2026-05-10", mentionCount: 5, citationCount: 3, allBrandMentions: 15, clientBrandMentions: 3, promptResponseCount: 10, visibilityScoreSum: 20 },
    ]);
    const res = await request(buildApp("analyst")).get("/api/clients/1/metrics/trend?metric=mentionRate&period=30d");
    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
  });

  it("computes aiSoV trend values from clientBrandMentions, not mentionCount", async () => {
    mockMetricStore.listByClient.mockResolvedValue([
      { dateIso: "2026-05-10", mentionCount: 5, citationCount: 3, allBrandMentions: 15, clientBrandMentions: 3, promptResponseCount: 10, visibilityScoreSum: 20 },
    ]);
    const res = await request(buildApp("analyst")).get("/api/clients/1/metrics/trend?metric=aiSoV&period=30d");
    expect(res.status).toBe(200);
    expect(res.body.data[0].value).toBe(20);
  });
});

describe("GET /api/clients/:id/metrics/sov", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 with SoV data", async () => {
    mockMetricStore.aggregateForPeriod.mockResolvedValue({
      totalCitations: 0, totalMentions: 8, totalAllBrandMentions: 20,
      totalClientBrandMentions: 5,
      totalVisibilityScore: 0, totalResponses: 10,
    });
    const res = await request(buildApp("analyst")).get("/api/clients/1/metrics/sov");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("aiSoV");
  });

  it("derives aiSoV and clientMentions from clientBrandMentions, capping the ratio at <=100", async () => {
    mockMetricStore.aggregateForPeriod.mockResolvedValue({
      totalCitations: 0, totalMentions: 8, totalAllBrandMentions: 20,
      totalClientBrandMentions: 5,
      totalVisibilityScore: 0, totalResponses: 10,
    });
    const res = await request(buildApp("analyst")).get("/api/clients/1/metrics/sov");
    expect(res.status).toBe(200);
    expect(res.body.data.aiSoV).toBe(25);
    expect(res.body.data.clientMentions).toBe(5);
    expect(res.body.data.allBrandMentions).toBe(20);
  });
});

describe("GET /api/clients/:id/mentions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp()).get("/api/clients/1/mentions");
    expect(res.status).toBe(401);
  });

  it("returns 200 with mentions and total in the envelope", async () => {
    mockMentionStore.listByClient.mockResolvedValue([]);
    mockMentionStore.countByClient.mockResolvedValue(0);
    const res = await request(buildApp("analyst")).get("/api/clients/1/mentions");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ mentions: [], total: 0 });
  });

  it("forwards limit/offset to the store and returns the full total", async () => {
    mockMentionStore.listByClient.mockResolvedValue([
      { id: 5, matchedText: "B" },
      { id: 4, matchedText: "A" },
    ]);
    mockMentionStore.countByClient.mockResolvedValue(7);
    const res = await request(buildApp("analyst")).get("/api/clients/1/mentions?limit=2&offset=3");
    expect(res.status).toBe(200);
    expect(res.body.data.mentions).toHaveLength(2);
    expect(res.body.data.total).toBe(7);
    expect(mockMentionStore.listByClient).toHaveBeenCalledWith(1, { limit: 2, offset: 3 });
    expect(mockMentionStore.countByClient).toHaveBeenCalledWith(1);
  });

  it("returns 400 for non-integer or negative limit/offset", async () => {
    const bad = ["limit=abc", "limit=-1", "offset=xyz", "offset=-5", "limit=1.5"];
    for (const qs of bad) {
      const res = await request(buildApp("analyst")).get(`/api/clients/1/mentions?${qs}`);
      expect(res.status, qs).toBe(400);
    }
    expect(mockMentionStore.listByClient).not.toHaveBeenCalled();
  });
});

describe("POST /api/responses/:id/parse", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for account_manager", async () => {
    const res = await request(buildApp("account_manager"))
      .post("/api/responses/1/parse");
    expect(res.status).toBe(403);
  });

  it("returns 404 when response not found", async () => {
    mockResponseStore.get.mockResolvedValue(undefined);
    const res = await request(buildApp("analyst")).post("/api/responses/999/parse");
    expect(res.status).toBe(404);
  });

  it("returns 202 and enqueues parse job", async () => {
    mockResponseStore.get.mockResolvedValue({ id: 1, runId: 1, queryText: "test" });
    const res = await request(buildApp("analyst")).post("/api/responses/1/parse");
    expect(res.status).toBe(202);
  });
});

describe("GET /api/clients/:id/scoring-config", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 with default weights", async () => {
    const res = await request(buildApp("super_admin")).get("/api/clients/1/scoring-config");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("mentionPresent");
    expect(res.body.data).toHaveProperty("summaryBlock");
    expect(res.body.data).toHaveProperty("firstRecommended");
  });

  it("returns 403 for non-super_admin", async () => {
    const res = await request(buildApp("agency_admin")).get("/api/clients/1/scoring-config");
    expect(res.status).toBe(403);
  });
});
