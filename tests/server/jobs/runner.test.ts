import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

  it("leaves an unknown-kind job queued with a delayed next_run_at instead of failing it", async () => {
    const jobId = insertJob(sqlite, { kind: "unknown-kind" });
    const before = Date.now();

    await runner.tick();

    const job = getJob(sqlite, jobId);
    expect(job.status).toBe("queued");
    expect(job.attempts).toBe(0);
    expect(job.locked_until).toBeNull();
    expect(job.next_run_at).toBeGreaterThanOrEqual(before + 60_000);
    expect(job.last_error).toContain("No handler registered");
  });

  it("fails an unknown-kind job once it is older than the 24h grace window", async () => {
    const jobId = insertJob(sqlite, { kind: "unknown-kind" });
    sqlite
      .prepare("UPDATE jobs SET created_at = ? WHERE id = ?")
      .run(Date.now() - 25 * 60 * 60 * 1000, jobId);

    await runner.tick();

    const job = getJob(sqlite, jobId);
    expect(job.status).toBe("failed");
    expect(job.last_error).toContain("no handler appeared within");
  });

  it("processes a previously unknown-kind job once a handler is registered", async () => {
    const jobId = insertJob(sqlite, { kind: "late-kind" });

    await runner.tick(); // no handler yet — requeued with delay

    const handler = vi.fn().mockResolvedValue(undefined);
    runner.register({ kind: "late-kind", handle: handler });
    sqlite
      .prepare("UPDATE jobs SET next_run_at = ? WHERE id = ?")
      .run(Date.now() - 1000, jobId); // fast-forward past the requeue delay

    await runner.tick();

    expect(handler).toHaveBeenCalledOnce();
    expect(getJob(sqlite, jobId).status).toBe("done");
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

  it("requeues with a clear error instead of silently succeeding when payload is malformed JSON", async () => {
    const jobId = insertJob(sqlite, {
      payload: '{factoryJobId: 6}', // missing quotes around the key - invalid JSON
      attempts: 0,
      maxAttempts: 3,
    });
    const handler = vi.fn().mockResolvedValue(undefined);
    runner.register({ kind: "test-job", handle: handler });

    await runner.tick();

    expect(handler).not.toHaveBeenCalled();
    const job = getJob(sqlite, jobId);
    expect(job.status).toBe("queued");
    expect(job.attempts).toBe(1);
    expect(job.last_error).toMatch(/payload/i);
  });

  it("fails a job with malformed payload once attempts reach max_attempts, same as a handler throw", async () => {
    const jobId = insertJob(sqlite, {
      payload: "not json at all",
      attempts: 2,
      maxAttempts: 3,
    });
    runner.register({ kind: "test-job", handle: vi.fn() });

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

// TD-16: a worker process that survives a cPanel restart keeps polling the
// jobs table with its outdated process.env snapshot. Self-eviction is the
// fix - detect that the on-disk package.json version has moved past what
// this process booted with, then stop ticking and exit.
describe("JobRunner staleness self-eviction (TD-16)", () => {
  let sqlite: SqliteDb;
  let db: DrizzleDb;
  let runner: JobRunner;
  let dir: string;
  let packageJsonPath: string;

  beforeEach(() => {
    const setup = createTestDb();
    sqlite = setup.sqlite;
    db = setup.db;
    runner = new JobRunner();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "runner-staleness-test-"));
    packageJsonPath = path.join(dir, "package.json");
    fs.writeFileSync(packageJsonPath, JSON.stringify({ version: "1.75.0" }));
  });

  afterEach(() => {
    runner.stop();
    fs.rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("does not self-evict when staleness checking is not configured (opt-in only)", async () => {
    runner.start(db, 999_999);
    const jobId = insertJob(sqlite);
    const handler = vi.fn().mockResolvedValue(undefined);
    runner.register({ kind: "test-job", handle: handler });

    await runner.tick();

    expect(handler).toHaveBeenCalledOnce();
    expect(getJob(sqlite, jobId).status).toBe("done");
  });

  it("does not self-evict when the on-disk package version matches what it booted with", async () => {
    const exitProcess = vi.fn();
    runner.start(db, 999_999, { packageJsonPath, exitProcess });
    const jobId = insertJob(sqlite);
    const handler = vi.fn().mockResolvedValue(undefined);
    runner.register({ kind: "test-job", handle: handler });

    await runner.tick();

    expect(exitProcess).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledOnce();
    expect(getJob(sqlite, jobId).status).toBe("done");
  });

  it("stops ticking and self-evicts when the on-disk package version has changed since boot", async () => {
    const exitProcess = vi.fn();
    runner.start(db, 999_999, { packageJsonPath, exitProcess });

    // Simulate a deploy landing on disk after this process booted.
    fs.writeFileSync(packageJsonPath, JSON.stringify({ version: "1.76.0" }));

    const jobId = insertJob(sqlite);
    const handler = vi.fn().mockResolvedValue(undefined);
    runner.register({ kind: "test-job", handle: handler });

    await runner.tick();

    expect(exitProcess).toHaveBeenCalledWith(0);
    // The stale worker must not claim/fail jobs with its outdated env on
    // its way out - the whole point of this feature.
    expect(handler).not.toHaveBeenCalled();
    expect(getJob(sqlite, jobId).status).toBe("queued");
    expect(runner.getHealth().running).toBe(false);
  });

  it("fails safe (does not evict) if package.json cannot be read at check time", async () => {
    const exitProcess = vi.fn();
    runner.start(db, 999_999, { packageJsonPath, exitProcess });
    fs.rmSync(packageJsonPath); // simulate a mid-deploy read glitch

    const jobId = insertJob(sqlite);
    const handler = vi.fn().mockResolvedValue(undefined);
    runner.register({ kind: "test-job", handle: handler });

    await runner.tick();

    expect(exitProcess).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledOnce();
    expect(getJob(sqlite, jobId).status).toBe("done");
  });
});
