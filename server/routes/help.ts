/*
 * Module/Script Name: help.ts
 * Path: server/routes/help.ts
 *
 * Description:
 * B-25: serves docs/system-documentation.md's raw content to any
 * authenticated operator, so the in-app Help page (client/src/pages/
 * Help.tsx) doesn't need repo access to read it. Read-only, no storage
 * layer involved - the file is the single source of truth on disk.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-17
 * Last Modified Date: 2026-08-17
 * Comments:
 * - v1.00 B-25
 */

import type { Express } from "express";
import { readFileSync } from "node:fs";
import path from "node:path";
import { requireAuth } from "../auth";

const DOC_PATH = path.resolve(process.cwd(), "docs/system-documentation.md");

export function registerHelpRoutes(app: Express): void {
  app.get("/api/help/system-documentation", requireAuth, (_req, res) => {
    const content = readFileSync(DOC_PATH, "utf-8");
    res.json({ data: { content } });
  });
}
