/*
 * Module/Script Name: runner.ts
 * Path: server/jobs/runner.ts
 *
 * Description:
 * SQLite-backed in-process job runner. Polls the jobs table every
 * intervalMs milliseconds, locks eligible jobs atomically, executes
 * their registered handler, and advances status to done or failed.
 * Survives Passenger/cPanel restarts because all state is in the DB.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-09
 * Last Modified Date: 2026-07-08
 * Comments:
 * - v1.00 Initial implementation for Sprint 0
 * - v1.01 TD-17: unknown job kinds are requeued with a delay (another
 *   worker may know the kind during mixed-version deploy windows) and
 *   only fail after a 24h grace window with no capable worker
 * - v1.02 TD-16: opt-in self-eviction. A worker that survives a cPanel
 *   restart keeps ticking with its outdated process.env snapshot; each
 *   tick now re-reads the on-disk package.json version and self-evicts
 *   (stops ticking, exits) the moment it no longer matches what this
 *   process booted with - a newer deploy has landed, this process is now
 *   an orphan. See server/services/staleness.ts.
 */

import { jobs } from "@shared/schema";
import { eq, and, lte, isNull, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { logger } from "../logger";
import { readPackageVersion, isStaleWorker } from "../services/staleness";

type DrizzleDb = ReturnType<typeof drizzle>;

const LOCK_TTL_MS = 5 * 60 * 1000; // 5-minute lock window per job

// TD-17: a job whose kind has no handler in THIS worker may still be known to
// another worker (mixed-version deploy window, stale TD-16 worker), so it is
// released back to the queue with this delay rather than failed.
const UNKNOWN_KIND_RETRY_MS = 60_000;
// If no capable worker has claimed it this long after creation, the kind is
// presumed dead (typo, retired kind) and the job fails terminally.
const UNKNOWN_KIND_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface JobHandler {
  kind: string;
  handle(payload: unknown, jobId: number): Promise<void>;
}

export interface RunnerHealth {
  lastTickAt: number | null;
  intervalMs: number | null;
  running: boolean;
}

export interface StalenessOptions {
  /** Path to the package.json to watch. Omit to disable staleness checking entirely (default). */
  packageJsonPath?: string;
  /** Injectable for tests; defaults to the real process.exit. */
  exitProcess?: (code: number) => void;
}

export class JobRunner {
  private readonly handlers = new Map<string, JobHandler>();
  private db: DrizzleDb | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private intervalMs: number | null = null;
  private lastTickAt: number | null = null;
  private packageJsonPath: string | null = null;
  private bootVersion: string | null = null;
  private exitProcess: (code: number) => void = (code) => process.exit(code);

  register(handler: JobHandler): this {
    this.handlers.set(handler.kind, handler);
    return this;
  }

  start(db: DrizzleDb, intervalMs = 30_000, staleness?: StalenessOptions): void {
    this.db = db;
    this.intervalMs = intervalMs;
    if (staleness?.packageJsonPath) {
      this.packageJsonPath = staleness.packageJsonPath;
      this.bootVersion = readPackageVersion(staleness.packageJsonPath);
    }
    if (staleness?.exitProcess) this.exitProcess = staleness.exitProcess;
    // Rescue any jobs left in 'running' state from a previous process crash.
    this.rescueOrphans();
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
  }

  // TD-16: true only when staleness checking is configured AND the on-disk
  // package.json version has moved past what this process booted with.
  // Fails safe (false) on a read error - a transient mid-deploy glitch
  // must never cause a legitimately fresh worker to evict itself.
  private isStale(): boolean {
    if (!this.packageJsonPath || !this.bootVersion) return false;
    try {
      const currentVersion = readPackageVersion(this.packageJsonPath);
      return isStaleWorker(this.bootVersion, currentVersion);
    } catch {
      return false;
    }
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  getHealth(): RunnerHealth {
    return {
      lastTickAt: this.lastTickAt,
      intervalMs: this.intervalMs,
      running: this.timer !== null,
    };
  }

  // Enqueues a job of `kind` only if one isn't already queued or running.
  // Used to seed self-perpetuating recurring jobs (e.g. schedule-tick) once
  // on startup without creating duplicate chains across restarts.
  seedRecurring(kind: string, payload: unknown = {}): void {
    if (!this.db) return;
    const existing = this.db
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(eq(jobs.kind, kind), or(eq(jobs.status, "queued"), eq(jobs.status, "running")))
      )
      .get();
    if (existing) return;
    this.enqueue(kind, payload);
  }

  enqueue(kind: string, payload: unknown, nextRunAt = Date.now()): void {
    if (!this.db) return;
    const now = Date.now();
    this.db
      .insert(jobs)
      .values({
        kind,
        payload: JSON.stringify(payload),
        nextRunAt,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  // Resets running jobs whose locks have expired back to queued so they will
  // be retried. Called on startup and at the top of every tick to recover
  // from process crashes or a stalled previous tick.
  rescueOrphans(): number {
    if (!this.db) return 0;
    const result = this.db
      .update(jobs)
      .set({ status: "queued", lockedUntil: null, updatedAt: Date.now() })
      .where(
        and(eq(jobs.status, "running"), lte(jobs.lockedUntil, Date.now()))
      )
      .run();
    return result.changes;
  }

  async tick(): Promise<void> {
    if (!this.db) return;

    // TD-16: check before touching any jobs - a stale worker must not
    // claim/fail jobs with its outdated process.env on its way out.
    if (this.isStale()) {
      logger.error("job runner: detected stale worker (package.json version changed since boot) - self-evicting", {
        bootVersion: this.bootVersion,
      });
      this.stop();
      this.exitProcess(0);
      return;
    }

    const db = this.db;
    const now = Date.now();
    const lockUntil = now + LOCK_TTL_MS;

    const rescued = this.rescueOrphans();
    if (rescued > 0) {
      logger.warn("job runner: rescued orphaned jobs", { count: rescued });
    }

    const eligible = db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.status, "queued"),
          lte(jobs.nextRunAt, now),
          or(isNull(jobs.lockedUntil), lte(jobs.lockedUntil, now))
        )
      )
      .limit(5)
      .all();

    for (const job of eligible) {
      // Atomic lock — only proceeds if status is still 'queued'.
      const locked = db
        .update(jobs)
        .set({ status: "running", lockedUntil: lockUntil, updatedAt: Date.now() })
        .where(and(eq(jobs.id, job.id), eq(jobs.status, "queued")))
        .run();

      if (locked.changes === 0) continue; // another tick grabbed it first

      const handler = this.handlers.get(job.kind);
      if (!handler) {
        const graceExpired = Date.now() - job.createdAt >= UNKNOWN_KIND_MAX_AGE_MS;
        if (graceExpired) {
          db.update(jobs)
            .set({
              status: "failed",
              lockedUntil: null,
              lastError: `No handler registered for kind: ${job.kind} — no handler appeared within ${UNKNOWN_KIND_MAX_AGE_MS / 3_600_000}h of creation`,
              updatedAt: Date.now(),
            })
            .where(eq(jobs.id, job.id))
            .run();
          logger.warn("job failed — unknown kind outlived grace window", {
            jobId: job.id,
            kind: job.kind,
          });
        } else {
          db.update(jobs)
            .set({
              status: "queued",
              lockedUntil: null,
              lastError: `No handler registered for kind: ${job.kind}`,
              nextRunAt: Date.now() + UNKNOWN_KIND_RETRY_MS,
              updatedAt: Date.now(),
            })
            .where(eq(jobs.id, job.id))
            .run();
          logger.warn("job requeued — no handler in this worker", {
            jobId: job.id,
            kind: job.kind,
          });
        }
        continue;
      }

      try {
        let payload: unknown = {};
        try {
          payload = JSON.parse(job.payload);
        } catch {
          // malformed payload — use empty object
        }
        await handler.handle(payload, job.id);
        db.update(jobs)
          .set({ status: "done", lockedUntil: null, updatedAt: Date.now() })
          .where(eq(jobs.id, job.id))
          .run();
      } catch (err) {
        const attempts = job.attempts + 1;
        const exhausted = attempts >= job.maxAttempts;
        db.update(jobs)
          .set({
            status: exhausted ? "failed" : "queued",
            attempts,
            lockedUntil: null,
            lastError: err instanceof Error ? err.message : String(err),
            nextRunAt: exhausted
              ? job.nextRunAt
              : Date.now() + 60_000 * attempts,
            updatedAt: Date.now(),
          })
          .where(eq(jobs.id, job.id))
          .run();
        logger.error("job execution failed", {
          jobId: job.id,
          kind: job.kind,
          attempts,
          exhausted,
          error: String(err),
        });
      }
    }

    this.lastTickAt = Date.now();
    if (eligible.length > 0) {
      logger.info("job runner: tick processed jobs", { processed: eligible.length });
    }
  }
}

export const jobRunner = new JobRunner();
