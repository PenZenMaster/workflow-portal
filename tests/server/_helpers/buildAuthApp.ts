/*
 * Module/Script Name: buildAuthApp.ts
 * Path: tests/server/_helpers/buildAuthApp.ts
 *
 * Description:
 * Reusable Express app factory for route-level integration tests.
 * Provides session middleware and optional session-user injection with
 * a configurable role so each test suite can set up auth in one call.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-09
 * Last Modified Date: 2026-05-09
 * Comments:
 * - v1.00 Sprint 0 — replaces per-file buildApp() boilerplate
 */

import express from "express";
import session from "express-session";
import type { Express } from "express";
import type { UserRole } from "../../../server/auth";

export interface AuthAppOptions {
  /** Role to inject into req.session.user. Omit to leave unauthenticated. */
  role?: UserRole;
  /** Override the injected user id (default 1). */
  userId?: number;
  /** Override the injected username (default "testuser"). */
  username?: string;
}

/**
 * Build a minimal Express app with session middleware and optional auth injection.
 * Pass a configure callback to mount your routes before returning.
 *
 * @example
 * const app = buildAuthApp((a) => registerClientRoutes(a), { role: "agency_admin" });
 * const res = await request(app).get("/api/clients");
 */
export function buildAuthApp(
  configure: (app: Express) => void,
  opts: AuthAppOptions = {}
): Express {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(
    session({
      secret: "test-secret-32-chars-minimum-ok",
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false },
    })
  );

  if (opts.role !== undefined) {
    const user = {
      id: opts.userId ?? 1,
      username: opts.username ?? "testuser",
      role: opts.role,
    };
    app.use((req, _res, next) => {
      req.session.user = user;
      next();
    });
  }

  configure(app);
  return app;
}
