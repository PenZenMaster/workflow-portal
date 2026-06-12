import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { buildAuthApp } from "./_helpers/buildAuthApp";

// --- mocks (hoisted before imports that use them) ---------------------------

const mockJobStore = {
  list: vi.fn(),
  countByStatus: vi.fn(),
  listHung: vi.fn(),
  get: vi.fn(),
  requeue: vi.fn(),
  cancel: vi.fn(),
};

const mockJobRunner = {
  getHealth: vi.fn(),
  rescueOrphans: vi.fn(),
};

vi.mock("../../server/storage", () => ({
  jobStore: mockJobStore,
}));

vi.mock("../../server/jobs/runner", () => ({
  jobRunner: mockJobRunner,
}));

const { registerJobRoutes } = await import("../../server/routes/jobs");

// ---------------------------------------------------------------------------

function buildApp(role?: "super_admin" | "agency_admin" | "analyst" | "account_manager" | "client_viewer") {
  return buildAuthApp(
    (app) => registerJobRoutes(app),
    role ? { role } : {}
  );
}

const SAMPLE_COUNTS = { queued: 1, running: 0, done: 5, failed: 1, cancelled: 0 };

const SAMPLE_JOB = {
  id: 1,
  kind: "parse-response",
  payload: "{}",
  status: "queued" as const,
  attempts: 0,
  maxAttempts: 3,
  nextRunAt: Date.now(),
  lockedUntil: null,
  lastError: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

// ---------------------------------------------------------------------------

describe("GET /api/jobs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for non-super_admin", async () => {
    const res = await request(buildApp("agency_admin")).get("/api/jobs");
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp()).get("/api/jobs");
    expect(res.status).toBe(401);
  });

  it("returns jobs and counts for super_admin", async () => {
    mockJobStore.list.mockResolvedValue([SAMPLE_JOB]);
    mockJobStore.countByStatus.mockResolvedValue(SAMPLE_COUNTS);

    const res = await request(buildApp("super_admin")).get("/api/jobs");

    expect(res.status).toBe(200);
    expect(res.body.data.jobs).toHaveLength(1);
    expect(res.body.data.counts).toEqual(SAMPLE_COUNTS);
  });

  it("passes status, kind, and limit filters through to the store", async () => {
    mockJobStore.list.mockResolvedValue([]);
    mockJobStore.countByStatus.mockResolvedValue(SAMPLE_COUNTS);

    await request(buildApp("super_admin")).get(
      "/api/jobs?status=failed&kind=parse-response&limit=10"
    );

    expect(mockJobStore.list).toHaveBeenCalledWith({
      status: "failed",
      kind: "parse-response",
      limit: 10,
    });
  });
});

describe("GET /api/jobs/health", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for non-super_admin", async () => {
    const res = await request(buildApp("agency_admin")).get("/api/jobs/health");
    expect(res.status).toBe(403);
  });

  it("reports isStalled=false when the last tick was recent", async () => {
    mockJobRunner.getHealth.mockReturnValue({
      lastTickAt: Date.now() - 1000,
      intervalMs: 30_000,
      running: true,
    });
    mockJobStore.countByStatus.mockResolvedValue(SAMPLE_COUNTS);
    mockJobStore.listHung.mockResolvedValue([]);

    const res = await request(buildApp("super_admin")).get("/api/jobs/health");

    expect(res.status).toBe(200);
    expect(res.body.data.isStalled).toBe(false);
    expect(res.body.data.hungCount).toBe(0);
  });

  it("reports isStalled=true when the last tick is older than 3 intervals", async () => {
    mockJobRunner.getHealth.mockReturnValue({
      lastTickAt: Date.now() - 200_000,
      intervalMs: 30_000,
      running: true,
    });
    mockJobStore.countByStatus.mockResolvedValue(SAMPLE_COUNTS);
    mockJobStore.listHung.mockResolvedValue([SAMPLE_JOB]);

    const res = await request(buildApp("super_admin")).get("/api/jobs/health");

    expect(res.status).toBe(200);
    expect(res.body.data.isStalled).toBe(true);
    expect(res.body.data.hungCount).toBe(1);
  });
});

describe("POST /api/jobs/:id/requeue", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for non-super_admin", async () => {
    const res = await request(buildApp("agency_admin")).post("/api/jobs/1/requeue");
    expect(res.status).toBe(403);
  });

  it("returns 404 when job not found", async () => {
    mockJobStore.requeue.mockResolvedValue(undefined);
    const res = await request(buildApp("super_admin")).post("/api/jobs/999/requeue");
    expect(res.status).toBe(404);
  });

  it("returns 200 with the requeued job", async () => {
    mockJobStore.requeue.mockResolvedValue({ ...SAMPLE_JOB, status: "queued" });
    const res = await request(buildApp("super_admin")).post("/api/jobs/1/requeue");
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("queued");
  });
});

describe("POST /api/jobs/:id/cancel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for non-super_admin", async () => {
    const res = await request(buildApp("agency_admin")).post("/api/jobs/1/cancel");
    expect(res.status).toBe(403);
  });

  it("returns 404 when job not found", async () => {
    mockJobStore.get.mockResolvedValue(undefined);
    const res = await request(buildApp("super_admin")).post("/api/jobs/999/cancel");
    expect(res.status).toBe(404);
  });

  it("returns 409 when job is already terminal", async () => {
    mockJobStore.get.mockResolvedValue({ ...SAMPLE_JOB, status: "done" });
    const res = await request(buildApp("super_admin")).post("/api/jobs/1/cancel");
    expect(res.status).toBe(409);
  });

  it("returns 200 with the cancelled job", async () => {
    mockJobStore.get.mockResolvedValue({ ...SAMPLE_JOB, status: "queued" });
    mockJobStore.cancel.mockResolvedValue({ ...SAMPLE_JOB, status: "cancelled" });
    const res = await request(buildApp("super_admin")).post("/api/jobs/1/cancel");
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("cancelled");
  });
});

describe("POST /api/jobs/rescue", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for non-super_admin", async () => {
    const res = await request(buildApp("agency_admin")).post("/api/jobs/rescue");
    expect(res.status).toBe(403);
  });

  it("rescues orphans and returns updated counts", async () => {
    mockJobRunner.rescueOrphans.mockReturnValue(3);
    mockJobStore.countByStatus.mockResolvedValue(SAMPLE_COUNTS);

    const res = await request(buildApp("super_admin")).post("/api/jobs/rescue");

    expect(res.status).toBe(200);
    expect(res.body.data.rescued).toBe(3);
    expect(res.body.data.counts).toEqual(SAMPLE_COUNTS);
  });
});
