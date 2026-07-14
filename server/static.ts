import express from 'express';
import type { Express } from 'express';
import fs from "node:fs";
import path from "node:path";

export function serveStatic(
  app: Express,
  distPath: string = path.resolve(__dirname, "public"),
) {
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Hashed asset files (JS/CSS) are content-addressed — cache aggressively.
  // index.html must never be cached so browsers always fetch the latest router.
  app.use(
    express.static(distPath, {
      setHeaders(res, filePath) {
        if (filePath.endsWith("index.html")) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Expires", "0");
        }
      },
    })
  );

  // The SPA is hash-routed and index.html references assets relative to the
  // document URL (vite base "./"), so serving index.html for a nested path
  // would make ./assets resolve to a folder that doesn't exist. Send nested
  // paths into the hash router instead; only "/" serves index.html directly.
  app.use("/{*path}", (req, res) => {
    // req.path is rewritten relative to the mount inside app.use(path, ...),
    // so the real requested path must come from originalUrl.
    const pathname = req.originalUrl.split("?")[0];
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    if (pathname !== "/") {
      res.redirect(302, `/#${req.originalUrl}`);
      return;
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
