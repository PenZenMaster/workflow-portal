import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { buildAuthApp } from "./_helpers/buildAuthApp";

// --- mocks ------------------------------------------------------------------

const mockMentionStore = { listByResponse: vi.fn(), listByClient: vi.fn(), countByClient: vi.fn(), bulkCreate: vi.fn(), deleteByResponse: vi.fn(), create: vi.fn() };
const mockCitationStore = { listByResponse: vi.fn(), bulkCreate: vi.fn(), deleteByResponse: vi.fn(), create: vi.fn() };
const mockMetricStore = { upsert: vi.fn(), listByClient: vi.fn(), aggregateForPeriod: vi.fn(), aggregateLiveForPeriod: vi.fn(), aggregateLiveForPeriodByPlatform: vi.fn(), aggregateNonBranded: vi.fn() };
const mockResponseStore = { get: vi.fn(), aggregateTokensByClient: vi.fn() };
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
    mockMetricStore.aggregateLiveForPeriod.mockResolvedValue({
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
    mockMetricStore.aggregateLiveForPeriod.mockResolvedValue({
      totalCitations: 5, totalMentions: 8, totalAllBrandMentions: 20,
      totalClientBrandMentions: 6,
      totalVisibilityScore: 42.5, totalResponses: 10,
    });
    const res = await request(buildApp("analyst")).get("/api/clients/1/metrics/overview?period=30d");
    expect(res.status).toBe(200);
    expect(res.body.data.aiSoV).toBe(30);
  });

  it("uses the live aggregate, never snapshot deltas, for overview ratios (TD-24)", async () => {
    mockMetricStore.aggregateLiveForPeriod.mockResolvedValue({
      totalCitations: 0, totalMentions: 0, totalAllBrandMentions: 0,
      totalClientBrandMentions: 0,
      totalVisibilityScore: 0, totalResponses: 0,
    });
    const res = await request(buildApp("analyst")).get("/api/clients/1/metrics/overview?period=30d");
    expect(res.status).toBe(200);
    expect(mockMetricStore.aggregateLiveForPeriod).toHaveBeenCalledWith(1, expect.any(String), expect.any(String));
    expect(mockMetricStore.aggregateForPeriod).not.toHaveBeenCalled();
  });
});

