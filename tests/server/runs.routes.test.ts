import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { buildAuthApp } from "./_helpers/buildAuthApp";

// --- mocks ------------------------------------------------------------------

const mockRunStore = {
  listByClient: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  updateStatus: vi.fn(),
  incrementCompleted: vi.fn(),
  incrementFailed: vi.fn(),
};
const mockResponseStore = {
  listByRun: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  updateResult: vi.fn(),
  listFailedByRun: vi.fn(),
};
const mockScheduleStore = {
  listByClient: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};
const mockPromptStore = { listByCollection: vi.fn() };
const mockJobRunner = { register: vi.fn(), enqueue: vi.fn() };

vi.mock("../../server/storage", () => ({
  storage: { countUsers: vi.fn() },
  platformStore: { seedDefaults: vi.fn().mockResolvedValue(undefined), list: vi.fn() },
  promptCollectionStore: { get: vi.fn() },
  promptStore: mockPromptStore,
  runStore: mockRunStore,
  responseStore: mockResponseStore,
  scheduleStore: mockScheduleStore,
  clientStore: {},
  brandStore: {},
  aliasStore: {},
  competitorStore: {},
  clientUserStore: {},
}));

vi.mock("../../server/jobs/runner", () => ({
  jobRunner: mockJobRunner,
}));

const { registerRunRoutes } = await import("../../server/routes/runs");

// ---------------------------------------------------------------------------

function buildApp(role?: "super_admin" | "agency_admin" | "analyst" | "account_manager" | "client_viewer") {
  return buildAuthApp(
    (app) => registerRunRoutes(app),
    role ? { role } : {}
  );
}

const SAMPLE_RUN = {
  id: 1,
  clientId: 10,
  collectionId: 5,
  batchId: "batch-001",
  status: "queued" as const,
  triggeredBy: "manual" as const,
  triggeredByUserId: 1,
  totalPrompts: 3,
  completedPrompts: 0,
  failedPrompts: 0,
  startedAt: null,
  finishedAt: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const SAMPLE_RESPONSE = {
  id: 100,
  runId: 1,
  promptId: 50,
  platformId: 1,
  queryText: "Best SEO agency in Seattle",
  locale: null,
  geo: null,
  status: "queued" as const,
  responseText: null,
  responseSummaryBlock: null,
  modelVariant: null,
  latencyMs: null,
  rawPayload: null,
  errorMessage: null,
  capturedAt: Date.now(),
};

// ---------------------------------------------------------------------------
describe("POST /api/clients/:id/runs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp())
      .post("/api/clients/10/runs")
      .send({ collectionId: 5, platformIds: [1] });
    expect(res.status).toBe(401);
  });

  it("returns 403 for client_viewer", async () => {
    const res = await request(buildApp("client_viewer"))
      .post("/api/clients/10/runs")
      .send({ collectionId: 5, platformIds: [1] });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid body", async () => {
    const res = await request(buildApp("agency_admin"))
      .post("/api/clients/10/runs")
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 202 with runId on success", async () => {
    mockPromptStore.listByCollection.mockResolvedValue([
      { id: 50, text: "Prompt 1", geo: null },
    ]);
    mockRunStore.create.mockResolvedValue(SAMPLE_RUN);
    mockResponseStore.create.mockResolvedValue(SAMPLE_RESPONSE);
    mockJobRunner.enqueue = vi.fn().mockResolvedValue(undefined);

    const res = await request(buildApp("agency_admin"))
      .post("/api/clients/10/runs")
      .send({ collectionId: 5, platformIds: [1] });
    expect(res.status).toBe(202);
    expect(res.body.data.runId).toBe(1);
  });
});

describe("GET /api/clients/:id/runs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp()).get("/api/clients/10/runs");
    expect(res.status).toBe(401);
  });

  it("returns 200 with run list", async () => {
    mockRunStore.listByClient.mockResolvedValue([SAMPLE_RUN]);
    const res = await request(buildApp("analyst")).get("/api/clients/10/runs");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe("GET /api/runs/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 when run not found", async () => {
    mockRunStore.get.mockResolvedValue(undefined);
    const res = await request(buildApp("analyst")).get("/api/runs/999");
    expect(res.status).toBe(404);
  });

  it("returns 200 with run and responses", async () => {
    mockRunStore.get.mockResolvedValue(SAMPLE_RUN);
    mockResponseStore.listByRun.mockResolvedValue([SAMPLE_RESPONSE]);
    const res = await request(buildApp("analyst")).get("/api/runs/1");
    expect(res.status).toBe(200);
    expect(res.body.data.run.id).toBe(1);
    expect(res.body.data.responses).toHaveLength(1);
  });
});

describe("GET /api/runs/:id/responses/:responseId", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 when response not found", async () => {
    mockResponseStore.get.mockResolvedValue(undefined);
    const res = await request(buildApp("analyst")).get("/api/runs/1/responses/999");
    expect(res.status).toBe(404);
  });

  it("returns 200 with raw response", async () => {
    mockResponseStore.get.mockResolvedValue(SAMPLE_RESPONSE);
    const res = await request(buildApp("analyst")).get("/api/runs/1/responses/100");
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(100);
  });
});

describe("POST /api/runs/:id/retry-failed", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 202 with count of retried responses", async () => {
    mockRunStore.get.mockResolvedValue(SAMPLE_RUN);
    mockResponseStore.listFailedByRun.mockResolvedValue([SAMPLE_RESPONSE]);
    mockResponseStore.updateResult.mockResolvedValue(undefined);
    mockJobRunner.enqueue = vi.fn().mockResolvedValue(undefined);

    const res = await request(buildApp("agency_admin"))
      .post("/api/runs/1/retry-failed");
    expect(res.status).toBe(202);
    expect(res.body.data.retriedCount).toBe(1);
  });
});

describe("GET /api/clients/:id/schedules", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp()).get("/api/clients/10/schedules");
    expect(res.status).toBe(401);
  });

  it("returns 200 with schedule list", async () => {
    mockScheduleStore.listByClient.mockResolvedValue([]);
    const res = await request(buildApp("agency_admin")).get("/api/clients/10/schedules");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe("POST /api/clients/:id/schedules", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for analyst", async () => {
    const res = await request(buildApp("analyst"))
      .post("/api/clients/10/schedules")
      .send({ collectionId: 5, platformIds: [1], cadence: "weekly", dayOfWeek: 1 });
    expect(res.status).toBe(403);
  });

  it("returns 201 on success", async () => {
    const schedule = {
      id: 1, clientId: 10, collectionId: 5, platformIds: [1],
      cadence: "weekly", dayOfWeek: 1, dayOfMonth: null, hourUtc: 8,
      lastFiredAt: null, nextFireAt: Date.now() + 86400000,
      enabled: true, createdAt: Date.now(), updatedAt: Date.now(),
    };
    mockScheduleStore.create.mockResolvedValue(schedule);
    const res = await request(buildApp("agency_admin"))
      .post("/api/clients/10/schedules")
      .send({ collectionId: 5, platformIds: [1], cadence: "weekly", dayOfWeek: 1 });
    expect(res.status).toBe(201);
  });
});

describe("DELETE /api/schedules/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 when schedule not found", async () => {
    mockScheduleStore.delete.mockResolvedValue(false);
    const res = await request(buildApp("agency_admin")).delete("/api/schedules/999");
    expect(res.status).toBe(404);
  });

  it("returns 204 on success", async () => {
    mockScheduleStore.delete.mockResolvedValue(true);
    const res = await request(buildApp("agency_admin")).delete("/api/schedules/1");
    expect(res.status).toBe(204);
  });
});
