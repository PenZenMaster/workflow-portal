import session from "express-session";
import BetterSqlite3SessionStoreFactory from "better-sqlite3-session-store";
import Database from "better-sqlite3";
import type { Express, Request, Response, NextFunction } from "express";
import path from "node:path";
import crypto from "node:crypto";

const SqliteStore = (BetterSqlite3SessionStoreFactory as any)(session);

let _sessionDb: InstanceType<typeof Database> | null = null;

export function invalidateUserSessions(userId: number): void {
  if (!_sessionDb) return;
  _sessionDb
    .prepare("DELETE FROM sessions WHERE json_extract(sess, '$.user.id') = ?")
    .run(userId);
}

export type SessionUser = { id: number; username: string };

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
    console.warn(
      "[auth] SESSION_SECRET not set. Using an ephemeral dev secret; sessions will be invalidated on restart."
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

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session?.user) return next();
  return res.status(401).json({ error: "Unauthorized" });
}
