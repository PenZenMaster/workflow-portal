import { describe, it, expect, vi, beforeEach } from "vitest";
import { createReportingMonthlyPipelineCell } from "../../../../server/services/factory/reportingCell";
import type { FactoryJobRecord } from "../../../../shared/schema";

const SAMPLE_TRAFFIC = {
  sessions: 42,
  engagementRate: 0.61,
  pagesPerSession: 2.4,
  conversionRate: 0.05,
  referrers: [{ sessionSource: "perplexity.ai", sessions: 30 }],
  fromDate: "2026-06-01",
  toDate: "2026-06-30",
};

function makeDeps() {
  return {
    integrationStore: {
      listByClient: vi.fn(),
      updateConfig: vi.fn(),
    },
    ga4: {
      getAiTraffic: vi.fn(),
    },
  };
}

function makeJob(overrides: Partial<FactoryJobRecord> = {}): FactoryJobRecord {
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
    status: "running",
    lastError: null,
    output: null,
    approvedBy: null,
    approvedAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

const GA4_INTEGRATION = {
  id: 9,
  kind: "ga4",
  config: { propertyId: "123456", refreshToken: "rt" },
};

describe("reporting.monthly-pipeline cell", () => {
  beforeEach(() => vi.clearAllMocks());

  it("declares the reporting.monthly-pipeline job type", () => {
    const cell = createReportingMonthlyPipelineCell(makeDeps());
    expect(cell.jobType).toBe("reporting.monthly-pipeline");
  });

  it("rejects input without a valid period", async () => {
    const deps = makeDeps();
    const cell = createReportingMonthlyPipelineCell(deps);

    await expect(
      cell.run(makeJob({ input: { periodStart: "June" } }))
    ).rejects.toThrow(/periodStart|periodEnd/);
    expect(deps.integrationStore.listByClient).not.toHaveBeenCalled();
  });

  it("fails when the client has no GA4 integration", async () => {
    const deps = makeDeps();
    deps.integrationStore.listByClient.mockResolvedValue([
      { id: 2, kind: "gsc", config: {} },
    ]);
    const cell = createReportingMonthlyPipelineCell(deps);

    await expect(cell.run(makeJob())).rejects.toThrow(/GA4 integration/);
    expect(deps.ga4.getAiTraffic).not.toHaveBeenCalled();
  });

  it("dry run validates config availability without extracting", async () => {
    const deps = makeDeps();
    deps.integrationStore.listByClient.mockResolvedValue([GA4_INTEGRATION]);
    const cell = createReportingMonthlyPipelineCell(deps);

    const output = await cell.run(makeJob({ dryRun: true }));

    expect(output).toEqual({
      dryRun: true,
      period: { start: "2026-06-01", end: "2026-06-30" },
      checks: { ga4Integration: "ok", ga4PropertyId: "ok" },
    });
    expect(deps.ga4.getAiTraffic).not.toHaveBeenCalled();
  });

  it("dry run reports a missing GA4 property id", async () => {
    const deps = makeDeps();
    deps.integrationStore.listByClient.mockResolvedValue([
      { id: 9, kind: "ga4", config: { refreshToken: "rt" } },
    ]);
    const cell = createReportingMonthlyPipelineCell(deps);

    const output = await cell.run(makeJob({ dryRun: true }));

    expect(output.checks).toEqual({ ga4Integration: "ok", ga4PropertyId: "missing" });
  });

  it("extracts GA4 AI traffic for the contract period", async () => {
    const deps = makeDeps();
    deps.integrationStore.listByClient.mockResolvedValue([GA4_INTEGRATION]);
    deps.ga4.getAiTraffic.mockResolvedValue(SAMPLE_TRAFFIC);
    const cell = createReportingMonthlyPipelineCell(deps);

    const output = await cell.run(makeJob());

    expect(deps.ga4.getAiTraffic).toHaveBeenCalledWith(
      GA4_INTEGRATION.config,
      "2026-06-01",
      "2026-06-30",
      expect.any(Function)
    );
    expect(output).toEqual({
      period: { start: "2026-06-01", end: "2026-06-30" },
      aiTraffic: {
        sessions: 42,
        engagementRate: 0.61,
        pagesPerSession: 2.4,
        conversionRate: 0.05,
        referrers: [{ sessionSource: "perplexity.ai", sessions: 30 }],
      },
      sources: { ga4: "ok" },
    });
  });

  it("persists refreshed OAuth tokens through the integration store", async () => {
    const deps = makeDeps();
    deps.integrationStore.listByClient.mockResolvedValue([GA4_INTEGRATION]);
    deps.ga4.getAiTraffic.mockImplementation(
      async (
        _config: Record<string, unknown>,
        _from: string,
        _to: string,
        onTokenRefreshed: (updated: Record<string, unknown>) => Promise<void>
      ) => {
        await onTokenRefreshed({ propertyId: "123456", accessToken: "new" });
        return SAMPLE_TRAFFIC;
      }
    );
    const cell = createReportingMonthlyPipelineCell(deps);

    await cell.run(makeJob());

    expect(deps.integrationStore.updateConfig).toHaveBeenCalledWith(9, {
      propertyId: "123456",
      accessToken: "new",
    });
  });
});
