import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { buildAuthApp } from "./_helpers/buildAuthApp";

// --- mocks ------------------------------------------------------------------

const mockIntegrationStore = {
  listByClient: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
  updateStatus: vi.fn(),
};

vi.mock("../../server/storage", () => ({
  storage: { countUsers: vi.fn() },
  platformStore: { seedDefaults: vi.fn().mockResolvedValue(undefined) },
  integrationStore: mockIntegrationStore,
  citationStore: {},
  mentionStore: {},
  sentimentStore: {},
  shareTokenStore: {},
  exportStore: {},
  clientStore: {},
  brandStore: {},
  aliasStore: {},
  competitorStore: {},
  clientUserStore: {},
  promptStore: {},
  promptCollectionStore: {},
  runStore: {},
  scheduleStore: {},
  responseStore: {},
  annotationStore: {},
  metricStore: {},
}));

vi.mock("../../server/services/ga4", () => ({
  AI_SEARCH_REFERRERS: ["perplexity.ai", "chatgpt.com"],
  filterAiSearchRows: vi.fn((rows: unknown[]) => rows),
  Ga4Service: vi.fn().mockImplementation(() => ({
    getAiTraffic: vi.fn().mockResolvedValue({
      sessions: 142, engagementRate: 0.68,
      pagesPerSession: 3.2, conversionRate: 0.05,
      referrers: [{ sessionSource: "perplexity.ai", sessions: 142 }],
    }),
  })),
}));

vi.mock("../../server/jobs/runner", () => ({
  jobRunner: { enqueue: vi.fn(), register: vi.fn() },
}));

const { registerIntegrationRoutes } = await import("../../server/routes/integrations");

// ---------------------------------------------------------------------------

function buildApp(role?: "super_admin" | "agency_admin" | "analyst" | "account_manager" | "client_viewer") {
  return buildAuthApp(
    (app) => registerIntegrationRoutes(app),
    role ? { role } : {}
  );
}

const SAMPLE_INTEGRATION = {
  id: 1, clientId: 1, kind: "ga4", config: { propertyId: "G-12345678" },
  status: "active", lastSyncedAt: null, lastError: null,
  createdAt: Date.now(), updatedAt: Date.now(),
};

// ---------------------------------------------------------------------------
describe("GET /api/clients/:id/integrations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp()).get("/api/clients/1/integrations");
    expect(res.status).toBe(401);
  });

  it("returns 200 with integration list", async () => {
    mockIntegrationStore.listByClient.mockResolvedValue([SAMPLE_INTEGRATION]);
    const res = await request(buildApp("agency_admin")).get("/api/clients/1/integrations");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe("POST /api/clients/:id/integrations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for analyst", async () => {
    const res = await request(buildApp("analyst"))
      .post("/api/clients/1/integrations")
      .send({ kind: "ga4", config: { propertyId: "G-12345" } });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid kind", async () => {
    const res = await request(buildApp("agency_admin"))
      .post("/api/clients/1/integrations")
      .send({ kind: "unknown", config: {} });
    expect(res.status).toBe(400);
  });

  it("returns 201 with created integration", async () => {
    mockIntegrationStore.create.mockResolvedValue(SAMPLE_INTEGRATION);
    const res = await request(buildApp("agency_admin"))
      .post("/api/clients/1/integrations")
      .send({ kind: "ga4", config: { propertyId: "G-12345678" } });
    expect(res.status).toBe(201);
    expect(res.body.data.kind).toBe("ga4");
  });
});

describe("DELETE /api/clients/:id/integrations/:integrationId", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 when not found", async () => {
    mockIntegrationStore.delete.mockResolvedValue(false);
    const res = await request(buildApp("agency_admin")).delete("/api/clients/1/integrations/999");
    expect(res.status).toBe(404);
  });

  it("returns 204 on success", async () => {
    mockIntegrationStore.delete.mockResolvedValue(true);
    const res = await request(buildApp("agency_admin")).delete("/api/clients/1/integrations/1");
    expect(res.status).toBe(204);
  });
});

describe("POST /api/clients/:id/integrations/:integrationId/test", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 when integration not found", async () => {
    mockIntegrationStore.get.mockResolvedValue(undefined);
    const res = await request(buildApp("agency_admin"))
      .post("/api/clients/1/integrations/999/test");
    expect(res.status).toBe(404);
  });

  it("returns 200 with test result for GA4", async () => {
    mockIntegrationStore.get.mockResolvedValue(SAMPLE_INTEGRATION);
    const res = await request(buildApp("agency_admin"))
      .post("/api/clients/1/integrations/1/test");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("ok");
  });
});

describe("GET /api/clients/:id/traffic", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp()).get("/api/clients/1/traffic");
    expect(res.status).toBe(401);
  });

  it("returns noIntegration: true when no GA4 integration exists", async () => {
    mockIntegrationStore.listByClient.mockResolvedValue([]);
    const res = await request(buildApp("analyst")).get("/api/clients/1/traffic");
    expect(res.status).toBe(200);
    expect(res.body.data.noIntegration).toBe(true);
  });

  it("returns traffic data when GA4 integration exists", async () => {
    mockIntegrationStore.listByClient.mockResolvedValue([SAMPLE_INTEGRATION]);
    const res = await request(buildApp("analyst")).get("/api/clients/1/traffic");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("sessions");
  });
});
