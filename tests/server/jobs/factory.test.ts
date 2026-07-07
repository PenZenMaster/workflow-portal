import { describe, it, expect, vi, beforeEach } from "vitest";
import type { JobRunner } from "../../../server/jobs/runner";
import type { FactoryJobRecord } from "../../../shared/schema";

const { mockFactoryJobStore } = vi.hoisted(() => ({
  mockFactoryJobStore: {
    get: vi.fn(),
    updateStatus: vi.fn(),
    setOutput: vi.fn(),
  },
}));

vi.mock("../../../server/storage", () => ({
  factoryJobStore: mockFactoryJobStore,
}));

const { registerFactoryJobHandlers } = await import("../../../server/jobs/factory");

type Handler = (payload: unknown, jobId: number) => Promise<void>;

function buildRunner(): { runner: JobRunner; handlers: Map<string, Handler> } {
  const handlers = new Map<string, Handler>();
  const runner = {
    register: (handler: { kind: string; handle: Handler }) => {
      handlers.set(handler.kind, handler.handle);
      return runner;
    },
    enqueue: vi.fn(),
  };
  return { runner: runner as unknown as JobRunner, handlers };
}

function sampleJob(overrides: Partial<FactoryJobRecord> = {}): FactoryJobRecord {
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

describe("factory-run dispatcher", () => {
  beforeEach(() => vi.clearAllMocks());

  it("registers the factory-run kind", () => {
    const { runner, handlers } = buildRunner();
    registerFactoryJobHandlers(runner, []);
    expect(handlers.has("factory-run")).toBe(true);
  });

  it("returns quietly when the factory job row is missing", async () => {
    mockFactoryJobStore.get.mockResolvedValue(undefined);
    const { runner, handlers } = buildRunner();
    registerFactoryJobHandlers(runner, []);

    await handlers.get("factory-run")!({ factoryJobId: 99 }, 1);

    expect(mockFactoryJobStore.updateStatus).not.toHaveBeenCalled();
  });

  it("fails the job cleanly when no cell handles its jobType", async () => {
    mockFactoryJobStore.get.mockResolvedValue(sampleJob({ jobType: "content.page-batch" }));
    const { runner, handlers } = buildRunner();
    registerFactoryJobHandlers(runner, []);

    await handlers.get("factory-run")!({ factoryJobId: 1 }, 1);

    expect(mockFactoryJobStore.updateStatus).toHaveBeenCalledWith(
      1,
      "failed",
      expect.stringContaining("content.page-batch")
    );
  });

  it("skips jobs that are held or terminal", async () => {
    const cell = { jobType: "reporting.monthly-pipeline", run: vi.fn() };
    const { runner, handlers } = buildRunner();
    registerFactoryJobHandlers(runner, [cell]);

    for (const status of ["awaiting_approval", "done", "cancelled"] as const) {
      mockFactoryJobStore.get.mockResolvedValue(sampleJob({ status }));
      await handlers.get("factory-run")!({ factoryJobId: 1 }, 1);
    }

    expect(cell.run).not.toHaveBeenCalled();
    expect(mockFactoryJobStore.updateStatus).not.toHaveBeenCalled();
  });

  it("runs the matching cell and stores output then marks done", async () => {
    const job = sampleJob();
    mockFactoryJobStore.get.mockResolvedValue(job);
    const cell = {
      jobType: "reporting.monthly-pipeline",
      run: vi.fn().mockResolvedValue({ sessions: 42 }),
    };
    const { runner, handlers } = buildRunner();
    registerFactoryJobHandlers(runner, [cell]);

    await handlers.get("factory-run")!({ factoryJobId: 1 }, 1);

    expect(mockFactoryJobStore.updateStatus).toHaveBeenNthCalledWith(1, 1, "running");
    expect(cell.run).toHaveBeenCalledWith(job);
    expect(mockFactoryJobStore.setOutput).toHaveBeenCalledWith(1, { sessions: 42 });
    expect(mockFactoryJobStore.updateStatus).toHaveBeenNthCalledWith(2, 1, "done");
  });

  it("marks the job failed and rethrows when the cell throws, so the runner retries", async () => {
    mockFactoryJobStore.get.mockResolvedValue(sampleJob());
    const cell = {
      jobType: "reporting.monthly-pipeline",
      run: vi.fn().mockRejectedValue(new Error("GA4 API error (500)")),
    };
    const { runner, handlers } = buildRunner();
    registerFactoryJobHandlers(runner, [cell]);

    await expect(
      handlers.get("factory-run")!({ factoryJobId: 1 }, 1)
    ).rejects.toThrow("GA4 API error (500)");

    expect(mockFactoryJobStore.updateStatus).toHaveBeenCalledWith(
      1,
      "failed",
      "GA4 API error (500)"
    );
    expect(mockFactoryJobStore.setOutput).not.toHaveBeenCalled();
  });

  it("re-runs a previously failed job (runner retry path)", async () => {
    mockFactoryJobStore.get.mockResolvedValue(sampleJob({ status: "failed" }));
    const cell = {
      jobType: "reporting.monthly-pipeline",
      run: vi.fn().mockResolvedValue({ sessions: 7 }),
    };
    const { runner, handlers } = buildRunner();
    registerFactoryJobHandlers(runner, [cell]);

    await handlers.get("factory-run")!({ factoryJobId: 1 }, 1);

    expect(cell.run).toHaveBeenCalled();
    expect(mockFactoryJobStore.updateStatus).toHaveBeenNthCalledWith(2, 1, "done");
  });
});
