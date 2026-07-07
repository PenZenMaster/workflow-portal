import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { SCHEMA_SQL } from "../../../server/storage";
import { FactoryJobStore } from "../../../server/storage/factoryJobStore";
import type { FactoryJob } from "../../../shared/factory/job-contract";

type SqliteDb = InstanceType<typeof Database>;

function makeDb(): { sqlite: SqliteDb; db: ReturnType<typeof drizzle> } {
  const sqlite = new Database(":memory:");
  sqlite.exec(SCHEMA_SQL);
  return { sqlite, db: drizzle(sqlite) };
}

function makeContract(overrides: Partial<FactoryJob> = {}): FactoryJob {
  return {
    contractVersion: "1.0",
    jobId: "job_01JXYZ",
    clientId: 4,
    jobType: "reporting.monthly-pipeline",
    priority: "normal",
    createdAt: "2026-07-07T15:00:00Z",
    input: { periodStart: "2026-06-01", periodEnd: "2026-06-30" },
    execution: { dryRun: false, approvalRequired: false },
    ...overrides,
  };
}

describe("FactoryJobStore", () => {
  let store: FactoryJobStore;

  beforeEach(() => {
    const setup = makeDb();
    store = new FactoryJobStore(setup.db);
  });

  it("creates a job from a contract with status queued", async () => {
    const record = await store.create(makeContract());
    expect(record.id).toBeGreaterThan(0);
    expect(record.jobId).toBe("job_01JXYZ");
    expect(record.clientId).toBe(4);
    expect(record.jobType).toBe("reporting.monthly-pipeline");
    expect(record.priority).toBe("normal");
    expect(record.status).toBe("queued");
    expect(record.dryRun).toBe(false);
    expect(record.approvalRequired).toBe(false);
    expect(record.input).toEqual({
      periodStart: "2026-06-01",
      periodEnd: "2026-06-30",
    });
    expect(record.createdAt).toBe(Date.parse("2026-07-07T15:00:00Z"));
  });

  it("creates a job awaiting approval when the contract requires it", async () => {
    const record = await store.create(
      makeContract({ execution: { dryRun: false, approvalRequired: true } })
    );
    expect(record.status).toBe("awaiting_approval");
    expect(record.approvalRequired).toBe(true);
  });

  it("rejects a duplicate jobId", async () => {
    await store.create(makeContract());
    await expect(store.create(makeContract())).rejects.toThrow();
  });

  it("gets a job by jobId and returns undefined when unknown", async () => {
    await store.create(makeContract());
    const found = await store.getByJobId("job_01JXYZ");
    expect(found?.clientId).toBe(4);
    expect(await store.getByJobId("job_missing")).toBeUndefined();
  });

  it("lists jobs newest first with clientId and status filters", async () => {
    await store.create(makeContract({ jobId: "job_a", clientId: 1 }));
    await store.create(
      makeContract({
        jobId: "job_b",
        clientId: 2,
        execution: { dryRun: false, approvalRequired: true },
      })
    );
    const newest = await store.create(
      makeContract({ jobId: "job_c", clientId: 1 })
    );

    const all = await store.list();
    expect(all).toHaveLength(3);
    expect(all[0].id).toBe(newest.id);

    const client1 = await store.list({ clientId: 1 });
    expect(client1.map((job) => job.jobId)).toEqual(["job_c", "job_a"]);

    const awaiting = await store.list({ status: "awaiting_approval" });
    expect(awaiting.map((job) => job.jobId)).toEqual(["job_b"]);
  });

  it("updates status and records the last error", async () => {
    const record = await store.create(makeContract());
    const failed = await store.updateStatus(record.id, "failed", "boom");
    expect(failed?.status).toBe("failed");
    expect(failed?.lastError).toBe("boom");

    const requeued = await store.updateStatus(record.id, "queued");
    expect(requeued?.status).toBe("queued");
    expect(requeued?.lastError).toBeNull();

    expect(await store.updateStatus(9999, "done")).toBeUndefined();
  });
});
