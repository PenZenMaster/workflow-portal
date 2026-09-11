import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FactoryJobRecord } from "../../../../shared/schema";

const mockRunRankRocketPageBuilderPrompt = vi.fn();
vi.mock("../../../../server/mcp/rankrocketToolRun", () => ({
  runRankRocketPageBuilderPrompt: (...args: unknown[]) =>
    mockRunRankRocketPageBuilderPrompt(...args),
}));

const {
  runLocationPageBuilder,
  buildLocationPageBuilderPrompt,
  mapLocationPageBuilderInputsFromLabels,
  locationPageBuilderInputSchema,
  createLocationPageBuilderCell,
  LOCATION_PAGE_BUILDER_JOB_TYPE,
} = await import("../../../../server/services/factory/locationPageBuilderCell");

function makeDeps() {
  return {
    clientStore: {
      get: vi.fn(),
    },
  };
}

const CLIENT_WITH_SITE_KEY = {
  id: 4,
  rankrocketSiteKey: "tristate-hvac",
};

const SAMPLE_RESPONSE = {
  text: "Created 2 draft pages:\n- Austin Landscaping (id 101)\n- Dallas Landscaping (id 102)",
  summaryBlock: null,
  citations: [],
  requestedModel: "claude-opus-5",
  modelVariant: "claude-opus-5",
  latencyMs: 1,
  rawPayload: {},
  usage: null,
};

