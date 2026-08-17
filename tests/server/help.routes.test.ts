/*
 * Module/Script Name: help.routes.test.ts
 * Path: tests/server/help.routes.test.ts
 *
 * Description:
 * Route tests for B-25 (in-app Help): GET /api/help/system-documentation
 * serves docs/system-documentation.md's raw content to any authenticated
 * operator.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-17
 * Last Modified Date: 2026-08-17
 * Comments:
 * - v1.00 B-25
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { buildAuthApp } from "./_helpers/buildAuthApp";

const mockReadFileSync = vi.hoisted(() => vi.fn());
vi.mock("node:fs", () => ({ readFileSync: mockReadFileSync }));

const { registerHelpRoutes } = await import("../../server/routes/help");

function buildApp(role?: "super_admin" | "agency_admin" | "analyst" | "account_manager" | "client_viewer") {
  return buildAuthApp((app) => registerHelpRoutes(app), role ? { role } : {});
}

describe("GET /api/help/system-documentation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/help/system-documentation");
    expect(res.status).toBe(401);
  });

  it("returns the doc's raw markdown content in the standard envelope for any authenticated role", async () => {
    mockReadFileSync.mockReturnValue("# Workflow Portal — System Documentation\n\nSome content.");
    const app = buildApp("client_viewer");
    const res = await request(app).get("/api/help/system-documentation");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: { content: "# Workflow Portal — System Documentation\n\nSome content." },
    });
  });

  it("responds 500 without leaking internals when the file can't be read", async () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT: no such file or directory, open '/some/internal/path/system-documentation.md'");
    });
    const app = buildApp("analyst");
    const res = await request(app).get("/api/help/system-documentation");
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("/some/internal/path");
  });
});
