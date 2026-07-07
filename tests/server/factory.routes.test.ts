import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { buildAuthApp } from "./_helpers/buildAuthApp";

// --- mocks (hoisted before imports that use them) ---------------------------

const mockFactoryJobStore = {
  create: vi.fn(),
  get: vi.fn(),
  getByJobId: vi.fn(),
  list: vi.fn(),
  approve: vi.fn(),
};

const mockClientStore = {
  get: vi.fn(),
};

const mockJobRunner = {
  enqueue: vi.fn(),
};

vi.mock("../../server/storage", () => ({
  factoryJobStore: mockFactoryJobStore,
  clientStore: mockClientStore,
}));

vi.mock("../../server/jobs/runner", () => ({
  jobRunner: mockJobRunner,
}));

const { registerFactoryRoutes } = await import("../../server/routes/factory");

// ---------------------------------------------------------------------------

type Role = "super_admin" | "agency_admin" | "analyst" | "account_manager" | "client_viewer";

function buildApp(role?: Role) {
  return buildAuthApp((app) => registerFactoryRoutes(app), role ? { role } : {});
}

function validContract(): Record<string, unknown> {
  return {
    contractVersion: "1.0",
    jobId: "job_01JXYZ",
    clientId: 4,
    jobType: "reporting.monthly-pipeline",
    priority: "normal",
    createdAt: "2026-07-07T15:00:00Z",
    input: { periodStart: "2026-06-01", periodEnd: "2026-06-30" },
    execution: { dryRun: false, approvalRequired: false },
  };
}

const SAMPLE_CLIENT = { id: 4, name: "Salvo Metal Works" };

function sampleRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    jobId: "job_01JXYZ",
    clientId: 4,
    contractVersion: "1.0",
    jobType: "reporting.monthly-pipeline",
    priority: "normal",
    input: { periodStart: "2026-06-01", periodEnd: "2026-06-30" },
    dryRun: false,
    approvalRequired: false,
    status: "queued",
    lastError: null,
    output: null,
    approvedBy: null,
    approvedAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------

describe("POST /api/factory/jobs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 unauthenticated and 403 for non-admin roles", async () => {
    const unauth = await request(buildApp()).post("/api/factory/jobs").send(validContract());
    expect(unauth.status).toBe(401);

    const analyst = await request(buildApp("analyst")).post("/api/factory/jobs").send(validContract());
    expect(analyst.status).toBe(403);
  });

  it("returns 400 INVALID_CONTRACT with details for a bad payload", async () => {
    const body = validContract();
    delete body.jobId;

    const res = await request(buildApp("agency_admin")).post("/api/factory/jobs").send(body);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_CONTRACT");
    expect(mockFactoryJobStore.create).not.toHaveBeenCalled();
  });

  it("returns 404 CLIENT_NOT_FOUND for an unknown client", async () => {
    mockClientStore.get.mockResolvedValue(undefined);

    const res = await request(buildApp("agency_admin")).post("/api/factory/jobs").send(validContract());

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("CLIENT_NOT_FOUND");
  });

  it("returns 409 DUPLICATE_JOB_ID when the jobId already exists", async () => {
    mockClientStore.get.mockResolvedValue(SAMPLE_CLIENT);
    mockFactoryJobStore.getByJobId.mockResolvedValue(sampleRecord());

    const res = await request(buildApp("agency_admin")).post("/api/factory/jobs").send(validContract());

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("DUPLICATE_JOB_ID");
    expect(mockFactoryJobStore.create).not.toHaveBeenCalled();
  });

  it("creates the job and enqueues factory-run for a valid contract", async () => {
    mockClientStore.get.mockResolvedValue(SAMPLE_CLIENT);
    mockFactoryJobStore.getByJobId.mockResolvedValue(undefined);
    mockFactoryJobStore.create.mockResolvedValue(sampleRecord());

    const res = await request(buildApp("super_admin")).post("/api/factory/jobs").send(validContract());

    expect(res.status).toBe(201);
    expect(res.body.data.jobId).toBe("job_01JXYZ");
    expect(mockJobRunner.enqueue).toHaveBeenCalledWith("factory-run", { factoryJobId: 1 });
  });

  it("does not enqueue when the contract requires approval", async () => {
    mockClientStore.get.mockResolvedValue(SAMPLE_CLIENT);
    mockFactoryJobStore.getByJobId.mockResolvedValue(undefined);
    mockFactoryJobStore.create.mockResolvedValue(
      sampleRecord({ status: "awaiting_approval", approvalRequired: true })
    );

    const body = {
      ...validContract(),
      execution: { dryRun: false, approvalRequired: true },
    };
    const res = await request(buildApp("agency_admin")).post("/api/factory/jobs").send(body);

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("awaiting_approval");
    expect(mockJobRunner.enqueue).not.toHaveBeenCalled();
  });
});

describe("POST /api/factory/jobs/:id/approve", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 for a non-numeric id", async () => {
    const res = await request(buildApp("agency_admin")).post("/api/factory/jobs/abc/approve");
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown job", async () => {
    mockFactoryJobStore.get.mockResolvedValue(undefined);
    const res = await request(buildApp("agency_admin")).post("/api/factory/jobs/9/approve");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("FACTORY_JOB_NOT_FOUND");
  });

  it("returns 409 when the job is not awaiting approval", async () => {
    mockFactoryJobStore.get.mockResolvedValue(sampleRecord({ status: "queued" }));
    const res = await request(buildApp("agency_admin")).post("/api/factory/jobs/1/approve");
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("NOT_AWAITING_APPROVAL");
    expect(mockFactoryJobStore.approve).not.toHaveBeenCalled();
  });

  it("approves with the session user id and enqueues factory-run", async () => {
    mockFactoryJobStore.get.mockResolvedValue(sampleRecord({ status: "awaiting_approval" }));
    mockFactoryJobStore.approve.mockResolvedValue(
      sampleRecord({ status: "queued", approvedBy: 1, approvedAt: Date.now() })
    );

    const res = await request(buildApp("agency_admin")).post("/api/factory/jobs/1/approve");

    expect(res.status).toBe(200);
    expect(mockFactoryJobStore.approve).toHaveBeenCalledWith(1, 1);
    expect(mockJobRunner.enqueue).toHaveBeenCalledWith("factory-run", { factoryJobId: 1 });
    expect(res.body.data.status).toBe("queued");
  });
});

describe("GET /api/factory/jobs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists jobs and passes clientId/status filters to the store", async () => {
    mockFactoryJobStore.list.mockResolvedValue([sampleRecord()]);

    const res = await request(buildApp("super_admin")).get(
      "/api/factory/jobs?clientId=4&status=queued"
    );

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(mockFactoryJobStore.list).toHaveBeenCalledWith({
      clientId: 4,
      status: "queued",
      limit: undefined,
    });
  });

  it("returns 403 for non-admin roles", async () => {
    const res = await request(buildApp("client_viewer")).get("/api/factory/jobs");
    expect(res.status).toBe(403);
  });
});
