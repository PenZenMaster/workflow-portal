import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { buildAuthApp } from "./_helpers/buildAuthApp";

// --- mocks ------------------------------------------------------------------

const mockCitationStore = { listByClient: vi.fn() };
const mockMentionStore = { listByClient: vi.fn() };
const mockSentimentStore = { listByClient: vi.fn() };
const mockShareTokenStore = { create: vi.fn(), get: vi.fn(), findByHash: vi.fn(), revoke: vi.fn() };
const mockExportStore = { get: vi.fn() };

vi.mock("../../server/storage", () => ({
  storage: { countUsers: vi.fn() },
  platformStore: { seedDefaults: vi.fn().mockResolvedValue(undefined) },
  citationStore: mockCitationStore,
  mentionStore: mockMentionStore,
  sentimentStore: mockSentimentStore,
  shareTokenStore: mockShareTokenStore,
  exportStore: mockExportStore,
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

vi.mock("../../server/jobs/runner", () => ({
  jobRunner: { enqueue: vi.fn(), register: vi.fn() },
}));

const { registerSourceRoutes } = await import("../../server/routes/sources");

// ---------------------------------------------------------------------------

function buildApp(role?: "super_admin" | "agency_admin" | "analyst" | "account_manager" | "client_viewer") {
  return buildAuthApp(
    (app) => registerSourceRoutes(app),
    role ? { role } : {}
  );
}

const SAMPLE_CITATION = {
  id: 1, responseId: 1, url: "https://acme.com/page", rootDomain: "acme.com",
  ownedByBrandId: 1, position: 1, isTrustedThirdParty: false,
};

const SAMPLE_TOKEN = {
  id: 1, kind: "export", resourceId: 5, tokenHash: "abc123",
  expiresAt: Date.now() + 86_400_000, createdByUserId: 1,
  revokedAt: null, createdAt: Date.now(),
};

// ---------------------------------------------------------------------------
describe("GET /api/clients/:id/sources", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp()).get("/api/clients/1/sources");
    expect(res.status).toBe(401);
  });

  it("returns 200 with source analysis", async () => {
    mockCitationStore.listByClient.mockResolvedValue([SAMPLE_CITATION]);
    const res = await request(buildApp("analyst")).get("/api/clients/1/sources");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("domainCounts");
    expect(res.body.data).toHaveProperty("ownedPercent");
  });
});

describe("GET /api/clients/:id/recommendations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp()).get("/api/clients/1/recommendations");
    expect(res.status).toBe(401);
  });

  it("returns 200 with recommendations array", async () => {
    mockMentionStore.listByClient.mockResolvedValue([]);
    mockCitationStore.listByClient.mockResolvedValue([]);
    mockSentimentStore.listByClient.mockResolvedValue([]);
    const res = await request(buildApp("analyst")).get("/api/clients/1/recommendations");
    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
  });
});

describe("POST /api/clients/:id/share-links", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for analyst", async () => {
    const res = await request(buildApp("analyst"))
      .post("/api/clients/1/share-links")
      .send({ kind: "export", resourceId: 5, ttlDays: 30 });
    expect(res.status).toBe(403);
  });

  it("returns 201 with token", async () => {
    mockShareTokenStore.create.mockResolvedValue(SAMPLE_TOKEN);
    const res = await request(buildApp("agency_admin"))
      .post("/api/clients/1/share-links")
      .send({ kind: "export", resourceId: 5, ttlDays: 30 });
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty("shareToken");
  });
});

describe("DELETE /api/share-links/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 when not found", async () => {
    mockShareTokenStore.revoke.mockResolvedValue(false);
    const res = await request(buildApp("agency_admin")).delete("/api/share-links/999");
    expect(res.status).toBe(404);
  });

  it("returns 204 on success", async () => {
    mockShareTokenStore.revoke.mockResolvedValue(true);
    const res = await request(buildApp("agency_admin")).delete("/api/share-links/1");
    expect(res.status).toBe(204);
  });
});

describe("GET /api/share/:token/data", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 for unknown token", async () => {
    mockShareTokenStore.findByHash.mockResolvedValue(undefined);
    const res = await request(buildApp()).get("/api/share/invalid-token/data");
    expect(res.status).toBe(404);
  });

  it("returns 410 for revoked token", async () => {
    mockShareTokenStore.findByHash.mockResolvedValue({
      ...SAMPLE_TOKEN, revokedAt: Date.now() - 1000,
    });
    const res = await request(buildApp()).get("/api/share/sometoken/data");
    expect(res.status).toBe(410);
  });

  it("returns 410 for expired token", async () => {
    mockShareTokenStore.findByHash.mockResolvedValue({
      ...SAMPLE_TOKEN, expiresAt: Date.now() - 1000,
    });
    const res = await request(buildApp()).get("/api/share/sometoken/data");
    expect(res.status).toBe(410);
  });

  it("returns 200 with public payload for valid token", async () => {
    mockShareTokenStore.findByHash.mockResolvedValue(SAMPLE_TOKEN);
    mockExportStore.get.mockResolvedValue({
      id: 5, clientId: 1, kind: "csv-executive", periodStart: "2026-05-01",
      periodEnd: "2026-05-31", status: "ready", filePath: null, lastError: null,
      requestedByUserId: null, createdAt: Date.now(), updatedAt: Date.now(),
    });
    const res = await request(buildApp()).get("/api/share/sometoken/data");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("kind");
    expect(res.body.data).not.toHaveProperty("filePath");
    expect(res.body.data).not.toHaveProperty("requestedByUserId");
  });
});
