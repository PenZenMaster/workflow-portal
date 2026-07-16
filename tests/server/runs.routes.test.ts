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
  decrementFailed: vi.fn(),
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
const mockJobStore = { listByKindAndResponseIds: vi.fn() };
const mockJobRunner = { register: vi.fn(), enqueue: vi.fn() };
const mockClientStore = { get: vi.fn() };
const mockBrandStore = { listByClient: vi.fn() };

const mockManifestStore = {
  create: vi.fn().mockResolvedValue({ id: 1 }),
  getByRunId: vi.fn(),
  getPreviousManifest: vi.fn(),
};

vi.mock("../../server/storage", () => ({
  storage: { countUsers: vi.fn() },
  platformStore: { seedDefaults: vi.fn().mockResolvedValue(undefined), list: vi.fn() },
  promptCollectionStore: { get: vi.fn().mockResolvedValue({ id: 5, version: "3" }) },
  promptMethodologyStore: { getActive: vi.fn().mockResolvedValue({ version: "1.0" }) },
  promptStore: mockPromptStore,
  runStore: mockRunStore,
  responseStore: mockResponseStore,
  scheduleStore: mockScheduleStore,
  jobStore: mockJobStore,
  clientStore: mockClientStore,
  brandStore: mockBrandStore,
  aliasStore: { listByBrand: vi.fn().mockResolvedValue([]) },
  manifestStore: mockManifestStore,
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

const SAMPLE_CLIENT = {
  id: 10,
  name: "Acme Plumbing",
  primaryDomain: "acme.com",
  geographies: ["Seattle, WA"],
  exclusions: [],
  ownerUserId: null,
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
    mockClientStore.get.mockResolvedValue(SAMPLE_CLIENT);
    mockBrandStore.listByClient.mockResolvedValue([]);
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
    expect(mockResponseStore.create).toHaveBeenCalledWith(
      expect.objectContaining({ queryText: "Prompt 1" })
    );
  });

  it("returns 404 when the client is not found", async () => {
    mockClientStore.get.mockResolvedValue(undefined);

    const res = await request(buildApp("agency_admin"))
      .post("/api/clients/10/runs")
      .send({ collectionId: 5, platformIds: [1] });
    expect(res.status).toBe(404);
  });

  it("writes an immutable run manifest with ad_hoc purpose and a config hash (E2a)", async () => {
    mockClientStore.get.mockResolvedValue(SAMPLE_CLIENT);
    mockBrandStore.listByClient.mockResolvedValue([]);
    mockPromptStore.listByCollection.mockResolvedValue([
      { id: 50, text: "Prompt 1", geo: null },
    ]);
    mockRunStore.create.mockResolvedValue(SAMPLE_RUN);
    mockResponseStore.create.mockResolvedValue(SAMPLE_RESPONSE);

    const res = await request(buildApp("agency_admin"))
      .post("/api/clients/10/runs")
      .send({ collectionId: 5, platformIds: [1] });
    expect(res.status).toBe(202);

    expect(mockManifestStore.create).toHaveBeenCalledTimes(1);
    const manifest = mockManifestStore.create.mock.calls[0][0];
    expect(manifest.runId).toBe(SAMPLE_RUN.id);
    expect(manifest.purpose).toBe("ad_hoc");
    expect(manifest.methodologyVersion).toBe("1.0");
    expect(manifest.panelVersion).toBe("3");
    expect(manifest.configHash).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.expectedResponseCount).toBe(1);
  });
});

