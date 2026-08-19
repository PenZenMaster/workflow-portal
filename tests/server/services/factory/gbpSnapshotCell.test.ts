import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FactoryJobRecord } from "../../../../shared/schema";

const mockGetLocationSnapshot = vi.fn();
const mockIsGbpConfigured = vi.fn();
vi.mock("../../../../server/services/gbp", () => ({
  getLocationSnapshot: (...args: unknown[]) => mockGetLocationSnapshot(...args),
  isGbpConfigured: () => mockIsGbpConfigured(),
}));

const { createGbpSnapshotCell } = await import(
  "../../../../server/services/factory/gbpSnapshotCell"
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
    jobId: "job_01GBP",
    clientId: 4,
    contractVersion: "1.0",
    jobType: "planning.gbp-snapshot",
    priority: "normal",
    input: {},
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

const CLIENT_WITH_LOCATION = {
  id: 4,
  gbpLocationName: "accounts/111224042680146879833/locations/1",
};

const SNAPSHOT = {
  locationId: "1",
  title: "Salvo Metal Works",
  primaryCategory: "Metal fabricator",
  additionalCategories: [],
  address: { locality: "Springfield" },
  serviceArea: null,
  phone: "+1 555-0100",
  websiteUri: "https://salvometalworks.example.com",
  profileDescription: null,
  regularHours: null,
  placeId: "ChIJ-real",
};

describe("planning.gbp-snapshot cell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsGbpConfigured.mockReturnValue(true);
    mockGetLocationSnapshot.mockResolvedValue(SNAPSHOT);
  });

  it("declares the planning.gbp-snapshot job type", () => {
    const cell = createGbpSnapshotCell(makeDeps());
    expect(cell.jobType).toBe("planning.gbp-snapshot");
  });

  it("fails when the client has no gbpLocationName configured", async () => {
    const deps = makeDeps();
    deps.clientStore.get.mockResolvedValue({ id: 4, gbpLocationName: null });
    const cell = createGbpSnapshotCell(deps);

    await expect(cell.run(makeJob())).rejects.toThrow(/GBP location/);
    expect(mockGetLocationSnapshot).not.toHaveBeenCalled();
  });

  it("fails when the client does not exist", async () => {
    const deps = makeDeps();
    deps.clientStore.get.mockResolvedValue(undefined);
    const cell = createGbpSnapshotCell(deps);

    await expect(cell.run(makeJob())).rejects.toThrow(/GBP location/);
  });

  it("dry run checks location mapping and GBP config without calling the API", async () => {
    const deps = makeDeps();
    deps.clientStore.get.mockResolvedValue(CLIENT_WITH_LOCATION);
    const cell = createGbpSnapshotCell(deps);

    const output = await cell.run(makeJob({ dryRun: true }));

    expect(output).toEqual({
      dryRun: true,
      checks: { gbpLocationName: "ok", gbpConfig: "ok" },
    });
    expect(mockGetLocationSnapshot).not.toHaveBeenCalled();
  });

  it("dry run reports a missing GBP config", async () => {
    const deps = makeDeps();
    deps.clientStore.get.mockResolvedValue(CLIENT_WITH_LOCATION);
    mockIsGbpConfigured.mockReturnValue(false);
    const cell = createGbpSnapshotCell(deps);

    const output = await cell.run(makeJob({ dryRun: true }));

    expect(output.checks).toEqual({ gbpLocationName: "ok", gbpConfig: "missing" });
  });

  it("calls getLocationSnapshot with the client's mapped location and returns it as output", async () => {
    const deps = makeDeps();
    deps.clientStore.get.mockResolvedValue(CLIENT_WITH_LOCATION);
    const cell = createGbpSnapshotCell(deps);

    const output = await cell.run(makeJob());

    expect(mockGetLocationSnapshot).toHaveBeenCalledWith(
      "accounts/111224042680146879833/locations/1"
    );
    expect(output).toEqual(SNAPSHOT);
  });
});
