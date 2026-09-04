import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FactoryJobRecord } from "../../../../shared/schema";

const mockRunRankRocketReadOnlyPrompt = vi.fn();
const mockIsRankRocketMcpConfigured = vi.fn();
vi.mock("../../../../server/mcp/rankrocketToolRun", () => ({
  runRankRocketReadOnlyPrompt: (...args: unknown[]) =>
    mockRunRankRocketReadOnlyPrompt(...args),
  isRankRocketMcpConfigured: () => mockIsRankRocketMcpConfigured(),
}));

const {
  createRankingGrowthPlanCell,
  runRankingGrowthPlan,
  parsePriorityActions,
  buildRankingGrowthPlanPrompt,
  mapOptionalInputsFromLabels,
} = await import("../../../../server/services/factory/rankingGrowthPlanCell");

function makeDeps() {
  return {
    clientStore: {
      get: vi.fn(),
    },
    growthPlanRunStore: {
      getPreviousRun: vi.fn(),
      create: vi.fn(),
    },
    fetchGbpSnapshot: vi.fn(),
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

const CLIENT_WITH_SITE_KEY = {
  id: 4,
  rankrocketSiteKey: "tristate-hvac",
  gbpLocationName: null as string | null,
};

const SAMPLE_MARKDOWN =
  "# Keyword Ranking Growth Plan\n## Priority actions\n- Fix title tags on the homepage\n- [done] Add FAQ schema\n";

describe("planning.ranking-growth-plan cell (FactoryCell wrapper)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsRankRocketMcpConfigured.mockReturnValue(true);
    mockRunRankRocketReadOnlyPrompt.mockResolvedValue({
      text: SAMPLE_MARKDOWN,
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
    deps.clientStore.get.mockResolvedValue({ id: 4, rankrocketSiteKey: null, gbpLocationName: null });
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
    deps.growthPlanRunStore.getPreviousRun.mockResolvedValue(undefined);
    const cell = createRankingGrowthPlanCell(deps);

    const output = await cell.run(makeJob());

    const [prompt] = mockRunRankRocketReadOnlyPrompt.mock.calls[0] as [string];
    expect(prompt).toContain("tristate-hvac");
    expect(prompt).toContain("keyword,volume\nroof repair,12000");
    expect(prompt).toContain("Keyword Ranking Growth Plan");
    expect(output).toEqual({
      markdown: SAMPLE_MARKDOWN,
      sources: { rankrocketMcp: "ok" },
    });
  });

  it("requests extra tool-loop iteration headroom for this report-generating prompt", async () => {
    const deps = makeDeps();
    deps.clientStore.get.mockResolvedValue(CLIENT_WITH_SITE_KEY);
    deps.growthPlanRunStore.getPreviousRun.mockResolvedValue(undefined);
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
    deps.growthPlanRunStore.getPreviousRun.mockResolvedValue(undefined);
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

describe("runRankingGrowthPlan — GBP data folding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunRankRocketReadOnlyPrompt.mockResolvedValue({
      text: SAMPLE_MARKDOWN,
      summaryBlock: null,
      citations: [],
      requestedModel: "claude-opus-5",
      modelVariant: "claude-opus-5",
      latencyMs: 1,
      rawPayload: {},
      usage: null,
    });
  });

  it("labels GBP as verification-needed when the client has no GBP mapping", async () => {
    const deps = makeDeps();
    deps.clientStore.get.mockResolvedValue(CLIENT_WITH_SITE_KEY);
    deps.growthPlanRunStore.getPreviousRun.mockResolvedValue(undefined);

    await runRankingGrowthPlan(4, { rankingCsv: "keyword,volume\nfoo,1" }, deps);

    expect(deps.fetchGbpSnapshot).not.toHaveBeenCalled();
    const [prompt] = mockRunRankRocketReadOnlyPrompt.mock.calls[0] as [string];
    expect(prompt).toContain("No Google Business Profile is mapped");
  });

  it("fetches and includes the live GBP snapshot when the client has a mapped location", async () => {
    const deps = makeDeps();
    deps.clientStore.get.mockResolvedValue({
      ...CLIENT_WITH_SITE_KEY,
      gbpLocationName: "accounts/1/locations/2",
    });
    deps.growthPlanRunStore.getPreviousRun.mockResolvedValue(undefined);
    deps.fetchGbpSnapshot.mockResolvedValue({ title: "Trevor Aspiranti Roofing", rating: 4.8 });

    const result = await runRankingGrowthPlan(
      4,
      { rankingCsv: "keyword,volume\nfoo,1" },
      deps
    );

    expect(deps.fetchGbpSnapshot).toHaveBeenCalledWith("accounts/1/locations/2");
    const [prompt] = mockRunRankRocketReadOnlyPrompt.mock.calls[0] as [string];
    expect(prompt).toContain("Trevor Aspiranti Roofing");
    expect(prompt).not.toContain("No Google Business Profile is mapped");
    expect(result.skippedUnchanged).toBe(false);
  });
});

