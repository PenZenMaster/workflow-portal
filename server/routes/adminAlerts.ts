/*
 * Module/Script Name: adminAlerts.ts
 * Path: server/routes/adminAlerts.ts
 *
 * Description:
 * Client-experience sequence plan item 4 (Admin Alerts). Exposes the
 * aggregated failure-state list (server/services/adminAlerts.ts) to the
 * /admin/alerts page. Super-admin only, matching the existing /admin/jobs
 * convention - on-load fetch, no polling, no dismiss/acknowledge concept
 * (v1 is a live reflection of current state, same as /admin/jobs).
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-19
 * Last Modified Date: 2026-08-19
 * Comments:
 * - v1.00 initial implementation
 */

import type { Express } from "express";
import { collectAdminAlerts } from "../services/adminAlerts";
import { requireRole } from "../auth";
import { ok } from "../response";

export function registerAdminAlertRoutes(app: Express): void {
  app.get("/api/admin/alerts", requireRole("super_admin"), async (_req, res) => {
    const alerts = await collectAdminAlerts();
    ok(res, { alerts });
  });
}
