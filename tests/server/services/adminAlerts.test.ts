import { describe, it, expect, vi, beforeEach } from "vitest";

// Admin Alerts (client-experience sequence plan item 4): a single
// super-admin page unioning the actionable failure states already
// tracked across the codebase - integrations, the generic job queue,
// factory jobs, report exports, and prompt runs. v1 deliberately omits
// the measurement-health rollup (assembleRunHealth's per-run DB assembly
// in server/routes/runs.ts would need extracting into a service first -
// scoped as a fast-follow, not part of this slice).

const {
  mockIntegrationListByStatus,
  mockJobList,
  mockFactoryJobList,
  mockExportListByStatus,
  mockRunListByStatus,
  mockClientList,
} = vi.hoisted(() => ({
  mockIntegrationListByStatus: vi.fn(),
  mockJobList: vi.fn(),
  mockFactoryJobList: vi.fn(),
  mockExportListByStatus: vi.fn(),
  mockRunListByStatus: vi.fn(),
  mockClientList: vi.fn(),
}));

vi.mock("../../../server/storage", () => ({
  integrationStore: { listByStatus: mockIntegrationListByStatus },
  jobStore: { list: mockJobList },
  factoryJobStore: { list: mockFactoryJobList },
  exportStore: { listByStatus: mockExportListByStatus },
  runStore: { listByStatus: mockRunListByStatus },
  clientStore: { list: mockClientList },
}));

import { collectAdminAlerts } from "../../../server/services/adminAlerts";

const CLIENTS = [
  { id: 4, name: "Salvo Metal Works" },
  { id: 11, name: "United Structural Systems" },
];

function resetAll() {
  mockIntegrationListByStatus.mockReset().mockResolvedValue([]);
  mockJobList.mockReset().mockResolvedValue([]);
  mockFactoryJobList.mockReset().mockResolvedValue([]);
  mockExportListByStatus.mockReset().mockResolvedValue([]);
  mockRunListByStatus.mockReset().mockResolvedValue([]);
  mockClientList.mockReset().mockResolvedValue(CLIENTS);
}