describe("GET /api/clients/:id/metrics/by-platform (Epic 5 slice 1, issue #29)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp()).get("/api/clients/1/metrics/by-platform");
    expect(res.status).toBe(401);
  });

  it("returns 400 for an invalid client id", async () => {
    const res = await request(buildApp("analyst")).get("/api/clients/abc/metrics/by-platform");
    expect(res.status).toBe(400);
  });

  it("returns per-platform metrics with sample size, and honors the period param", async () => {
    mockMetricStore.aggregateLiveForPeriodByPlatform.mockResolvedValue([
      { platformId: 1, slug: "perplexity", displayName: "Perplexity", totalCitations: 4, totalMentions: 8, totalAllBrandMentions: 10, totalClientBrandMentions: 6, totalVisibilityScore: 16, totalResponses: 10 },
      { platformId: 4, slug: "anthropic", displayName: "Claude", totalCitations: 1, totalMentions: 1, totalAllBrandMentions: 2, totalClientBrandMentions: 1, totalVisibilityScore: 1, totalResponses: 2 },
    ]);

    const res = await request(buildApp("analyst")).get("/api/clients/1/metrics/by-platform?period=90d");
    expect(res.status).toBe(200);
    expect(mockMetricStore.aggregateLiveForPeriodByPlatform).toHaveBeenCalledWith(1, expect.any(String), expect.any(String));

    expect(res.body.data.platforms).toHaveLength(2);
    const perplexity = res.body.data.platforms.find((p: { platformId: number }) => p.platformId === 1);
    expect(perplexity.totalResponses).toBe(10);
    expect(perplexity.mentionRate).toBe(80);
    expect(perplexity.citationFrequency).toBe(40);
    expect(perplexity.aiSoV).toBe(60);
    expect(perplexity.avgVisibilityScore).toBeCloseTo(1.6);

    expect(res.body.data.defaultRollup).toBe("platform_balanced");
    expect(res.body.data.period).toBe("90d");
  });

  it("computes responseWeighted as the pooled totals across all platforms", async () => {
    mockMetricStore.aggregateLiveForPeriodByPlatform.mockResolvedValue([
      { platformId: 1, slug: "perplexity", displayName: "Perplexity", totalCitations: 4, totalMentions: 8, totalAllBrandMentions: 10, totalClientBrandMentions: 6, totalVisibilityScore: 16, totalResponses: 10 },
      { platformId: 4, slug: "anthropic", displayName: "Claude", totalCitations: 0, totalMentions: 0, totalAllBrandMentions: 0, totalClientBrandMentions: 0, totalVisibilityScore: 0, totalResponses: 10 },
    ]);

    const res = await request(buildApp("analyst")).get("/api/clients/1/metrics/by-platform");
    expect(res.body.data.combined.responseWeighted.mentionRate).toBe(40);
    expect(res.body.data.combined.responseWeighted.citationFrequency).toBe(20);
    expect(res.body.data.combined.responseWeighted.aiSoV).toBe(60);
    expect(res.body.data.combined.responseWeighted.avgVisibilityScore).toBeCloseTo(0.8);
  });

  it("computes platformBalanced as the unweighted mean of each platform's own rate, diverging from responseWeighted when volumes differ", async () => {
    mockMetricStore.aggregateLiveForPeriodByPlatform.mockResolvedValue([
      { platformId: 1, slug: "perplexity", displayName: "Perplexity", totalCitations: 0, totalMentions: 90, totalAllBrandMentions: 0, totalClientBrandMentions: 0, totalVisibilityScore: 0, totalResponses: 90 },
      { platformId: 4, slug: "anthropic", displayName: "Claude", totalCitations: 0, totalMentions: 0, totalAllBrandMentions: 0, totalClientBrandMentions: 0, totalVisibilityScore: 0, totalResponses: 10 },
    ]);

    const res = await request(buildApp("analyst")).get("/api/clients/1/metrics/by-platform");
    expect(res.body.data.combined.responseWeighted.mentionRate).toBe(90);
    expect(res.body.data.combined.platformBalanced.mentionRate).toBe(50);
  });

  it("returns an empty platforms array and zeroed combined rollups when there are no responses in the period", async () => {
    mockMetricStore.aggregateLiveForPeriodByPlatform.mockResolvedValue([]);

    const res = await request(buildApp("analyst")).get("/api/clients/1/metrics/by-platform");
    expect(res.status).toBe(200);
    expect(res.body.data.platforms).toEqual([]);
    expect(res.body.data.combined.responseWeighted.mentionRate).toBe(0);
    expect(res.body.data.combined.platformBalanced.mentionRate).toBe(0);
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

describe("GET /api/clients/:id/metrics/token-usage", () => {
  beforeEach(() => vi.clearAllMocks());

  const AGG = {
    totalInputTokens: 35,
    totalOutputTokens: 350,
    byPlatform: [
      { platformId: 1, platformSlug: "openai", responses: 2, inputTokens: 30, outputTokens: 300 },
      { platformId: 2, platformSlug: "mistral", responses: 1, inputTokens: 5, outputTokens: 50 },
    ],
  };

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp()).get("/api/clients/1/metrics/token-usage");
    expect(res.status).toBe(401);
  });

  it("returns 403 for client_viewer (spend data is internal)", async () => {
    const res = await request(buildApp("client_viewer")).get("/api/clients/1/metrics/token-usage");
    expect(res.status).toBe(403);
  });

  it("returns the per-platform aggregation for analyst roles", async () => {
    mockResponseStore.aggregateTokensByClient.mockResolvedValue(AGG);
    const res = await request(buildApp("analyst")).get("/api/clients/1/metrics/token-usage?period=90d");
    expect(res.status).toBe(200);
    expect(mockResponseStore.aggregateTokensByClient).toHaveBeenCalledWith(1, expect.any(String), expect.any(String));
    expect(res.body.data.totalInputTokens).toBe(35);
    expect(res.body.data.totalOutputTokens).toBe(350);
    expect(res.body.data.byPlatform).toHaveLength(2);
    expect(res.body.data.period).toBe("90d");
  });
});

