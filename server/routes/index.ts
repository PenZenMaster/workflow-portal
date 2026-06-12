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
import { platformStore } from "../storage";
import { registerAuthRoutes } from "./auth";
import { registerWorkflowRoutes } from "./workflows";
import { registerClientRoutes } from "./clients";
import { registerPromptRoutes } from "./prompts";
import { registerRunRoutes } from "./runs";
import { registerMetricRoutes } from "./metrics";
import { registerSentimentRoutes } from "./sentiment";
import { registerExportRoutes } from "./exports";
import { registerSourceRoutes } from "./sources";
import { registerIntegrationRoutes } from "./integrations";
import { registerOAuthRoutes } from "./oauth";
import { registerUserRoutes } from "./users";
import { registerJobRoutes } from "./jobs";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Seed workflow catalog and default AI platforms on first run.
  seedIfEmpty();
  await platformStore.seedDefaults();

  registerAuthRoutes(app);
  registerWorkflowRoutes(app);
  registerClientRoutes(app);
  registerPromptRoutes(app);
  registerRunRoutes(app);
  registerMetricRoutes(app);
  registerSentimentRoutes(app);
  registerExportRoutes(app);
  registerSourceRoutes(app);
  registerIntegrationRoutes(app);
  registerOAuthRoutes(app);
  registerUserRoutes(app);
  registerJobRoutes(app);

  return httpServer;
}
