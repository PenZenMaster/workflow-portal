/*
 * Module/Script Name: brandContext.routes.test.ts
 * Path: tests/server/brandContext.routes.test.ts
 *
 * Description:
 * Route tests for the brand-context backfill admin endpoint (issue #4
 * Phase 1 slice 3). The backfill logic itself is covered by
 * brandContextBackfill.test.ts - this only checks RBAC and response
 * wrapping.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-23
 * Last Modified Date: 2026-07-23
 * Comments:
 * - v1.00 issue #4 Phase 1 slice 3 initial implementation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { buildAuthApp } from "./_helpers/buildAuthApp";

vi.mock("../../server/storage", () => ({ db: {} }));

const mockBackfillBrandContext = vi.fn();
vi.mock("../../server/services/brandContextBackfill", () => ({
  backfillBrandContext: mockBackfillBrandContext,
}));

const { registerBrandContextRoutes } = await import("../../server/routes/brandContext");

function buildApp(role?: "super_admin" | "agency_admin" | "analyst" | "account_manager" | "client_viewer") {
  return buildAuthApp((app) => registerBrandContextRoutes(app), role ? { role } : {});
}

describe("POST /api/admin/brand-context/backfill", () => {
  beforeEach(() => vi.clearAllMocks());

  it("runs the backfill and returns the summary for admins", async () => {
    const summary = {
      scanned: 130,
      updated: 130,
      byContext: { unbranded: 90, client_branded: 20, competitor_branded: 15, client_and_competitor: 5 },
    };
    mockBackfillBrandContext.mockResolvedValue(summary);

    const res = await request(buildApp("agency_admin")).post("/api/admin/brand-context/backfill");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(summary);
    expect(mockBackfillBrandContext).toHaveBeenCalledTimes(1);
  });

  it("is forbidden for non-admin roles", async () => {
    const res = await request(buildApp("analyst")).post("/api/admin/brand-context/backfill");
    expect(res.status).toBe(403);
    expect(mockBackfillBrandContext).not.toHaveBeenCalled();
  });
});