describe("collectAdminAlerts", () => {
  beforeEach(resetAll);

  it("returns an empty list when nothing is failing", async () => {
    const alerts = await collectAdminAlerts();
    expect(alerts).toEqual([]);
  });

  it("maps a failing integration to an alert with the client's name resolved", async () => {
    mockIntegrationListByStatus.mockResolvedValue([
      {
        id: 1,
        clientId: 4,
        kind: "ga4",
        status: "failing",
        lastError: "token expired",
        lastSyncedAt: null,
        createdAt: 1000,
        updatedAt: 2000,
      },
    ]);

    const alerts = await collectAdminAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      kind: "integration_failing",
      clientId: 4,
      clientName: "Salvo Metal Works",
      detailHref: "/ai/clients/4/settings/integrations",
      occurredAt: 2000,
    });
    expect(alerts[0].message).toContain("ga4");
    expect(alerts[0].message).toContain("token expired");
  });

  it("maps a failed generic job to an alert with no client (jobs aren't client-scoped)", async () => {
    mockJobList.mockResolvedValue([
      {
        id: 7,
        kind: "schedule-tick",
        status: "failed",
        lastError: "boom",
        payload: "{}",
        attempts: 3,
        maxAttempts: 3,
        nextRunAt: 0,
        lockedUntil: null,
        createdAt: 1000,
        updatedAt: 3000,
      },
    ]);

    const alerts = await collectAdminAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      kind: "job_failed",
      clientId: null,
      clientName: null,
      detailHref: "/admin/jobs",
      occurredAt: 3000,
    });
    expect(alerts[0].message).toContain("schedule-tick");
    expect(mockJobList).toHaveBeenCalledWith({ status: "failed", limit: expect.any(Number) });
  });

  it("maps a failed factory job to an alert linked to its client", async () => {
    mockFactoryJobList.mockResolvedValue([
      {
        id: 3,
        jobId: "job_01",
        clientId: 11,
        contractVersion: "1.0",
        jobType: "planning.gbp-snapshot",
        priority: "normal",
        input: {},
        dryRun: false,
        approvalRequired: false,
        status: "failed",
        lastError: "404 from Google",
        output: null,
        approvedBy: null,
        approvedAt: null,
        createdAt: 1000,
        updatedAt: 4000,
      },
    ]);

    const alerts = await collectAdminAlerts();
    expect(alerts[0]).toMatchObject({
      kind: "factory_job_failed",
      clientId: 11,
      clientName: "United Structural Systems",
      detailHref: "/ai/clients/11",
      occurredAt: 4000,
    });
    expect(alerts[0].message).toContain("planning.gbp-snapshot");
    expect(mockFactoryJobList).toHaveBeenCalledWith({ status: "failed", limit: expect.any(Number) });
  });

  it("maps a failed export to an alert linked to its client's reports page", async () => {
    mockExportListByStatus.mockResolvedValue([
      {
        id: 9,
        clientId: 4,
        kind: "csv-executive",
        periodStart: "2026-07-01",
        periodEnd: "2026-07-31",
        status: "failed",
        filePath: null,
        lastError: "disk full",
        requestedByUserId: 1,
        createdAt: 1000,
        updatedAt: 5000,
      },
    ]);

    const alerts = await collectAdminAlerts();
    expect(alerts[0]).toMatchObject({
      kind: "export_failed",
      clientId: 4,
      clientName: "Salvo Metal Works",
      detailHref: "/ai/clients/4/reports",
      occurredAt: 5000,
    });
    expect(alerts[0].message).toContain("csv-executive");
  });

  it("maps a failed/partial run to an alert linked to the run detail page", async () => {
    mockRunListByStatus.mockResolvedValue([
      {
        id: 42,
        clientId: 11,
        collectionId: 1,
        batchId: "batch-1",
        status: "partial",
        triggeredBy: "schedule",
        triggeredByUserId: null,
        totalPrompts: 10,
        completedPrompts: 7,
        failedPrompts: 3,
        startedAt: 1000,
        finishedAt: 2000,
        createdAt: 1000,
        updatedAt: 2000,
      },
    ]);

    const alerts = await collectAdminAlerts();
    expect(alerts[0]).toMatchObject({
      kind: "run_failed_partial",
      clientId: 11,
      clientName: "United Structural Systems",
      detailHref: "/ai/runs/42",
      occurredAt: 2000,
    });
    expect(alerts[0].message).toContain("partial");
    expect(mockRunListByStatus).toHaveBeenCalledWith(["failed", "partial"], expect.any(Number));
  });

  it("sorts all alerts newest-first across every source", async () => {
    mockIntegrationListByStatus.mockResolvedValue([
      { id: 1, clientId: 4, kind: "ga4", status: "failing", lastError: null, lastSyncedAt: null, createdAt: 0, updatedAt: 1000 },
    ]);
    mockJobList.mockResolvedValue([
      { id: 7, kind: "schedule-tick", status: "failed", lastError: null, payload: "{}", attempts: 3, maxAttempts: 3, nextRunAt: 0, lockedUntil: null, createdAt: 0, updatedAt: 5000 },
    ]);

    const alerts = await collectAdminAlerts();
    expect(alerts.map((a) => a.kind)).toEqual(["job_failed", "integration_failing"]);
  });

  it("falls back to a null client name when the client can't be found", async () => {
    mockIntegrationListByStatus.mockResolvedValue([
      { id: 1, clientId: 999, kind: "ga4", status: "failing", lastError: null, lastSyncedAt: null, createdAt: 0, updatedAt: 1000 },
    ]);

    const alerts = await collectAdminAlerts();
    expect(alerts[0].clientId).toBe(999);
    expect(alerts[0].clientName).toBeNull();
  });
});
