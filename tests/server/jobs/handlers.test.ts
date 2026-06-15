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
