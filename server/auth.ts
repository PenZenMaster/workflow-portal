import session from "express-session";
import BetterSqlite3SessionStoreFactory from "better-sqlite3-session-store";
import Database from "better-sqlite3";
import type { Express, Request, Response, NextFunction } from "express";
import path from "node:path";
import crypto from "node:crypto";
import { logger } from "./logger";
import { storage } from "./storage";
import type { UserRole } from "@shared/schema";

export type { UserRole };

type SessionStoreFactory = (
  s: typeof session,
) => new (opts: {
  client: InstanceType<typeof Database>;
  expired?: { clear: boolean; intervalMs: number };
}) => session.Store;

const SqliteStore = (
  BetterSqlite3SessionStoreFactory as unknown as SessionStoreFactory
)(session);

let _sessionDb: InstanceType<typeof Database> | null = null;

export function invalidateUserSessions(userId: number): void {
  if (!_sessionDb) return;
  _sessionDb
    .prepare("DELETE FROM sessions WHERE json_extract(sess, '$.user.id') = ?")
    .run(userId);
}

export type SessionUser = { id: number; username: string; role: UserRole };

declare module "express-session" {
  interface SessionData {
    user?: SessionUser;
  }
}

export function configureSession(app: Express) {
  // Trust the proxy (cPanel/Passenger/Cloudflare terminate TLS in front of us)
  // so Secure cookies and req.secure work correctly behind the reverse proxy.
  app.set("trust proxy", 1);

  let secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production") {
      // Fail loud rather than silently accept a weak secret in production.
      throw new Error(
        "SESSION_SECRET must be set to a strong random string of at least 32 characters in production. " +
          "Generate one and add it to .env, e.g. SESSION_SECRET=" +
          crypto.randomBytes(32).toString("hex")
      );
    }
    secret = crypto.randomBytes(32).toString("hex");
    logger.warn(
      "SESSION_SECRET not set — using ephemeral dev secret; sessions reset on restart"
    );
  }

  const sessionDbPath = path.resolve(
    process.env.SESSION_DB_PATH || "sessions.db"
  );
  const sessionDb = new Database(sessionDbPath);
  _sessionDb = sessionDb;

  app.use(
    session({
      name: "wfp.sid",
      secret,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      store: new SqliteStore({
        client: sessionDb,
        expired: { clear: true, intervalMs: 1000 * 60 * 60 }, // hourly cleanup
      }),
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
      },
    })
  );
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session?.user) {
    next();
    return;
  }
  res.status(401).json({ error: "Unauthorized" });
}

export function requireRole(...roles: UserRole[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.session?.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    // Sessions created before the role column was added won't carry a role.
    // Refresh it from the DB once and persist it into the session.
    if (!req.session.user.role) {
      const freshUser = await storage.getUserById(req.session.user.id);
      if (!freshUser) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      req.session.user.role = freshUser.role;
      await new Promise<void>((resolve) => req.session.save(() => resolve()));
    }
    if (!roles.includes(req.session.user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

// Sprint 1 will add per-client scoping via the client_users join table.
// For now: super_admin and agency_admin have implicit access to all clients;
// all other roles are rejected until their client_users entry is verified.
export function requireClientAccess(_clientIdParam: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.session?.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!req.session.user.role) {
      const freshUser = await storage.getUserById(req.session.user.id);
      if (!freshUser) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      req.session.user.role = freshUser.role;
      await new Promise<void>((resolve) => req.session.save(() => resolve()));
    }
    const { role } = req.session.user;
    if (role === "super_admin" || role === "agency_admin") {
      next();
      return;
    }
    res.status(403).json({ error: "Forbidden" });
  };
}
