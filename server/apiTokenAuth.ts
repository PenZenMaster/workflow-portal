/*
 * Module/Script Name: apiTokenAuth.ts
 * Path: server/apiTokenAuth.ts
 *
 * Description:
 * Route guard that accepts either a machine API token (Authorization:
 * Bearer wfp_...) bound to the client in the URL, or a normal logged-in
 * session with one of the allowed roles. A request that carries an
 * Authorization header is judged on the token alone and never falls back
 * to the session. Bearer requests are rate limited per IP.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-10-05
 * Last Modified Date: 2026-10-05
 * Comments:
 * - v1.00 Initial implementation (Reporting Suite API access)
 */

import type { NextFunction, Request, RequestHandler, Response } from "express";
import rateLimit from "express-rate-limit";
import { apiTokenStore } from "./storage";
import { requireRole } from "./auth";
import type { UserRole } from "./auth";
import { hashApiToken, isApiTokenUsable } from "./services/apiToken";

declare module "express-serve-static-core" {
  interface Request {
    /** Set when the request was authenticated with an API token. */
    apiToken?: { id: number; clientId: number };
  }
}

const BEARER_PATTERN = /^Bearer (\S+)$/;
const DEFAULT_PER_MINUTE_LIMIT = 60;
const INVALID_TOKEN_MESSAGE = "Invalid or expired API token";

export interface ApiTokenAuthOptions {
  /** Max bearer requests per IP per minute (default 60). */
  perMinuteLimit?: number;
  /** Route param holding the client id the token must match (default "id"). */
  clientIdParam?: string;
}

export function requireRoleOrApiToken(
  roles: readonly UserRole[],
  opts: ApiTokenAuthOptions = {}
): RequestHandler[] {
  const clientIdParam = opts.clientIdParam ?? "id";
  const roleGuard = requireRole(...roles);
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: opts.perMinuteLimit ?? DEFAULT_PER_MINUTE_LIMIT,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Try again shortly." },
  });

  const limitBearer: RequestHandler = (req, res, next) => {
    if (req.headers.authorization === undefined) {
      next();
      return;
    }
    limiter(req, res, next);
  };

  const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const header = req.headers.authorization;
    if (header === undefined) {
      await roleGuard(req, res, next);
      return;
    }

    const match = BEARER_PATTERN.exec(header);
    const record = match ? await apiTokenStore.findByHash(hashApiToken(match[1])) : undefined;
    if (!record || !isApiTokenUsable(record)) {
      res.status(401).json({ error: INVALID_TOKEN_MESSAGE });
      return;
    }

    if (record.clientId !== Number(req.params[clientIdParam])) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    await apiTokenStore.touchLastUsed(record.id, Date.now());
    req.apiToken = { id: record.id, clientId: record.clientId };
    next();
  };

  return [limitBearer, authenticate];
}
