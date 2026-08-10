/*
 * Module/Script Name: staleness.test.ts
 * Path: tests/server/services/staleness.test.ts
 *
 * Description:
 * TD-16: tests for the pure staleness-detection helpers backing the job
 * runner's self-eviction check (a worker process whose on-disk
 * package.json version has moved past what it booted with is a stale
 * orphan from a prior deploy).
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-10
 * Last Modified Date: 2026-08-10
 * Comments:
 * - v1.00 TD-16 initial implementation
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readPackageVersion, isStaleWorker } from "../../../server/services/staleness";

describe("isStaleWorker", () => {
  it("is not stale when the current version matches the boot version", () => {
    expect(isStaleWorker("1.75.0", "1.75.0")).toBe(false);
  });

  it("is stale when the current version differs from the boot version", () => {
    expect(isStaleWorker("1.75.0", "1.76.0")).toBe(true);
  });
});

describe("readPackageVersion", () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "staleness-test-"));
    file = path.join(dir, "package.json");
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("reads the version field from a package.json file", () => {
    fs.writeFileSync(file, JSON.stringify({ name: "workflow-portal", version: "1.75.0" }));
    expect(readPackageVersion(file)).toBe("1.75.0");
  });

  it("reflects a version change made after the first read (no module-cache staleness of its own)", () => {
    fs.writeFileSync(file, JSON.stringify({ version: "1.75.0" }));
    expect(readPackageVersion(file)).toBe("1.75.0");

    fs.writeFileSync(file, JSON.stringify({ version: "1.76.0" }));
    expect(readPackageVersion(file)).toBe("1.76.0");
  });
});