describe("runLocationPageBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunRankRocketPageBuilderPrompt.mockResolvedValue(SAMPLE_RESPONSE);
  });

  it("fails when the client has no rankrocketSiteKey configured", async () => {
    const deps = makeDeps();
    deps.clientStore.get.mockResolvedValue({ id: 4, rankrocketSiteKey: null });

    await expect(
      runLocationPageBuilder(4, { targetCitiesOrServiceAreas: "Austin, Dallas" }, deps)
    ).rejects.toThrow(/RankRocket site key/);
    expect(mockRunRankRocketPageBuilderPrompt).not.toHaveBeenCalled();
  });

  it("fails when the client does not exist", async () => {
    const deps = makeDeps();
    deps.clientStore.get.mockResolvedValue(undefined);

    await expect(
      runLocationPageBuilder(4, { targetCitiesOrServiceAreas: "Austin" }, deps)
    ).rejects.toThrow(/RankRocket site key/);
  });

  it("builds a prompt from the site key and target cities, and returns the tool loop's text", async () => {
    const deps = makeDeps();
    deps.clientStore.get.mockResolvedValue(CLIENT_WITH_SITE_KEY);

    const result = await runLocationPageBuilder(
      4,
      { targetCitiesOrServiceAreas: "Austin, Dallas" },
      deps
    );

    const [prompt] = mockRunRankRocketPageBuilderPrompt.mock.calls[0] as [string];
    expect(prompt).toContain("tristate-hvac");
    expect(prompt).toContain("Austin, Dallas");
    expect(prompt).toContain("rankrocket_pages_write");
    expect(result).toEqual({ markdown: SAMPLE_RESPONSE.text });
  });

  it("folds optional business name, primary service URL, and template preferences into the prompt", async () => {
    const deps = makeDeps();
    deps.clientStore.get.mockResolvedValue(CLIENT_WITH_SITE_KEY);

    await runLocationPageBuilder(
      4,
      {
        targetCitiesOrServiceAreas: "Austin",
        businessName: "Camphouse Country Landscaping",
        primaryServiceUrl: "https://example.com/lawn-care",
        templatePreferences: "match the homepage hero style",
      },
      deps
    );

    const [prompt] = mockRunRankRocketPageBuilderPrompt.mock.calls[0] as [string];
    expect(prompt).toContain("Camphouse Country Landscaping");
    expect(prompt).toContain("https://example.com/lawn-care");
    expect(prompt).toContain("match the homepage hero style");
  });

  it("folds optional business model and service delivery model into the prompt", async () => {
    const deps = makeDeps();
    deps.clientStore.get.mockResolvedValue(CLIENT_WITH_SITE_KEY);

    await runLocationPageBuilder(
      4,
      {
        targetCitiesOrServiceAreas: "Austin",
        businessModel: "sab",
        serviceDeliveryModel: "remote",
      },
      deps
    );

    const [prompt] = mockRunRankRocketPageBuilderPrompt.mock.calls[0] as [string];
    expect(prompt).toContain("sab");
    expect(prompt).toContain("remote");
  });

  it("instructs the model to build a geographic knowledge node, not a doorway/city-swap page", async () => {
    const deps = makeDeps();
    deps.clientStore.get.mockResolvedValue(CLIENT_WITH_SITE_KEY);

    await runLocationPageBuilder(4, { targetCitiesOrServiceAreas: "Austin" }, deps);

    const [prompt] = mockRunRankRocketPageBuilderPrompt.mock.calls[0] as [string];
    expect(prompt).toMatch(/geographic knowledge node/i);
    expect(prompt).toMatch(/doorway/i);
  });

  it("instructs the model to include a direct-answer block that can stand alone", async () => {
    const deps = makeDeps();
    deps.clientStore.get.mockResolvedValue(CLIENT_WITH_SITE_KEY);

    await runLocationPageBuilder(4, { targetCitiesOrServiceAreas: "Austin" }, deps);

    const [prompt] = mockRunRankRocketPageBuilderPrompt.mock.calls[0] as [string];
    expect(prompt).toMatch(/direct-answer block/i);
    expect(prompt).toMatch(/45-90 words/);
  });

  it("instructs the model to build a query-fan-out FAQ from distinct sub-intents, not keyword paraphrases", async () => {
    const deps = makeDeps();
    deps.clientStore.get.mockResolvedValue(CLIENT_WITH_SITE_KEY);

    await runLocationPageBuilder(4, { targetCitiesOrServiceAreas: "Austin" }, deps);

    const [prompt] = mockRunRankRocketPageBuilderPrompt.mock.calls[0] as [string];
    expect(prompt).toMatch(/query-fan-out FAQ/i);
    expect(prompt).toMatch(/6-10 questions/);
    expect(prompt).toMatch(/distinct sub-intents/i);
  });

  it("instructs the model to honestly reflect the service delivery model and never invent a fake office", async () => {
    const deps = makeDeps();
    deps.clientStore.get.mockResolvedValue(CLIENT_WITH_SITE_KEY);

    await runLocationPageBuilder(4, { targetCitiesOrServiceAreas: "Austin" }, deps);

    const [prompt] = mockRunRankRocketPageBuilderPrompt.mock.calls[0] as [string];
    expect(prompt).toMatch(/fake office/i);
  });

  it("instructs the model to check for an existing locations hub page (hub-swap awareness)", async () => {
    const deps = makeDeps();
    deps.clientStore.get.mockResolvedValue(CLIENT_WITH_SITE_KEY);

    await runLocationPageBuilder(4, { targetCitiesOrServiceAreas: "Austin" }, deps);

    const [prompt] = mockRunRankRocketPageBuilderPrompt.mock.calls[0] as [string];
    expect(prompt).toMatch(/locations?[/ -]?(service-area )?hub/i);
  });

  it("instructs the model to preview with rankrocket_pages before writing, and to never publish", async () => {
    const deps = makeDeps();
    deps.clientStore.get.mockResolvedValue(CLIENT_WITH_SITE_KEY);

    await runLocationPageBuilder(4, { targetCitiesOrServiceAreas: "Austin" }, deps);

    const [prompt] = mockRunRankRocketPageBuilderPrompt.mock.calls[0] as [string];
    expect(prompt).toContain("rankrocket_pages");
    expect(prompt).toMatch(/never publish/i);
  });

  it("instructs the model to read a sibling page's Elementor layout and match it via rankrocket_elementor_write", async () => {
    const deps = makeDeps();
    deps.clientStore.get.mockResolvedValue(CLIENT_WITH_SITE_KEY);

    await runLocationPageBuilder(4, { targetCitiesOrServiceAreas: "Austin" }, deps);

    const [prompt] = mockRunRankRocketPageBuilderPrompt.mock.calls[0] as [string];
    expect(prompt).toContain("rankrocket_elementor_read");
    expect(prompt).toContain("rankrocket_elementor_write");
  });

  it("requests extra tool-loop iteration headroom, matching the growth-plan card's proven overrides", async () => {
    const deps = makeDeps();
    deps.clientStore.get.mockResolvedValue(CLIENT_WITH_SITE_KEY);

    await runLocationPageBuilder(4, { targetCitiesOrServiceAreas: "Austin" }, deps);

    const [, opts] = mockRunRankRocketPageBuilderPrompt.mock.calls[0] as [
      string,
      { maxIterations?: number; maxTokens?: number; timeoutMs?: number } | undefined,
    ];
    expect(opts?.maxIterations).toBeGreaterThan(8);
    expect(opts?.maxTokens).toBeGreaterThan(4096);
    expect(opts?.timeoutMs).toBeGreaterThan(60000);
  });
});