describe("GET /api/clients/:id/metrics/non-branded", () => {
  beforeEach(() => vi.clearAllMocks());

  const AGG = {
    nonBrandedResponses: 20,
    mentionedNonBranded: 8,
    recommendedNonBranded: 5,
    clientRecommended: 6,
    allBrandRecommended: 24,
  };

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp()).get("/api/clients/1/metrics/non-branded");
    expect(res.status).toBe(401);
  });

  it("returns 400 for a non-numeric client id", async () => {
    const res = await request(buildApp("analyst")).get("/api/clients/abc/metrics/non-branded");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_ID");
  });

  it("computes non-branded mention rate, recommendation rate, and Recommendation SoV from the aggregate", async () => {
    mockMetricStore.aggregateNonBranded.mockResolvedValue(AGG);
    const res = await request(buildApp("analyst")).get("/api/clients/1/metrics/non-branded?period=30d");
    expect(res.status).toBe(200);
    expect(mockMetricStore.aggregateNonBranded).toHaveBeenCalledWith(1, expect.any(String), expect.any(String));
    expect(res.body.data.mentionRate).toBe(40);          // 8/20
    expect(res.body.data.recommendationRate).toBe(25);   // 5/20
    expect(res.body.data.recommendationSoV).toBe(25);    // 6/24
    expect(res.body.data.nonBrandedResponses).toBe(20);
    expect(res.body.data.unvalidatedResponses).toBeUndefined();
    expect(res.body.data.clientRecommended).toBe(6);
    expect(res.body.data.allBrandRecommended).toBe(24);
  });

  it("returns zeros rather than NaN when there are no non-branded responses", async () => {
    mockMetricStore.aggregateNonBranded.mockResolvedValue({
      nonBrandedResponses: 0, mentionedNonBranded: 0,
      recommendedNonBranded: 0, clientRecommended: 0, allBrandRecommended: 0,
    });
    const res = await request(buildApp("analyst")).get("/api/clients/1/metrics/non-branded");
    expect(res.status).toBe(200);
    expect(res.body.data.mentionRate).toBe(0);
    expect(res.body.data.recommendationRate).toBe(0);
    expect(res.body.data.recommendationSoV).toBe(0);
  });
});

describe("GET /api/clients/:id/metrics/sov", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 with SoV data", async () => {
    mockMetricStore.aggregateLiveForPeriod.mockResolvedValue({
      totalCitations: 0, totalMentions: 8, totalAllBrandMentions: 20,
      totalClientBrandMentions: 5,
      totalVisibilityScore: 0, totalResponses: 10,
    });
    const res = await request(buildApp("analyst")).get("/api/clients/1/metrics/sov");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("aiSoV");
  });

  it("derives aiSoV and clientMentions from clientBrandMentions via the live aggregate (TD-24)", async () => {
    mockMetricStore.aggregateLiveForPeriod.mockResolvedValue({
      totalCitations: 0, totalMentions: 8, totalAllBrandMentions: 20,
      totalClientBrandMentions: 5,
      totalVisibilityScore: 0, totalResponses: 10,
    });
    const res = await request(buildApp("analyst")).get("/api/clients/1/metrics/sov");
    expect(res.status).toBe(200);
    expect(res.body.data.aiSoV).toBe(25);
    expect(res.body.data.clientMentions).toBe(5);
    expect(res.body.data.allBrandMentions).toBe(20);
    expect(mockMetricStore.aggregateForPeriod).not.toHaveBeenCalled();
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
