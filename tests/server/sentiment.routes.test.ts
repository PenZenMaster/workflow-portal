import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { buildAuthApp } from "./_helpers/buildAuthApp";

// --- mocks ------------------------------------------------------------------

const mockSentimentStore = {
  listByResponse: vi.fn(),
  listByClient: vi.fn(),
  getReviewQueue: vi.fn(),
  override: vi.fn(),
  create: vi.fn(),
  deleteByResponse: vi.fn(),
};
const mockAnnotationStore = {
  listByScope: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
};
const mockExportStore = {
  create: vi.fn(),
  get: vi.fn(),
  listByClient: vi.fn(),
  updateStatus: vi.fn(),
};

vi.mock("../../server/storage", () => ({
  storage: { countUsers: vi.fn() },
  platformStore: { seedDefaults: vi.fn().mockResolvedValue(undefined) },
  sentimentStore: mockSentimentStore,
  annotationStore: mockAnnotationStore,
  exportStore: mockExportStore,
  mentionStore: { listByClient: vi.fn() },
  metricStore: { listByClient: vi.fn(), aggregateForPeriod: vi.fn() },
  responseStore: { get: vi.fn() },
  brandStore: {},
  aliasStore: {},
  clientStore: {},
  competitorStore: {},
  clientUserStore: {},
  promptStore: {},
  promptCollectionStore: {},
  runStore: {},
  scheduleStore: {},
  citationStore: {},
}));

vi.mock("../../server/jobs/runner", () => ({
  jobRunner: { enqueue: vi.fn(), register: vi.fn() },
}));

const { registerSentimentRoutes } = await import("../../server/routes/sentiment");
const { registerExportRoutes } = await import("../../server/routes/exports");

// ---------------------------------------------------------------------------

function buildApp(role?: "super_admin" | "agency_admin" | "analyst" | "account_manager" | "client_viewer") {
  return buildAuthApp(
    (app) => {
      registerSentimentRoutes(app);
      registerExportRoutes(app);
    },
    role ? { role } : {}
  );
}

const SAMPLE_SENTIMENT = {
  id: 1, responseId: 1, brandId: 1, label: "positive", score: 0.8, confidence: 0.9,
  evidenceExcerpt: "best agency", facetLabels: ["trust"], reviewedByUserId: null,
  reviewedAt: null, overrideLabel: null, createdAt: Date.now(),
};

const SAMPLE_EXPORT = {
  id: 1, clientId: 1, kind: "csv-executive", periodStart: "2026-05-01", periodEnd: "2026-05-31",
  status: "queued", filePath: null, lastError: null, requestedByUserId: 1,
  createdAt: Date.now(), updatedAt: Date.now(),
};

// ---------------------------------------------------------------------------
describe("GET /api/clients/:id/sentiment/summary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp()).get("/api/clients/1/sentiment/summary");
    expect(res.status).toBe(401);
  });

  it("returns 200 with sentiment summary", async () => {
    mockSentimentStore.listByClient.mockResolvedValue([
      { ...SAMPLE_SENTIMENT, label: "positive" },
      { ...SAMPLE_SENTIMENT, id: 2, label: "neutral" },
    ]);
    const res = await request(buildApp("analyst")).get("/api/clients/1/sentiment/summary");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("positive");
    expect(res.body.data.positive).toBe(1);
  });
});

describe("GET /api/clients/:id/sentiment/review-queue", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for client_viewer", async () => {
    const res = await request(buildApp("client_viewer")).get("/api/clients/1/sentiment/review-queue");
    expect(res.status).toBe(403);
  });

  it("returns 200 with review queue", async () => {
    mockSentimentStore.getReviewQueue.mockResolvedValue([
      { ...SAMPLE_SENTIMENT, confidence: 0.3 },
    ]);
    const res = await request(buildApp("analyst")).get("/api/clients/1/sentiment/review-queue");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe("PATCH /api/sentiment/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for account_manager", async () => {
    const res = await request(buildApp("account_manager"))
      .patch("/api/sentiment/1")
      .send({ label: "neutral" });
    expect(res.status).toBe(403);
  });

  it("returns 200 with updated override", async () => {
    mockSentimentStore.override.mockResolvedValue({ ...SAMPLE_SENTIMENT, overrideLabel: "neutral" });
    const res = await request(buildApp("analyst"))
      .patch("/api/sentiment/1")
      .send({ label: "neutral" });
    expect(res.status).toBe(200);
    expect(res.body.data.overrideLabel).toBe("neutral");
  });

  it("returns 400 for invalid label", async () => {
    const res = await request(buildApp("analyst"))
      .patch("/api/sentiment/1")
      .send({ label: "very-positive" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/clients/:id/exports", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for client_viewer", async () => {
    const res = await request(buildApp("client_viewer"))
      .post("/api/clients/1/exports")
      .send({ kind: "csv-executive", periodStart: "2026-05-01", periodEnd: "2026-05-31" });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid date format", async () => {
    const res = await request(buildApp("agency_admin"))
      .post("/api/clients/1/exports")
      .send({ kind: "csv-executive", periodStart: "01-05-2026", periodEnd: "2026-05-31" });
    expect(res.status).toBe(400);
  });

  it("returns 202 with exportId", async () => {
    mockExportStore.create.mockResolvedValue(SAMPLE_EXPORT);
    const res = await request(buildApp("agency_admin"))
      .post("/api/clients/1/exports")
      .send({ kind: "csv-executive", periodStart: "2026-05-01", periodEnd: "2026-05-31" });
    expect(res.status).toBe(202);
    expect(res.body.data.exportId).toBe(1);
  });
});

describe("GET /api/clients/:id/exports", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 with export list", async () => {
    mockExportStore.listByClient.mockResolvedValue([SAMPLE_EXPORT]);
    const res = await request(buildApp("agency_admin")).get("/api/clients/1/exports");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe("GET /api/exports/:id/download", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 when export not found", async () => {
    mockExportStore.get.mockResolvedValue(undefined);
    const res = await request(buildApp("agency_admin")).get("/api/exports/999/download");
    expect(res.status).toBe(404);
  });

  it("returns 409 when export is not yet ready", async () => {
    mockExportStore.get.mockResolvedValue({ ...SAMPLE_EXPORT, status: "queued" });
    const res = await request(buildApp("agency_admin")).get("/api/exports/1/download");
    expect(res.status).toBe(409);
  });
});
