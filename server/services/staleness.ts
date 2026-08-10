/*
 * Module/Script Name: staleness.ts
 * Path: server/services/staleness.ts
 *
 * Description:
 * TD-16: a stale lsnode worker process (one that survived a cPanel
 * "Restart" instead of exiting) keeps polling the jobs table with its
 * outdated process.env snapshot - env vars are fixed at process boot, so
 * no amount of re-reading process.env in code fixes a stale worker's
 * view of them. The only reliable fix is having the stale process notice
 * it's stale and evict itself.
 *
 * This module provides the pure detection primitives: read the on-disk
 * package.json version (fresh each call, bypassing require()'s module
 * cache, since a require()'d value would be frozen at the moment this
 * process first loaded it - the whole point is noticing when the
 * on-disk file has moved past that), and compare it against the version
 * this process booted with. Every deploy in this repo bumps
 * package.json's version before shipping (CLAUDE.md Quality Gates), so a
 * mismatch is a reliable, simple signal that a newer deploy has landed
 * on disk since this process started - it's now an orphan.
 *
 * The actual eviction (stop ticking, exit the process) lives in
 * server/jobs/runner.ts, which calls these pure functions.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-10
 * Last Modified Date: 2026-08-10
 * Comments:
 * - v1.00 TD-16 initial implementation
 */

import fs from "node:fs";

export function readPackageVersion(packageJsonPath: string): string {
  const raw = fs.readFileSync(packageJsonPath, "utf-8");
  return (JSON.parse(raw) as { version: string }).version;
}

export function isStaleWorker(bootVersion: string, currentVersion: string): boolean {
  return bootVersion !== currentVersion;
}