describe("GET /api/runs/:id/manifest", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp()).get("/api/runs/1/manifest");
    expect(res.status).toBe(401);
  });

  it("returns 404 when the run has no manifest", async () => {
    mockManifestStore.getByRunId.mockResolvedValue(undefined);
    const res = await request(buildApp("analyst")).get("/api/runs/1/manifest");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("MANIFEST_NOT_FOUND");
  });

  it("returns the manifest for a run", async () => {
    mockManifestStore.getByRunId.mockResolvedValue({
      id: 7, runId: 1, purpose: "ad_hoc", configHash: "aa", platformIds: [1],
    });
    const res = await request(buildApp("analyst")).get("/api/runs/1/manifest");
    expect(res.status).toBe(200);
    expect(res.body.data.runId).toBe(1);
    expect(res.body.data.configHash).toBe("aa");
  });

  it("expands {{competitor}} into one response per configured competitor and reflects it in totalPrompts", async () => {
    mockClientStore.get.mockResolvedValue(SAMPLE_CLIENT);
    mockBrandStore.listByClient.mockResolvedValue([
      { id: 1, clientId: 10, canonicalName: "Acme Plumbing", kind: "client", primaryDomain: null, createdAt: Date.now() },
      { id: 2, clientId: 10, canonicalName: "Globex Plumbing", kind: "competitor", primaryDomain: null, createdAt: Date.now() },
      { id: 3, clientId: 10, canonicalName: "Initech Plumbing", kind: "competitor", primaryDomain: null, createdAt: Date.now() },
    ]);
    mockPromptStore.listByCollection.mockResolvedValue([
      { id: 50, text: "Alternatives to {{competitor}}", geo: null },
    ]);
    mockRunStore.create.mockResolvedValue(SAMPLE_RUN);
    mockResponseStore.create.mockResolvedValue(SAMPLE_RESPONSE);
    mockJobRunner.enqueue = vi.fn().mockResolvedValue(undefined);

    const res = await request(buildApp("agency_admin"))
      .post("/api/clients/10/runs")
      .send({ collectionId: 5, platformIds: [1] });

    expect(res.status).toBe(202);
    expect(res.body.data.totalJobs).toBe(2);
    expect(mockRunStore.create).toHaveBeenCalledWith(
      expect.objectContaining({ totalPrompts: 2 })
    );
    const queryTexts = mockResponseStore.create.mock.calls.map(([arg]) => arg.queryText);
    expect(queryTexts).toEqual(["Alternatives to Globex Plumbing", "Alternatives to Initech Plumbing"]);
  });
});

