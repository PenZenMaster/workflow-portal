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
 * Last Modified Date: 2026-05-09
 * Comments:
 * - v1.00 Initial implementation for Sprint 0
 */

import { jobs } from "@shared/schema";
import { eq, and, lte, isNull, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { logger } from "../logger";

type DrizzleDb = ReturnType<typeof drizzle>;

const LOCK_TTL_MS = 5 * 60 * 1000; // 5-minute lock window per job

export interface JobHandler {
  kind: string;
  handle(payload: unknown, jobId: number): Promise<void>;
}

export interface RunnerHealth {
  lastTickAt: number | null;
  intervalMs: number | null;
  running: boolean;
}

export class JobRunner {
  private readonly handlers = new Map<string, JobHandler>();
  private db: DrizzleDb | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private intervalMs: number | null = null;
  private lastTickAt: number | null = null;

  register(handler: JobHandler): this {
    this.handlers.set(handler.kind, handler);
    return this;
  }

  start(db: DrizzleDb, intervalMs = 30_000): void {
    this.db = db;
    this.intervalMs = intervalMs;
    // Rescue any jobs left in 'running' state from a previous process crash.
    this.rescueOrphans();
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
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
        db.update(jobs)
          .set({
            status: "failed",
            lastError: `No handler registered for kind: ${job.kind}`,
            updatedAt: Date.now(),
          })
          .where(eq(jobs.id, job.id))
          .run();
        logger.warn("job skipped — no handler", { jobId: job.id, kind: job.kind });
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