describe("runRankingGrowthPlan — cross-run memory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunRankRocketReadOnlyPrompt.mockResolvedValue({
      text: SAMPLE_MARKDOWN,
      summaryBlock: null,
      citations: [],
      requestedModel: "claude-opus-5",
      modelVariant: "claude-opus-5",
      latencyMs: 1,
      rawPayload: {},
      usage: null,
    });
  });

  it("skips the Claude call and returns the prior markdown when input is unchanged", async () => {
    const deps = makeDeps();
    deps.clientStore.get.mockResolvedValue(CLIENT_WITH_SITE_KEY);
    const input = { rankingCsv: "keyword,volume\nfoo,1" };

    // First call establishes the hash actually used, so this test doesn't
    // hardcode the hashing algorithm.
    deps.growthPlanRunStore.getPreviousRun.mockResolvedValueOnce(undefined);
    await runRankingGrowthPlan(4, input, deps);
    const firstCallInput = deps.growthPlanRunStore.create.mock.calls[0][0] as {
      inputHash: string;
    };

    deps.growthPlanRunStore.getPreviousRun.mockResolvedValueOnce({
      id: 1,
      clientId: 4,
      inputHash: firstCallInput.inputHash,
      markdown: "# Prior report",
      priorityActions: [],
      createdAt: Date.now() - 86_400_000,
    });
    mockRunRankRocketReadOnlyPrompt.mockClear();

    const result = await runRankingGrowthPlan(4, input, deps);

    expect(mockRunRankRocketReadOnlyPrompt).not.toHaveBeenCalled();
    expect(result.skippedUnchanged).toBe(true);
    expect(result.markdown).toContain("No changes since");
    expect(result.markdown).toContain("# Prior report");
    expect(deps.growthPlanRunStore.create).toHaveBeenCalledTimes(1); // only the first run
  });

  it("re-runs and carries forward prior priority actions when input changed", async () => {
    const deps = makeDeps();
    deps.clientStore.get.mockResolvedValue(CLIENT_WITH_SITE_KEY);
    deps.growthPlanRunStore.getPreviousRun.mockResolvedValue({
      id: 1,
      clientId: 4,
      inputHash: "some-other-hash",
      markdown: "# Prior report",
      priorityActions: [{ text: "Fix title tags on the homepage", status: "open" }],
      createdAt: Date.now() - 86_400_000,
    });

    const result = await runRankingGrowthPlan(
      4,
      { rankingCsv: "keyword,volume\nfoo,999999" },
      deps
    );

    expect(mockRunRankRocketReadOnlyPrompt).toHaveBeenCalledTimes(1);
    const [prompt] = mockRunRankRocketReadOnlyPrompt.mock.calls[0] as [string];
    expect(prompt).toContain("Previously recommended actions");
    expect(prompt).toContain("Fix title tags on the homepage");
    expect(result.skippedUnchanged).toBe(false);
    expect(deps.growthPlanRunStore.create).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 4, markdown: SAMPLE_MARKDOWN })
    );
  });
});

describe("parsePriorityActions", () => {
  it("extracts list items from the Priority actions section", () => {
    const actions = parsePriorityActions(SAMPLE_MARKDOWN);
    expect(actions).toEqual([
      { text: "Fix title tags on the homepage", status: "open" },
      { text: "Add FAQ schema", status: "done" },
    ]);
  });

  it("returns an empty array when there is no Priority actions section", () => {
    expect(parsePriorityActions("# Report\n## Findings\n- something\n")).toEqual([]);
  });

  it("stops at the next heading", () => {
    const md = "## Priority actions\n- a\n- b\n## Verification needed\n- c\n";
    expect(parsePriorityActions(md)).toEqual([
      { text: "a", status: "open" },
      { text: "b", status: "open" },
    ]);
  });
});

describe("mapOptionalInputsFromLabels", () => {
  it("maps positional values to named fields by label text", () => {
    const result = mapOptionalInputsFromLabels(
      ["target_service_areas", "core_services"],
      ["Springfield, Shelbyville", "roof repair"]
    );
    expect(result).toEqual({
      targetServiceAreas: "Springfield, Shelbyville",
      coreServices: "roof repair",
    });
  });

  it("skips blank values and unrecognized labels", () => {
    const result = mapOptionalInputsFromLabels(
      ["target_service_areas", "some_unrelated_label", "core_services"],
      ["", "whatever", "  "]
    );
    expect(result).toEqual({});
  });
});

describe("buildRankingGrowthPlanPrompt", () => {
  it("asks the model to output priority actions as a trackable list", () => {
    const prompt = buildRankingGrowthPlanPrompt(
      "tristate-hvac",
      { rankingCsv: "a,b\n1,2" },
      { gbpSnapshot: null, hasGbpMapping: false }
    );
    expect(prompt).toContain("Priority actions");
    expect(prompt).toContain("tracked run over run");
  });
});
