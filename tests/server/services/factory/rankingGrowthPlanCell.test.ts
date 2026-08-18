import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FactoryJobRecord } from "../../../../shared/schema";

const mockRunRankRocketReadOnlyPrompt = vi.fn();
const mockIsRankRocketMcpConfigured = vi.fn();
vi.mock("../../../../server/mcp/rankrocketToolRun", () => ({
  runRankRocketReadOnlyPrompt: (...args: unknown[]) =>
    mockRunRankRocketReadOnlyPrompt(...args),
  isRankRocketMcpConfigured: () => mockIsRankRocketMcpConfigured(),
}));

const { createRankingGrowthPlanCell } = await import(
  "../../../../server/services/factory/rankingGrowthPlanCell"
);

function makeDeps() {
  return {
    clientStore: {
      get: vi.fn(),
    },
  };
}

function makeJob(overrides: Partial<FactoryJobRecord> = {}): FactoryJobRecord {
  return {
    id: 1,
    jobId: "job_01RGP",
    clientId: 4,
    contractVersion: "1.0",
    jobType: "planning.ranking-growth-plan",
    priority: "normal",
    input: { rankingCsv: "keyword,volume\nroof repair,12000" },
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

const CLIENT_WITH_SITE_KEY = { id: 4, rankrocketSiteKey: "tristate-hvac" };

describe("planning.ranking-growth-plan cell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsRankRocketMcpConfigured.mockReturnValue(true);
    mockRunRankRocketReadOnlyPrompt.mockResolvedValue({
      text: "# Keyword Ranking Growth Plan\n...",
      summaryBlock: null,
      citations: [],
      requestedModel: "claude-opus-5",
      modelVariant: "claude-opus-5",
      latencyMs: 1,
      rawPayload: {},
      usage: null,
    });
  });

  it("declares the planning.ranking-growth-plan job type", () => {
    const cell = createRankingGrowthPlanCell(makeDeps());
    expect(cell.jobType).toBe("planning.ranking-growth-plan");
  });

  it("rejects input missing rankingCsv", async () => {
    const deps = makeDeps();
    const cell = createRankingGrowthPlanCell(deps);

    await expect(cell.run(makeJob({ input: {} }))).rejects.toThrow(/rankingCsv/);
    expect(deps.clientStore.get).not.toHaveBeenCalled();
  });

  it("fails when the client has no rankrocketSiteKey configured", async () => {
    const deps = makeDeps();
    deps.clientStore.get.mockResolvedValue({ id: 4, rankrocketSiteKey: null });
    const cell = createRankingGrowthPlanCell(deps);

    await expect(cell.run(makeJob())).rejects.toThrow(/RankRocket site key/);
    expect(mockRunRankRocketReadOnlyPrompt).not.toHaveBeenCalled();
  });

  it("fails when the client does not exist", async () => {
    const deps = makeDeps();
    deps.clientStore.get.mockResolvedValue(undefined);
    const cell = createRankingGrowthPlanCell(deps);

    await expect(cell.run(makeJob())).rejects.toThrow(/RankRocket site key/);
  });

  it("dry run checks site key and MCP config without calling the tool loop", async () => {
    const deps = makeDeps();
    deps.clientStore.get.mockResolvedValue(CLIENT_WITH_SITE_KEY);
    const cell = createRankingGrowthPlanCell(deps);

    const output = await cell.run(makeJob({ dryRun: true }));

    expect(output).toEqual({
      dryRun: true,
      checks: { rankrocketSiteKey: "ok", mcpConfig: "ok" },
    });
    expect(mockRunRankRocketReadOnlyPrompt).not.toHaveBeenCalled();
  });

  it("dry run reports a missing MCP config", async () => {
    const deps = makeDeps();
    deps.clientStore.get.mockResolvedValue(CLIENT_WITH_SITE_KEY);
    mockIsRankRocketMcpConfigured.mockReturnValue(false);
    const cell = createRankingGrowthPlanCell(deps);

    const output = await cell.run(makeJob({ dryRun: true }));

    expect(output.checks).toEqual({ rankrocketSiteKey: "ok", mcpConfig: "missing" });
  });

  it("builds a prompt from the CSV and site key, and returns the tool loop's markdown", async () => {
    const deps = makeDeps();
    deps.clientStore.get.mockResolvedValue(CLIENT_WITH_SITE_KEY);
    const cell = createRankingGrowthPlanCell(deps);

    const output = await cell.run(makeJob());

    const [prompt] = mockRunRankRocketReadOnlyPrompt.mock.calls[0] as [string];
    expect(prompt).toContain("tristate-hvac");
    expect(prompt).toContain("keyword,volume\nroof repair,12000");
    expect(prompt).toContain("Keyword Ranking Growth Plan");
    expect(output).toEqual({
      markdown: "# Keyword Ranking Growth Plan\n...",
      sources: { rankrocketMcp: "ok" },
    });
  });

  it("requests extra tool-loop iteration headroom for this report-generating prompt", async () => {
    const deps = makeDeps();
    deps.clientStore.get.mockResolvedValue(CLIENT_WITH_SITE_KEY);
    const cell = createRankingGrowthPlanCell(deps);

    await cell.run(makeJob());

    const [, opts] = mockRunRankRocketReadOnlyPrompt.mock.calls[0] as [
      string,
      { maxIterations?: number; maxTokens?: number; timeoutMs?: number } | undefined,
    ];
    // Default cap (8) proved too low in live verification (2026-08-18): a
    // real growth-plan run needed 6+ read-only tool calls plus a final
    // synthesis turn and hit the default cap mid tool-use.
    expect(opts?.maxIterations).toBeGreaterThan(8);
    // The configured default (4096) was entirely consumed by the model's own
    // "thinking" tokens in live verification (2026-08-18), leaving nothing
    // for the actual report - request real headroom above that default.
    expect(opts?.maxTokens).toBeGreaterThan(4096);
    // The configured default (60000ms) timed out in live verification
    // (2026-08-18) on a single API call generating a large response -
    // request more headroom above that default.
    expect(opts?.timeoutMs).toBeGreaterThan(60000);
  });

  it("folds optional supporting inputs into the prompt when provided", async () => {
    const deps = makeDeps();
    deps.clientStore.get.mockResolvedValue(CLIENT_WITH_SITE_KEY);
    const cell = createRankingGrowthPlanCell(deps);

    await cell.run(
      makeJob({
        input: {
          rankingCsv: "keyword,volume\nroof repair,12000",
          targetServiceAreas: "Springfield, Shelbyville",
          coreServices: "roof repair, gutter cleaning",
        },
      })
    );

    const [prompt] = mockRunRankRocketReadOnlyPrompt.mock.calls[0] as [string];
    expect(prompt).toContain("Springfield, Shelbyville");
    expect(prompt).toContain("roof repair, gutter cleaning");
  });
});