describe("mapLocationPageBuilderInputsFromLabels", () => {
  it("maps positional values to named fields by label text, required label included", () => {
    const result = mapLocationPageBuilderInputsFromLabels(
      [
        "Target city or service area(s)",
        "Business name",
        "Primary service / money page URL",
        "Page template / content style preferences",
      ],
      ["Austin, Dallas", "Camphouse Country Landscaping", "https://example.com/lawn-care", ""]
    );
    expect(result).toEqual({
      targetCitiesOrServiceAreas: "Austin, Dallas",
      businessName: "Camphouse Country Landscaping",
      primaryServiceUrl: "https://example.com/lawn-care",
    });
  });

  it("maps business model and service delivery model labels to named fields", () => {
    const result = mapLocationPageBuilderInputsFromLabels(
      [
        "Target city or service area(s)",
        "Business model (storefront / SAB / hybrid)",
        "Service delivery model (office / mobile / remote / hybrid)",
      ],
      ["Austin", "sab", "remote"]
    );
    expect(result).toEqual({
      targetCitiesOrServiceAreas: "Austin",
      businessModel: "sab",
      serviceDeliveryModel: "remote",
    });
  });

  it("skips blank values and unrecognized labels", () => {
    const result = mapLocationPageBuilderInputsFromLabels(
      ["Target city or service area(s)", "some_unrelated_label"],
      ["", "whatever"]
    );
    expect(result).toEqual({});
  });
});

describe("locationPageBuilderInputSchema", () => {
  it("requires targetCitiesOrServiceAreas", () => {
    expect(locationPageBuilderInputSchema.safeParse({}).success).toBe(false);
    expect(
      locationPageBuilderInputSchema.safeParse({ targetCitiesOrServiceAreas: "Austin" }).success
    ).toBe(true);
  });
});

describe("createLocationPageBuilderCell", () => {
  function sampleJob(overrides: Partial<FactoryJobRecord> = {}): FactoryJobRecord {
    return {
      id: 1,
      jobId: "lpb-abc123",
      clientId: 4,
      contractVersion: "1.0",
      jobType: LOCATION_PAGE_BUILDER_JOB_TYPE,
      priority: "normal",
      input: { targetCitiesOrServiceAreas: "Austin" },
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

  beforeEach(() => {
    vi.clearAllMocks();
    mockRunRankRocketPageBuilderPrompt.mockResolvedValue({
      text: "Created 1 draft page: Austin Landscaping (id 101)",
      summaryBlock: null,
      citations: [],
      requestedModel: "claude-opus-5",
      modelVariant: "claude-opus-5",
      latencyMs: 1,
      rawPayload: {},
      usage: null,
    });
  });

  it("reports LOCATION_PAGE_BUILDER_JOB_TYPE as its jobType, dot-namespaced", () => {
    expect(LOCATION_PAGE_BUILDER_JOB_TYPE).toBe("content.location-page-builder");
    const deps = makeDeps();
    const cell = createLocationPageBuilderCell(deps);
    expect(cell.jobType).toBe(LOCATION_PAGE_BUILDER_JOB_TYPE);
  });

  it("parses job.input and job.clientId, delegates to the same core logic as the interactive run, and returns markdown output", async () => {
    const deps = makeDeps();
    deps.clientStore.get.mockResolvedValue(CLIENT_WITH_SITE_KEY);
    const cell = createLocationPageBuilderCell(deps);

    const output = await cell.run(
      sampleJob({ clientId: 4, input: { targetCitiesOrServiceAreas: "Austin, Dallas" } })
    );

    expect(deps.clientStore.get).toHaveBeenCalledWith(4);
    const [prompt] = mockRunRankRocketPageBuilderPrompt.mock.calls[0] as [string];
    expect(prompt).toContain("Austin, Dallas");
    expect(output).toEqual({ markdown: "Created 1 draft page: Austin Landscaping (id 101)" });
  });

  it("rejects job.input that fails locationPageBuilderInputSchema", async () => {
    const deps = makeDeps();
    const cell = createLocationPageBuilderCell(deps);

    await expect(cell.run(sampleJob({ input: {} }))).rejects.toThrow();
    expect(deps.clientStore.get).not.toHaveBeenCalled();
  });
});

describe("buildLocationPageBuilderPrompt", () => {
  it("asks the model to create one page per target city and return created page details", () => {
    const prompt = buildLocationPageBuilderPrompt("tristate-hvac", {
      targetCitiesOrServiceAreas: "Austin, Dallas",
    });
    expect(prompt).toContain("draft");
    expect(prompt).toContain("edit_url");
  });
});
