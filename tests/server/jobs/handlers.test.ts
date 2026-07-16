import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerJobHandlers } from "../../../server/jobs/handlers";
import { SCHEDULE_TICK_INTERVAL_MS } from "../../../server/services/scheduling";
import type { JobRunner } from "../../../server/jobs/runner";

const {
  mockScheduleStore,
  mockPromptStore,
  mockRunStore,
  mockResponseStore,
  mockPlatformStore,
  mockMentionStore,
  mockCitationStore,
  mockMetricStore,
  mockSentimentStore,
  mockExportStore,
  mockIntegrationStore,
  mockBrandStore,
  mockAliasStore,
  mockClientStore,
  mockPromptMethodologyStore,
  mockRecommendationStore,
  mockSourceDomainStore,
} = vi.hoisted(() => ({
  mockScheduleStore: { listDue: vi.fn(), markFired: vi.fn() },
  mockPromptStore: { listByCollection: vi.fn() },
  mockRunStore: {
    create: vi.fn(),
    get: vi.fn(),
    incrementCompleted: vi.fn(),
    incrementFailed: vi.fn(),
    updateStatus: vi.fn(),
    listByClient: vi.fn(),
  },
  mockResponseStore: {
    create: vi.fn(),
    get: vi.fn(),
    updateResult: vi.fn(),
    listByRun: vi.fn(),
  },
  mockPlatformStore: { get: vi.fn() },
  mockMentionStore: {
    listByResponse: vi.fn(),
    deleteByResponse: vi.fn(),
    bulkCreate: vi.fn(),
  },
  mockCitationStore: {
    listByResponse: vi.fn(),
    deleteByResponse: vi.fn(),
    bulkCreate: vi.fn(),
  },
  mockMetricStore: { upsert: vi.fn(), listByClient: vi.fn() },
  mockSentimentStore: {
    deleteByResponse: vi.fn(),
    create: vi.fn(),
    listByClient: vi.fn(),
  },
  mockExportStore: { get: vi.fn(), updateStatus: vi.fn() },
  mockIntegrationStore: {
    get: vi.fn(),
    updateConfig: vi.fn(),
    updateStatus: vi.fn(),
  },
  mockBrandStore: { listByClient: vi.fn() },
  mockAliasStore: { listByBrand: vi.fn() },
  mockClientStore: { get: vi.fn() },
  mockPromptMethodologyStore: { getActive: vi.fn() },
  mockRecommendationStore: { deleteByResponse: vi.fn(), bulkCreate: vi.fn() },
  mockSourceDomainStore: { getMapForDomains: vi.fn() },
}));

const mockGetAdapter = vi.hoisted(() => vi.fn());
vi.mock("../../../server/adapters/registry", () => ({
  getAdapter: mockGetAdapter,
}));

vi.mock("../../../server/storage", () => ({
  runStore: mockRunStore,
  responseStore: mockResponseStore,
  scheduleStore: mockScheduleStore,
  platformStore: mockPlatformStore,
  promptStore: mockPromptStore,
  mentionStore: mockMentionStore,
  citationStore: mockCitationStore,
  metricStore: mockMetricStore,
  sentimentStore: mockSentimentStore,
  exportStore: mockExportStore,
  integrationStore: mockIntegrationStore,
  brandStore: mockBrandStore,
  aliasStore: mockAliasStore,
  clientStore: mockClientStore,
  promptMethodologyStore: mockPromptMethodologyStore,
  recommendationStore: mockRecommendationStore,
  sourceDomainStore: mockSourceDomainStore,
}));

type Handler = (payload: unknown, jobId: number) => Promise<void>;

function buildRunner(): { runner: JobRunner; handlers: Map<string, Handler>; enqueue: ReturnType<typeof vi.fn> } {
  const handlers = new Map<string, Handler>();
  const enqueue = vi.fn();
  const runner = {
    register: (handler: { kind: string; handle: Handler }) => {
      handlers.set(handler.kind, handler.handle);
      return runner;
    },
    enqueue,
  };
  return { runner: runner as unknown as JobRunner, handlers, enqueue };
}

describe("prompt-run handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists token usage from the adapter result", async () => {
    mockResponseStore.get.mockResolvedValue({
      id: 200, runId: 99, platformId: 1, queryText: "Best SEO agency", geo: null, locale: null,
    });
    mockPlatformStore.get.mockResolvedValue({ id: 1, slug: "openai" });
    mockGetAdapter.mockReturnValue({
      id: "openai",
      run: vi.fn().mockResolvedValue({
        text: "Acme SEO is the top agency.",
        summaryBlock: null,
        citations: [],
        modelVariant: "gpt-4o",
        latencyMs: 1000,
        rawPayload: {},
        usage: { inputTokens: 42, outputTokens: 117 },
      }),
    });
    mockRunStore.get.mockResolvedValue({ id: 99, completedPrompts: 1, failedPrompts: 0, totalPrompts: 2 });

    const { runner, handlers } = buildRunner();
    registerJobHandlers(runner);
    await handlers.get("prompt-run")!({ responseId: 200 }, 1);

    expect(mockResponseStore.updateResult).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ status: "complete", inputTokens: 42, outputTokens: 117 })
    );
  });
});

