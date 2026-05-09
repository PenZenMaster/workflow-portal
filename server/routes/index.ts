/*
 * Module/Script Name: index.ts
 * Path: server/routes/index.ts
 *
 * Description:
 * Route aggregator. Registers all domain route modules and returns the
 * HTTP server. Preserves the same public signature as the original
 * server/routes.ts so server/index.ts needs no changes.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-09
 * Last Modified Date: 2026-05-09
 * Comments:
 * - v1.00 Sprint 0 route split — aggregates auth + workflow modules
 */

import type { Express } from "express";
import type { Server } from "node:http";
import { seedIfEmpty } from "../seed";
import { registerAuthRoutes } from "./auth";
import { registerWorkflowRoutes } from "./workflows";
import { registerClientRoutes } from "./clients";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Seed the catalog with known workflows on first run.
  seedIfEmpty();

  registerAuthRoutes(app);
  registerWorkflowRoutes(app);
  registerClientRoutes(app);

  return httpServer;
}
