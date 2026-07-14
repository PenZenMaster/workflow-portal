import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { serveStatic } from "../../server/static";

let distPath: string;
let app: express.Express;

beforeAll(() => {
  distPath = fs.mkdtempSync(path.join(os.tmpdir(), "wp-static-test-"));
  fs.writeFileSync(
    path.join(distPath, "index.html"),
    "<!doctype html><html><body>STATIC_TEST_INDEX</body></html>",
  );
  fs.mkdirSync(path.join(distPath, "assets"));
  fs.writeFileSync(
    path.join(distPath, "assets", "app.js"),
    "console.log('STATIC_TEST_JS');",
  );
  app = express();
  serveStatic(app, distPath);
});

afterAll(() => {
  fs.rmSync(distPath, { recursive: true, force: true });
});

describe("serveStatic", () => {
  it("serves index.html at the root path with no-cache headers", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.headers["cache-control"]).toContain("no-store");
    expect(res.text).toContain("STATIC_TEST_INDEX");
  });

  it("serves existing asset files with their own content type", async () => {
    const res = await request(app).get("/assets/app.js");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("javascript");
    expect(res.text).toContain("STATIC_TEST_JS");
  });

  it("redirects a non-root SPA path to its hash-route equivalent", async () => {
    const res = await request(app).get("/ai/clients");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/#/ai/clients");
  });

  it("preserves the query string when redirecting to a hash route", async () => {
    const res = await request(app).get("/ai/clients?tab=runs&x=1");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/#/ai/clients?tab=runs&x=1");
  });

  it("throws when the build directory does not exist", () => {
    const missing = path.join(distPath, "does-not-exist");
    expect(() => serveStatic(express(), missing)).toThrow(
      /Could not find the build directory/,
    );
  });
});