describe("schedule-tick handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("re-enqueues itself one tick interval out even when no schedules are due", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T10:00:00.000Z"));
    mockScheduleStore.listDue.mockResolvedValue([]);

    const { runner, handlers, enqueue } = buildRunner();
    registerJobHandlers(runner);

    await handlers.get("schedule-tick")!({}, 1);

    expect(enqueue).toHaveBeenCalledWith(
      "schedule-tick",
      {},
      new Date("2026-06-15T10:00:00.000Z").getTime() + SCHEDULE_TICK_INTERVAL_MS
    );
  });

  it("creates a run, enqueues prompt-run jobs, and marks the schedule fired with a recomputed nextFireAt that honors dayOfWeek/hourUtc", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T10:00:00.000Z")); // Monday

    const schedule = {
      id: 1,
      clientId: 10,
      collectionId: 5,
      platformIds: [1, 2],
      cadence: "weekly" as const,
      dayOfWeek: 2,
      dayOfMonth: null,
      hourUtc: 14,
      lastFiredAt: null,
      nextFireAt: Date.now(),
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    mockScheduleStore.listDue.mockResolvedValue([schedule]);
    mockPromptStore.listByCollection.mockResolvedValue([
      { id: 50, text: "Prompt 1", geo: null },
    ]);
    mockClientStore.get.mockResolvedValue({
      id: 10,
      name: "Acme Plumbing",
      primaryDomain: "acme.com",
      geographies: [],
      exclusions: [],
      ownerUserId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    mockBrandStore.listByClient.mockResolvedValue([]);
    mockRunStore.create.mockResolvedValue({ id: 99 });
    mockResponseStore.create
      .mockResolvedValueOnce({ id: 200 })
      .mockResolvedValueOnce({ id: 201 });

    const { runner, handlers, enqueue } = buildRunner();
    registerJobHandlers(runner);

    await handlers.get("schedule-tick")!({}, 1);

    expect(mockRunStore.create).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 10,
        collectionId: 5,
        totalPrompts: 2,
        triggeredBy: "schedule",
      })
    );
    expect(enqueue).toHaveBeenCalledWith("prompt-run", { responseId: 200 });
    expect(enqueue).toHaveBeenCalledWith("prompt-run", { responseId: 201 });
    expect(mockScheduleStore.markFired).toHaveBeenCalledWith(
      1,
      new Date("2026-06-15T10:00:00.000Z").getTime(),
      new Date("2026-06-16T14:00:00.000Z").getTime()
    );
    expect(enqueue).toHaveBeenCalledWith(
      "schedule-tick",
      {},
      new Date("2026-06-15T10:00:00.000Z").getTime() + SCHEDULE_TICK_INTERVAL_MS
    );
  });

  it("expands {{competitor}} tokens into one response per competitor and reflects it in totalPrompts", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T10:00:00.000Z")); // Monday

    const schedule = {
      id: 3,
      clientId: 12,
      collectionId: 7,
      platformIds: [1],
      cadence: "weekly" as const,
      dayOfWeek: 2,
      dayOfMonth: null,
      hourUtc: 14,
      lastFiredAt: null,
      nextFireAt: Date.now(),
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    mockScheduleStore.listDue.mockResolvedValue([schedule]);
    mockPromptStore.listByCollection.mockResolvedValue([
      { id: 60, text: "Alternatives to {{competitor}}", geo: null },
    ]);
    mockClientStore.get.mockResolvedValue({
      id: 12,
      name: "Acme Plumbing",
      primaryDomain: "acme.com",
      geographies: [],
      exclusions: [],
      ownerUserId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    mockBrandStore.listByClient.mockResolvedValue([
      { id: 1, clientId: 12, canonicalName: "Acme Plumbing", kind: "client", primaryDomain: null, createdAt: Date.now() },
      { id: 2, clientId: 12, canonicalName: "Globex Plumbing", kind: "competitor", primaryDomain: null, createdAt: Date.now() },
      { id: 3, clientId: 12, canonicalName: "Initech Plumbing", kind: "competitor", primaryDomain: null, createdAt: Date.now() },
    ]);
    mockRunStore.create.mockResolvedValue({ id: 100 });
    mockResponseStore.create
      .mockResolvedValueOnce({ id: 300 })
      .mockResolvedValueOnce({ id: 301 });

    const { runner, handlers } = buildRunner();
    registerJobHandlers(runner);

    await handlers.get("schedule-tick")!({}, 1);

    expect(mockRunStore.create).toHaveBeenCalledWith(
      expect.objectContaining({ totalPrompts: 2 })
    );
    const queryTexts = mockResponseStore.create.mock.calls.map(([arg]) => arg.queryText);
    expect(queryTexts).toEqual(["Alternatives to Globex Plumbing", "Alternatives to Initech Plumbing"]);
  });

  it("marks a schedule fired without creating a run when the collection has no prompts", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T10:00:00.000Z")); // Monday

    const schedule = {
      id: 2,
      clientId: 11,
      collectionId: 6,
      platformIds: [1],
      cadence: "monthly" as const,
      dayOfWeek: null,
      dayOfMonth: 20,
      hourUtc: 9,
      lastFiredAt: null,
      nextFireAt: Date.now(),
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    mockScheduleStore.listDue.mockResolvedValue([schedule]);
    mockPromptStore.listByCollection.mockResolvedValue([]);

    const { runner, handlers } = buildRunner();
    registerJobHandlers(runner);

    await handlers.get("schedule-tick")!({}, 1);

    expect(mockRunStore.create).not.toHaveBeenCalled();
    expect(mockScheduleStore.markFired).toHaveBeenCalledWith(
      2,
      new Date("2026-06-15T10:00:00.000Z").getTime(),
      new Date("2026-06-20T09:00:00.000Z").getTime()
    );
  });
});