describe("GET /api/runs/:id/comparability (E2b)", () => {
  const SNAPSHOT = JSON.stringify({
    methodologyVersion: "1.0",
    panelVersion: "3",
    scoringVersion: "1.0",
    parserVersion: "1.0",
    classifierVersion: "rules-1.0",
    platformIds: [1],
    prompts: [{ id: 50, text: "Prompt 1", intentType: null, brandInPrompt: null, geo: null, service: null }],
    brands: [],
  });

  const MANIFEST = {
    id: 7,
    runId: 5,
    clientId: 10,
    collectionId: 5,
    purpose: "ad_hoc",
    methodologyVersion: "1.0",
    panelVersion: "3",
    scoringVersion: "1.0",
    parserVersion: "1.0",
    classifierVersion: "rules-1.0",
    platformIds: [1],
    promptCount: 1,
    replicateCount: 1,
    expectedResponseCount: 1,
    configSnapshot: SNAPSHOT,
    configHash: "aa",
    createdAt: Date.now(),
  };

  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp()).get("/api/runs/5/comparability");
    expect(res.status).toBe(401);
  });

  it("returns 404 MANIFEST_NOT_FOUND when the run has no manifest", async () => {
    mockManifestStore.getByRunId.mockResolvedValue(undefined);
    const res = await request(buildApp("analyst")).get("/api/runs/5/comparability");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("MANIFEST_NOT_FOUND");
  });

  it("returns 404 NO_BASELINE when no earlier run with a manifest exists", async () => {
    mockManifestStore.getByRunId.mockResolvedValue(MANIFEST);
    mockManifestStore.getPreviousManifest.mockResolvedValue(undefined);
    const res = await request(buildApp("analyst")).get("/api/runs/5/comparability");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NO_BASELINE");
  });

  it("compares against the previous run of the same client+collection by default", async () => {
    mockManifestStore.getByRunId.mockResolvedValue(MANIFEST);
    mockManifestStore.getPreviousManifest.mockResolvedValue({
      ...MANIFEST,
      id: 6,
      runId: 3,
      parserVersion: "0.9",
      configSnapshot: SNAPSHOT.replace('"parserVersion":"1.0"', '"parserVersion":"0.9"'),
      configHash: "bb",
    });

    const res = await request(buildApp("analyst")).get("/api/runs/5/comparability");
    expect(res.status).toBe(200);
    expect(mockManifestStore.getPreviousManifest).toHaveBeenCalledWith(10, 5, 5);
    expect(res.body.data.status).toBe("comparable_with_warning");
    expect(res.body.data.baseRunId).toBe(3);
    expect(res.body.data.currentRunId).toBe(5);
    expect(res.body.data.reasons).toContainEqual(
      expect.objectContaining({ code: "parser_changed", severity: "warning" })
    );
  });

  it("uses an explicit baseline run when ?against= is given", async () => {
    mockManifestStore.getByRunId.mockImplementation(async (runId: number) => {
      if (runId === 5) return MANIFEST;
      if (runId === 2) return { ...MANIFEST, id: 4, runId: 2 };
      return undefined;
    });

    const res = await request(buildApp("analyst")).get("/api/runs/5/comparability?against=2");
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("fully_comparable");
    expect(res.body.data.baseRunId).toBe(2);
    expect(mockManifestStore.getPreviousManifest).not.toHaveBeenCalled();
  });

  it("returns 404 BASELINE_MANIFEST_NOT_FOUND when the ?against= run has no manifest", async () => {
    mockManifestStore.getByRunId.mockImplementation(async (runId: number) =>
      runId === 5 ? MANIFEST : undefined
    );
    const res = await request(buildApp("analyst")).get("/api/runs/5/comparability?against=2");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("BASELINE_MANIFEST_NOT_FOUND");
  });

  it("returns 400 for a non-numeric ?against=", async () => {
    mockManifestStore.getByRunId.mockResolvedValue(MANIFEST);
    const res = await request(buildApp("analyst")).get("/api/runs/5/comparability?against=abc");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_AGAINST");
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

  it("decrements failedPrompts and sets the run back to running so the UI resumes polling", async () => {
    mockRunStore.get.mockResolvedValue(SAMPLE_RUN);
    mockResponseStore.listFailedByRun.mockResolvedValue([SAMPLE_RESPONSE]);
    mockResponseStore.updateResult.mockResolvedValue(undefined);
    mockRunStore.decrementFailed.mockResolvedValue(undefined);
    mockRunStore.updateStatus.mockResolvedValue(undefined);
    mockJobRunner.enqueue = vi.fn().mockResolvedValue(undefined);

    await request(buildApp("agency_admin")).post("/api/runs/1/retry-failed");

    expect(mockRunStore.decrementFailed).toHaveBeenCalledWith(SAMPLE_RUN.id);
    expect(mockResponseStore.updateResult).toHaveBeenCalledWith(SAMPLE_RESPONSE.id, { status: "queued" });
    expect(mockRunStore.updateStatus).toHaveBeenCalledWith(SAMPLE_RUN.id, "running");
  });

  it("does not touch run status when there are no failed responses to retry", async () => {
    mockRunStore.get.mockResolvedValue(SAMPLE_RUN);
    mockResponseStore.listFailedByRun.mockResolvedValue([]);

    const res = await request(buildApp("agency_admin")).post("/api/runs/1/retry-failed");

    expect(res.body.data.retriedCount).toBe(0);
    expect(mockRunStore.decrementFailed).not.toHaveBeenCalled();
    expect(mockRunStore.updateStatus).not.toHaveBeenCalled();
  });
});

