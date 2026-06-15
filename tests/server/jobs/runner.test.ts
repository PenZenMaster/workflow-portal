import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { JobRunner } from "../../../server/jobs/runner";
import { SCHEMA_SQL } from "../../../server/storage";

type SqliteDb = InstanceType<typeof Database>;
type DrizzleDb = ReturnType<typeof drizzle>;

function createTestDb(): { sqlite: SqliteDb; db: DrizzleDb } {
  const sqlite = new Database(":memory:");
  sqlite.exec(SCHEMA_SQL);
  return { sqlite, db: drizzle(sqlite) };
}

function insertJob(
  sqlite: SqliteDb,
  overrides: {
    kind?: string;
    payload?: string;
    status?: string;
    attempts?: number;
    maxAttempts?: number;
    nextRunAt?: number;
    lockedUntil?: number | null;
  } = {}
): number {
  const now = Date.now();
  const result = sqlite
    .prepare(
      `INSERT INTO jobs
        (kind, payload, status, attempts, max_attempts, next_run_at, locked_until, last_error, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
    )
    .run(
      overrides.kind ?? "test-job",
      overrides.payload ?? "{}",
      overrides.status ?? "queued",
      overrides.attempts ?? 0,
      overrides.maxAttempts ?? 3,
      overrides.nextRunAt ?? now - 1000,
      overrides.lockedUntil ?? null,
      now,
      now
    );
  return result.lastInsertRowid as number;
}

function getJob(sqlite: SqliteDb, id: number) {
  return sqlite.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as {
    id: number;
    kind: string;
    status: string;
    attempts: number;
    last_error: string | null;
    locked_until: number | null;
    next_run_at: number;
  };
}

describe("JobRunner", () => {
  let sqlite: SqliteDb;
  let db: DrizzleDb;
  let runner: JobRunner;

  beforeEach(() => {
    const setup = createTestDb();
    sqlite = setup.sqlite;
    db = setup.db;
    runner = new JobRunner();
    runner.start(db, 999_999);
  });

  afterEach(() => {
    runner.stop();
    vi.restoreAllMocks();
  });

  it("picks up a queued job and marks it done when the handler succeeds", async () => {
    const jobId = insertJob(sqlite);
    const handler = vi.fn().mockResolvedValue(undefined);
    runner.register({ kind: "test-job", handle: handler });

    await runner.tick();

    expect(handler).toHaveBeenCalledOnce();
    expect(getJob(sqlite, jobId).status).toBe("done");
  });

  it("marks failed and records the error when no handler is registered", async () => {
    const jobId = insertJob(sqlite, { kind: "unknown-kind" });

    await runner.tick();

    const job = getJob(sqlite, jobId);
    expect(job.status).toBe("failed");
    expect(job.last_error).toContain("No handler registered");
  });

  it("increments attempts and requeues when handler throws and attempts < max_attempts", async () => {
    const jobId = insertJob(sqlite, { attempts: 0, maxAttempts: 3 });
    runner.register({
      kind: "test-job",
      handle: vi.fn().mockRejectedValue(new Error("boom")),
    });

    await runner.tick();

    const job = getJob(sqlite, jobId);
    expect(job.status).toBe("queued");
    expect(job.attempts).toBe(1);
    expect(job.last_error).toBe("boom");
  });

  it("marks failed when attempts reach max_attempts on a throw", async () => {
    const jobId = insertJob(sqlite, { attempts: 2, maxAttempts: 3 });
    runner.register({
      kind: "test-job",
      handle: vi.fn().mockRejectedValue(new Error("final failure")),
    });

    await runner.tick();

    expect(getJob(sqlite, jobId).status).toBe("failed");
  });

  it("does not pick up a job whose next_run_at is in the future", async () => {
    const jobId = insertJob(sqlite, { nextRunAt: Date.now() + 60_000 });
    const handler = vi.fn().mockResolvedValue(undefined);
    runner.register({ kind: "test-job", handle: handler });

    await runner.tick();

    expect(handler).not.toHaveBeenCalled();
    expect(getJob(sqlite, jobId).status).toBe("queued");
  });

  it("does not pick up a job whose lock has not yet expired", async () => {
    const jobId = insertJob(sqlite, { lockedUntil: Date.now() + 300_000 });
    const handler = vi.fn().mockResolvedValue(undefined);
    runner.register({ kind: "test-job", handle: handler });

    await runner.tick();

    expect(handler).not.toHaveBeenCalled();
    expect(getJob(sqlite, jobId).status).toBe("queued");
  });

  it("picks up a queued job whose lock has expired (orphan rescue)", async () => {
    const jobId = insertJob(sqlite, { lockedUntil: Date.now() - 1000 });
    const handler = vi.fn().mockResolvedValue(undefined);
    runner.register({ kind: "test-job", handle: handler });

    await runner.tick();

    expect(handler).toHaveBeenCalledOnce();
    expect(getJob(sqlite, jobId).status).toBe("done");
  });

  it("rescues an orphaned running job mid-tick and updates the heartbeat", async () => {
    const jobId = insertJob(sqlite, {
      status: "running",
      lockedUntil: Date.now() - 1000,
      nextRunAt: Date.now() - 1000,
    });
    const handler = vi.fn().mockResolvedValue(undefined);
    runner.register({ kind: "test-job", handle: handler });

    const before = Date.now();
    await runner.tick();

    expect(getJob(sqlite, jobId).status).toBe("done");
    expect(handler).toHaveBeenCalledOnce();
    expect(runner.getHealth().lastTickAt).toBeGreaterThanOrEqual(before);
  });

  it("reports the configured interval and running state via getHealth", () => {
    const health = runner.getHealth();
    expect(health.intervalMs).toBe(999_999);
    expect(health.running).toBe(true);
  });

  it("seedRecurring enqueues a job when none of that kind exists", () => {
    runner.seedRecurring("schedule-tick");

    const row = sqlite
      .prepare("SELECT * FROM jobs WHERE kind = 'schedule-tick'")
      .get() as { kind: string; status: string } | undefined;
    expect(row?.status).toBe("queued");
  });

  it("seedRecurring does not enqueue when a queued job of that kind already exists", () => {
    insertJob(sqlite, { kind: "schedule-tick", status: "queued" });

    runner.seedRecurring("schedule-tick");

    const rows = sqlite
      .prepare("SELECT * FROM jobs WHERE kind = 'schedule-tick'")
      .all();
    expect(rows).toHaveLength(1);
  });

  it("seedRecurring does not enqueue when a running job of that kind already exists", () => {
    insertJob(sqlite, { kind: "schedule-tick", status: "running" });

    runner.seedRecurring("schedule-tick");

    const rows = sqlite
      .prepare("SELECT * FROM jobs WHERE kind = 'schedule-tick'")
      .all();
    expect(rows).toHaveLength(1);
  });

  it("resets running jobs with expired locks to queued on startup", () => {
    // Insert a 'running' job with an expired lock — simulates a process crash.
    // nextRunAt is in the future so tick() won't pick it up immediately,
    // letting us verify just the orphan-rescue step.
    const jobId = insertJob(sqlite, {
      status: "running",
      lockedUntil: Date.now() - 1000,
      nextRunAt: Date.now() + 60_000,
    });

    // Start a new runner — rescueOrphans() fires synchronously inside start().
    const freshRunner = new JobRunner();
    freshRunner.start(db, 999_999);

    expect(getJob(sqlite, jobId).status).toBe("queued");
    freshRunner.stop();
  });
});