describe("parse-response handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("classifies and stores a recommendation per mentioned brand, clearing old rows first", async () => {
    mockResponseStore.get.mockResolvedValue({
      id: 42,
      runId: 9,
      responseText: "Top plumbers in Seattle:\n1. Acme Plumbing - reliable emergency service\n2. Globex Plumbing - good value",
      rawPayload: { citations: [] },
    });
    mockRunStore.get.mockResolvedValue({ id: 9, clientId: 10 });
    mockBrandStore.listByClient.mockResolvedValue([
      { id: 1, clientId: 10, canonicalName: "Acme Plumbing", kind: "client", primaryDomain: "acme.com", createdAt: Date.now() },
      { id: 2, clientId: 10, canonicalName: "Globex Plumbing", kind: "competitor", primaryDomain: null, createdAt: Date.now() },
    ]);
    mockAliasStore.listByBrand.mockImplementation(async (brandId: number) =>
      brandId === 1
        ? [{ id: 1, brandId: 1, aliasText: "Acme Plumbing", matchType: "exact", language: null }]
        : [{ id: 2, brandId: 2, aliasText: "Globex Plumbing", matchType: "exact", language: null }]
    );

    const { runner, handlers } = buildRunner();
    registerJobHandlers(runner);

    await handlers.get("parse-response")!({ responseId: 42 }, 1);

    expect(mockRecommendationStore.deleteByResponse).toHaveBeenCalledWith(42);
    expect(mockRecommendationStore.bulkCreate).toHaveBeenCalledTimes(1);
    const [rows] = mockRecommendationStore.bulkCreate.mock.calls[0];
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          responseId: 42,
          brandId: 1,
          status: "first_choice",
          rank: 1,
          classifierVersion: expect.stringMatching(/^rules-/),
        }),
        expect.objectContaining({
          responseId: 42,
          brandId: 2,
          status: "listed_option",
          rank: 2,
        }),
      ])
    );
  });

  it("stores no recommendation rows when no tracked brand is mentioned", async () => {
    mockResponseStore.get.mockResolvedValue({
      id: 43,
      runId: 9,
      responseText: "Here are some general plumbing maintenance tips for homeowners.",
      rawPayload: { citations: [] },
    });
    mockRunStore.get.mockResolvedValue({ id: 9, clientId: 10 });
    mockBrandStore.listByClient.mockResolvedValue([
      { id: 1, clientId: 10, canonicalName: "Acme Plumbing", kind: "client", primaryDomain: "acme.com", createdAt: Date.now() },
    ]);
    mockAliasStore.listByBrand.mockResolvedValue([
      { id: 1, brandId: 1, aliasText: "Acme Plumbing", matchType: "exact", language: null },
    ]);

    const { runner, handlers } = buildRunner();
    registerJobHandlers(runner);

    await handlers.get("parse-response")!({ responseId: 43 }, 1);

    expect(mockRecommendationStore.deleteByResponse).toHaveBeenCalledWith(43);
    expect(mockRecommendationStore.bulkCreate).not.toHaveBeenCalled();
  });

  it("stamps each citation with a source class: brand ownership beats registry, registry beats unknown", async () => {
    mockResponseStore.get.mockResolvedValue({
      id: 44,
      runId: 9,
      responseText: "Acme Plumbing is well reviewed on Yelp.",
      rawPayload: {
        citations: [
          "https://acme.com/about",
          "https://yelp.com/biz/acme",
          "https://chicagotribune.com/story",
          "https://randomblog.net/post",
        ],
      },
    });
    mockRunStore.get.mockResolvedValue({ id: 9, clientId: 10 });
    mockBrandStore.listByClient.mockResolvedValue([
      { id: 1, clientId: 10, canonicalName: "Acme Plumbing", kind: "client", primaryDomain: "acme.com", createdAt: Date.now() },
    ]);
    mockAliasStore.listByBrand.mockResolvedValue([
      { id: 1, brandId: 1, aliasText: "Acme Plumbing", matchType: "exact", language: null },
    ]);
    mockSourceDomainStore.getMapForDomains.mockResolvedValue(
      new Map([
        ["yelp.com", "review_platform"],
        ["chicagotribune.com", "publisher_editorial"],
      ])
    );

    const { runner, handlers } = buildRunner();
    registerJobHandlers(runner);

    await handlers.get("parse-response")!({ responseId: 44 }, 1);

    expect(mockCitationStore.bulkCreate).toHaveBeenCalledTimes(1);
    const [rows] = mockCitationStore.bulkCreate.mock.calls[0];
    const byDomain = new Map(rows.map((r: { rootDomain: string }) => [r.rootDomain, r]));
    expect(byDomain.get("acme.com")).toMatchObject({
      sourceClass: "client_owned",
      isTrustedThirdParty: false,
    });
    expect(byDomain.get("yelp.com")).toMatchObject({
      sourceClass: "review_platform",
      isTrustedThirdParty: false,
    });
    expect(byDomain.get("chicagotribune.com")).toMatchObject({
      sourceClass: "publisher_editorial",
      isTrustedThirdParty: true,
    });
    expect(byDomain.get("randomblog.net")).toMatchObject({
      sourceClass: "unknown_or_low_trust",
      isTrustedThirdParty: false,
    });
  });

  it("looks up the registry once with the deduplicated set of cited domains", async () => {
    mockResponseStore.get.mockResolvedValue({
      id: 45,
      runId: 9,
      responseText: "Some plumbing advice.",
      rawPayload: {
        citations: [
          "https://yelp.com/biz/a",
          "https://yelp.com/biz/b",
          "https://randomblog.net/post",
        ],
      },
    });
    mockRunStore.get.mockResolvedValue({ id: 9, clientId: 10 });
    mockBrandStore.listByClient.mockResolvedValue([]);
    mockSourceDomainStore.getMapForDomains.mockResolvedValue(new Map());

    const { runner, handlers } = buildRunner();
    registerJobHandlers(runner);

    await handlers.get("parse-response")!({ responseId: 45 }, 1);

    expect(mockSourceDomainStore.getMapForDomains).toHaveBeenCalledTimes(1);
    const [domains] = mockSourceDomainStore.getMapForDomains.mock.calls[0];
    expect([...domains].sort()).toEqual(["randomblog.net", "yelp.com"]);
  });
});

