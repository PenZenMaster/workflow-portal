/*
 * Module/Script Name: brandContext.ts
 * Path: server/routes/brandContext.ts
 *
 * Description:
 * Admin endpoint to run the brand-context backfill (issue #4 Phase 1
 * slice 3). Ships in the normal server bundle so it's reachable in
 * production without a separate one-off script - deploy packaging only
 * includes dist/, and devDependencies (tsx) aren't installed there.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-23
 * Last Modified Date: 2026-07-23
 * Comments:
 * - v1.00 issue #4 Phase 1 slice 3 initial implementation
 */

import type { Express } from "express";
import { db } from "../storage";
import { requireRole } from "../auth";
import { ok } from "../response";
import { backfillBrandContext } from "../services/brandContextBackfill";

const ADMIN_ROLES = ["super_admin", "agency_admin"] as const;

export function registerBrandContextRoutes(app: Express): void {
  app.post(
    "/api/admin/brand-context/backfill",
    requireRole(...ADMIN_ROLES),
    async (_req, res) => {
      const summary = await backfillBrandContext(db);
      ok(res, summary);
    }
  );
}
