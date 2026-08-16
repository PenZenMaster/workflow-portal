import "dotenv/config";
import express, { Response, NextFunction } from "express";
import type { Request } from "express";
import { AppError } from "./errors";
import { validateEnv } from "./config";
import { logger } from "./logger";
import helmet from "helmet";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./storage";
import { registerRoutes } from "./routes";
import { jobRunner } from "./jobs/runner";
import { registerJobHandlers } from "./jobs/handlers";
import { registerFactoryJobHandlers } from "./jobs/factory";
import { createReportingMonthlyPipelineCell } from "./services/factory/reportingCell";
import { integrationStore } from "./storage";
import { Ga4Service } from "./services/ga4";
import { serveStatic } from "./static";
import { createServer } from "node:http";
import { configureSession } from "./auth";
import { refreshRankRocketSitesCache } from "./mcp/sitesCache";
import crypto from "node:crypto";
import path from "node:path";

// Fail fast on bad environment before touching DB or accepting requests.
export const config = validateEnv();

// Run pending migrations before accepting requests.
// path.resolve uses CWD (project root) — correct for both dev and cPanel.
migrate(db, { migrationsFolder: path.resolve("migrations") });

const app = express();
const httpServer = createServer(app);

// CSP is disabled in development because Vite's HMR and React Fast Refresh
// require inline scripts. Full CSP enforcement is only needed in production.
app.use(
  helmet({
    contentSecurityPolicy: process.env.NODE_ENV === "production",
  })
);
configureSession(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const requestId = crypto.randomUUID();
  const start = Date.now();

  res.on("finish", () => {
    if (req.path.startsWith("/api")) {
      logger.info("request", {
        requestId,
        userId: req.session?.user?.id ?? null,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Date.now() - start,
      });
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  // Fire-and-forget: populate the "RankRocket Site Insights" card's site
  // dropdown cache. Never awaited so a slow/unreachable rankrocket-mcp
  // never delays app boot; refreshRankRocketSitesCache() already catches
  // and logs internally, so this can never leave an unhandled rejection.
  void refreshRankRocketSitesCache().catch((err: unknown) => {
    logger.warn("rankrocket sites cache initial refresh failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  // Register job kinds then start the background runner.
  registerJobHandlers(jobRunner);
  registerFactoryJobHandlers(jobRunner, [
    createReportingMonthlyPipelineCell({
      integrationStore,
      ga4: new Ga4Service(),
    }),
  ]);
  // TD-16: self-eviction - cPanel's Application Root is always this
  // process's cwd regardless of the entry file's own location (same
  // convention DATA_DB_PATH's "../persistent" documentation relies on),
  // so this resolves correctly in both dev and production without
  // touching __dirname/import.meta.url (which behave differently between
  // the ESM dev source and the CJS production bundle).
  jobRunner.start(db, undefined, {
    packageJsonPath: path.join(process.cwd(), "package.json"),
  });
  // Bootstrap the recurring schedule-tick job if one isn't already queued/running.
  jobRunner.seedRecurring("schedule-tick");
  // FR-002: bootstrap the recurring jobs-table groom job (keeps terminal
  // jobs bounded so the admin Jobs page stays responsive).
  jobRunner.seedRecurring("groom-jobs");

  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      return next(err);
    }
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message, code: err.code ?? null });
    }
    console.error("[Unhandled error]", err);
    return res.status(500).json({ error: "Internal server error" });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      ...(process.platform !== "win32" && { reusePort: true }),
    },
    () => {
      logger.info("server started", { port });
    },
  );
})();