describe("aggregate-snapshot-daily handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stamps the snapshot with the active methodology version", async () => {
    mockBrandStore.listByClient.mockResolvedValue([
      { id: 1, clientId: 10, canonicalName: "Acme", kind: "client", primaryDomain: null, createdAt: Date.now() },
    ]);
    mockRunStore.listByClient.mockResolvedValue([]);
    mockPromptMethodologyStore.getActive.mockResolvedValue({
      id: 1,
      version: "1.0",
      status: "active",
      quotas: {},
      validationRules: {},
      effectiveAt: null,
      createdAt: Date.now(),
    });

    const { runner, handlers } = buildRunner();
    registerJobHandlers(runner);

    await handlers.get("aggregate-snapshot-daily")!({ clientId: 10 }, 1);

    expect(mockMetricStore.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 10, methodologyVersion: "1.0" })
    );
  });

  it("falls back to methodology 1.0 when no active methodology exists", async () => {
    mockBrandStore.listByClient.mockResolvedValue([
      { id: 1, clientId: 10, canonicalName: "Acme", kind: "client", primaryDomain: null, createdAt: Date.now() },
    ]);
    mockRunStore.listByClient.mockResolvedValue([]);
    mockPromptMethodologyStore.getActive.mockResolvedValue(undefined);

    const { runner, handlers } = buildRunner();
    registerJobHandlers(runner);

    await handlers.get("aggregate-snapshot-daily")!({ clientId: 10 }, 1);

    expect(mockMetricStore.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ methodologyVersion: "1.0" })
    );
  });
});
