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
  updateConfig: vi.fn(),
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

const mockListAccountProperties = vi.fn();

vi.mock("../../server/services/ga4", () => ({
  AI_SEARCH_REFERRERS: ["perplexity.ai", "chatgpt.com"],
  filterAiSearchRows: vi.fn((rows: unknown[]) => rows),
  listAccountProperties: mockListAccountProperties,
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

// POST /api/clients/:id/integrations is removed — integrations are now
// created by the OAuth callback after Google consent. The initiation
// endpoint is GET /api/clients/:id/integrations/ga4/auth (redirects to Google).

describe("PATCH /api/integrations/:id/property", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for analyst", async () => {
    const res = await request(buildApp("analyst"))
      .patch("/api/integrations/1/property")
      .send({ propertyId: "G-12345" });
    expect(res.status).toBe(403);
  });

  it("returns 400 for missing propertyId", async () => {
    const res = await request(buildApp("agency_admin"))
      .patch("/api/integrations/1/property")
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 404 when integration not found", async () => {
    mockIntegrationStore.get.mockResolvedValue(undefined);
    const res = await request(buildApp("agency_admin"))
      .patch("/api/integrations/999/property")
      .send({ propertyId: "G-12345" });
    expect(res.status).toBe(404);
  });

  it("returns 200 on success", async () => {
    mockIntegrationStore.get.mockResolvedValue(SAMPLE_INTEGRATION);
    mockIntegrationStore.updateConfig = vi.fn().mockResolvedValue(undefined);
    mockIntegrationStore.updateStatus = vi.fn().mockResolvedValue(undefined);
    const res = await request(buildApp("agency_admin"))
      .patch("/api/integrations/1/property")
      .send({ propertyId: "G-12345678" });
    expect(res.status).toBe(200);
    expect(res.body.data.propertyId).toBe("G-12345678");
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

describe("GET /api/clients/:id/integrations/:integrationId/ga4/properties", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp()).get("/api/clients/1/integrations/1/ga4/properties");
    expect(res.status).toBe(401);
  });

  it("returns 403 for analyst", async () => {
    const res = await request(buildApp("analyst")).get("/api/clients/1/integrations/1/ga4/properties");
    expect(res.status).toBe(403);
  });

  it("returns 404 when integration not found", async () => {
    mockIntegrationStore.get.mockResolvedValue(undefined);
    const res = await request(buildApp("agency_admin")).get("/api/clients/1/integrations/999/ga4/properties");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("INTEGRATION_NOT_FOUND");
  });

  it("returns 400 when integration is not a ga4 integration", async () => {
    mockIntegrationStore.get.mockResolvedValue({ ...SAMPLE_INTEGRATION, kind: "search_console" });
    const res = await request(buildApp("agency_admin")).get("/api/clients/1/integrations/1/ga4/properties");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("NOT_GA4");
  });

  it("returns 200 with the property list on success", async () => {
    mockIntegrationStore.get.mockResolvedValue(SAMPLE_INTEGRATION);
    mockListAccountProperties.mockResolvedValue([
      { propertyId: "111111111", displayName: "Acme - Main Site", accountName: "Acme Inc" },
    ]);
    const res = await request(buildApp("agency_admin")).get("/api/clients/1/integrations/1/ga4/properties");
    expect(res.status).toBe(200);
    expect(res.body.data.properties).toEqual([
      { propertyId: "111111111", displayName: "Acme - Main Site", accountName: "Acme Inc" },
    ]);
  });

  it("returns 200 with an empty list and error message when the Admin API call fails", async () => {
    mockIntegrationStore.get.mockResolvedValue(SAMPLE_INTEGRATION);
    mockListAccountProperties.mockRejectedValue(new Error("GA4 Admin API error (403): forbidden"));
    const res = await request(buildApp("agency_admin")).get("/api/clients/1/integrations/1/ga4/properties");
    expect(res.status).toBe(200);
    expect(res.body.data.properties).toEqual([]);
    expect(res.body.data.error).toMatch(/403/);
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