describe("GET /api/runs/:id/reparse-status", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 when run not found", async () => {
    mockRunStore.get.mockResolvedValue(undefined);
    const res = await request(buildApp("analyst")).get("/api/runs/999/reparse-status?since=0");
    expect(res.status).toBe(404);
  });

  it("returns 400 when since is missing or invalid", async () => {
    mockRunStore.get.mockResolvedValue(SAMPLE_RUN);
    const res = await request(buildApp("analyst")).get("/api/runs/1/reparse-status");
    expect(res.status).toBe(400);
  });

  it("returns status counts for parse-response jobs of this run's responses since the given timestamp", async () => {
    mockRunStore.get.mockResolvedValue(SAMPLE_RUN);
    mockResponseStore.listByRun.mockResolvedValue([
      { ...SAMPLE_RESPONSE, id: 100 },
      { ...SAMPLE_RESPONSE, id: 101 },
    ]);
    mockJobStore.listByKindAndResponseIds.mockResolvedValue([
      { id: 1, status: "done" },
      { id: 2, status: "queued" },
      { id: 3, status: "running" },
    ]);

    const res = await request(buildApp("analyst")).get("/api/runs/1/reparse-status?since=123");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      total: 3,
      queued: 1,
      running: 1,
      done: 1,
      failed: 0,
      cancelled: 0,
    });
    expect(mockJobStore.listByKindAndResponseIds).toHaveBeenCalledWith(
      "parse-response",
      [100, 101],
      123
    );
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

  it("computes nextFireAt from cadence/dayOfWeek/hourUtc when not provided", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T10:00:00.000Z")); // Monday
    mockScheduleStore.create.mockImplementation((_clientId, data) =>
      Promise.resolve({ id: 1, clientId: 10, lastFiredAt: null, createdAt: Date.now(), updatedAt: Date.now(), ...data })
    );

    const res = await request(buildApp("agency_admin"))
      .post("/api/clients/10/schedules")
      .send({ collectionId: 5, platformIds: [1], cadence: "weekly", dayOfWeek: 2, hourUtc: 14 });

    expect(res.status).toBe(201);
    expect(mockScheduleStore.create).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ nextFireAt: new Date("2026-06-16T14:00:00.000Z").getTime() })
    );
    vi.useRealTimers();
  });
});

describe("PATCH /api/schedules/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for analyst", async () => {
    const res = await request(buildApp("analyst"))
      .patch("/api/schedules/1")
      .send({ enabled: false });
    expect(res.status).toBe(403);
  });

  it("returns 404 when schedule not found", async () => {
    mockScheduleStore.update.mockResolvedValue(undefined);
    const res = await request(buildApp("agency_admin"))
      .patch("/api/schedules/999")
      .send({ enabled: false });
    expect(res.status).toBe(404);
  });

  it("updates fields without recomputing nextFireAt when timing is unchanged", async () => {
    mockScheduleStore.update.mockResolvedValue({
      id: 1, clientId: 10, collectionId: 5, platformIds: [1],
      cadence: "weekly", dayOfWeek: 1, dayOfMonth: null, hourUtc: 8,
      lastFiredAt: null, nextFireAt: 123, enabled: false,
      createdAt: Date.now(), updatedAt: Date.now(),
    });

    const res = await request(buildApp("agency_admin"))
      .patch("/api/schedules/1")
      .send({ enabled: false });

    expect(res.status).toBe(200);
    expect(mockScheduleStore.get).not.toHaveBeenCalled();
    expect(mockScheduleStore.update).toHaveBeenCalledWith(1, { enabled: false });
  });

  it("recomputes nextFireAt when cadence/hour/day fields change without an explicit nextFireAt", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T10:00:00.000Z")); // Monday
    mockScheduleStore.get.mockResolvedValue({
      id: 1, clientId: 10, collectionId: 5, platformIds: [1],
      cadence: "weekly", dayOfWeek: 1, dayOfMonth: null, hourUtc: 8,
      lastFiredAt: null, nextFireAt: 123, enabled: true,
      createdAt: Date.now(), updatedAt: Date.now(),
    });
    mockScheduleStore.update.mockImplementation((_id, data) =>
      Promise.resolve({ id: 1, clientId: 10, collectionId: 5, platformIds: [1], dayOfMonth: null, lastFiredAt: null, enabled: true, createdAt: Date.now(), updatedAt: Date.now(), cadence: "weekly", dayOfWeek: 1, hourUtc: 8, ...data })
    );

    const res = await request(buildApp("agency_admin"))
      .patch("/api/schedules/1")
      .send({ hourUtc: 14, dayOfWeek: 2 });

    expect(res.status).toBe(200);
    expect(mockScheduleStore.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        hourUtc: 14,
        dayOfWeek: 2,
        nextFireAt: new Date("2026-06-16T14:00:00.000Z").getTime(),
      })
    );
    vi.useRealTimers();
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
