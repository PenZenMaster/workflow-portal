import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { SCHEMA_SQL } from "../../../server/storage";
import { JobStore } from "../../../server/storage/jobStore";

type SqliteDb = InstanceType<typeof Database>;

function makeDb(): { sqlite: SqliteDb; db: ReturnType<typeof drizzle> } {
  const sqlite = new Database(":memory:");
  sqlite.exec(SCHEMA_SQL);
  return { sqlite, db: drizzle(sqlite) };
}

function insertJob(
  sqlite: SqliteDb,
  overrides: {
    kind?: string;
    status?: string;
    attempts?: number;
    maxAttempts?: number;
    nextRunAt?: number;
    lockedUntil?: number | null;
    lastError?: string | null;
  } = {}
): number {
  const now = Date.now();
  const result = sqlite
    .prepare(
      `INSERT INTO jobs
        (kind, payload, status, attempts, max_attempts, next_run_at, locked_until, last_error, created_at, updated_at)
       VALUES (?, '{}', ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      overrides.kind ?? "test-job",
      overrides.status ?? "queued",
      overrides.attempts ?? 0,
      overrides.maxAttempts ?? 3,
      overrides.nextRunAt ?? now,
      overrides.lockedUntil ?? null,
      overrides.lastError ?? null,
      now,
      now
    );
  return result.lastInsertRowid as number;
}

describe("JobStore", () => {
  let sqlite: SqliteDb;
  let store: JobStore;

  beforeEach(() => {
    const setup = makeDb();
    sqlite = setup.sqlite;
    store = new JobStore(setup.db);
  });

  it("returns empty list and zeroed counts on fresh DB", async () => {
    expect(await store.list()).toEqual([]);
    expect(await store.countByStatus()).toEqual({
      queued: 0,
      running: 0,
      done: 0,
      failed: 0,
      cancelled: 0,
    });
  });

  it("lists jobs newest first and respects status/kind/limit filters", async () => {
    insertJob(sqlite, { kind: "parse-response", status: "done" });
    insertJob(sqlite, { kind: "sentiment-classify", status: "queued" });
    const newest = insertJob(sqlite, { kind: "parse-response", status: "queued" });

    const all = await store.list();
    expect(all[0].id).toBe(newest);
    expect(all).toHaveLength(3);

    const queuedOnly = await store.list({ status: "queued" });
    expect(queuedOnly).toHaveLength(2);

    const parseOnly = await store.list({ kind: "parse-response" });
    expect(parseOnly).toHaveLength(2);

    const limited = await store.list({ limit: 1 });
    expect(limited).toHaveLength(1);
  });

  it("counts jobs by status", async () => {
    insertJob(sqlite, { status: "queued" });
    insertJob(sqlite, { status: "queued" });
    insertJob(sqlite, { status: "running" });
    insertJob(sqlite, { status: "failed" });

    const counts = await store.countByStatus();
    expect(counts.queued).toBe(2);
    expect(counts.running).toBe(1);
    expect(counts.failed).toBe(1);
    expect(counts.done).toBe(0);
    expect(counts.cancelled).toBe(0);
  });

  it("lists hung jobs — running with an expired lock", async () => {
    const now = Date.now();
    const hungId = insertJob(sqlite, { status: "running", lockedUntil: now - 1000 });
    insertJob(sqlite, { status: "running", lockedUntil: now + 60_000 });
    insertJob(sqlite, { status: "queued", lockedUntil: now - 1000 });

    const hung = await store.listHung(now);
    expect(hung).toHaveLength(1);
    expect(hung[0].id).toBe(hungId);
  });

  it("gets a job by id, returns undefined for unknown id", async () => {
    const id = insertJob(sqlite, { kind: "prompt-run" });
    expect((await store.get(id))?.kind).toBe("prompt-run");
    expect(await store.get(99999)).toBeUndefined();
  });

  it("requeues a failed job, resetting attempts, lock, and error", async () => {
    const id = insertJob(sqlite, {
      status: "failed",
      attempts: 3,
      lockedUntil: Date.now() - 1000,
      lastError: "boom",
      nextRunAt: Date.now() - 60_000,
    });

    const before = Date.now();
    const updated = await store.requeue(id);

    expect(updated?.status).toBe("queued");
    expect(updated?.attempts).toBe(0);
    expect(updated?.lockedUntil).toBeNull();
    expect(updated?.lastError).toBeNull();
    expect(updated?.nextRunAt).toBeGreaterThanOrEqual(before);
  });

  it("returns undefined when requeuing an unknown job", async () => {
    expect(await store.requeue(99999)).toBeUndefined();
  });

  it("cancels a job, clearing its lock", async () => {
    const id = insertJob(sqlite, { status: "running", lockedUntil: Date.now() + 60_000 });

    const updated = await store.cancel(id);

    expect(updated?.status).toBe("cancelled");
    expect(updated?.lockedUntil).toBeNull();
  });

  it("returns undefined when cancelling an unknown job", async () => {
    expect(await store.cancel(99999)).toBeUndefined();
  });
});
