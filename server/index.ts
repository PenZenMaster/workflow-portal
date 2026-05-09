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
import { serveStatic } from "./static";
import { createServer } from "node:http";
import { configureSession } from "./auth";
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
