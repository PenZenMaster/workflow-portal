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

export class JobRunner {
  private readonly handlers = new Map<string, JobHandler>();
  private db: DrizzleDb | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  register(handler: JobHandler): this {
    this.handlers.set(handler.kind, handler);
    return this;
  }

  start(db: DrizzleDb, intervalMs = 30_000): void {
    this.db = db;
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
  // be retried. Called on startup to recover from process crashes.
  rescueOrphans(): void {
    if (!this.db) return;
    this.db
      .update(jobs)
      .set({ status: "queued", lockedUntil: null, updatedAt: Date.now() })
      .where(
        and(eq(jobs.status, "running"), lte(jobs.lockedUntil, Date.now()))
      )
      .run();
  }

  async tick(): Promise<void> {
    if (!this.db) return;
    const db = this.db;
    const now = Date.now();
    const lockUntil = now + LOCK_TTL_MS;

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
  }
}

export const jobRunner = new JobRunner();
