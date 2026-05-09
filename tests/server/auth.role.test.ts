import { describe, it, expect } from "vitest";
import express from "express";
import session from "express-session";
import request from "supertest";
import { requireRole, requireClientAccess } from "../../server/auth";
import type { UserRole } from "../../server/auth";

function buildRoleApp(role?: UserRole) {
  const app = express();
  app.use(
    session({
      secret: "test-secret-32-chars-minimum-ok",
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false },
    })
  );
  if (role !== undefined) {
    app.use((req, _res, next) => {
      req.session.user = { id: 1, username: "testuser", role };
      next();
    });
  }
  app.get("/role-test", requireRole("agency_admin", "super_admin"), (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/client-test", requireClientAccess("clientId"), (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe("requireRole", () => {
  it("returns 401 when not authenticated", async () => {
    const res = await request(buildRoleApp()).get("/role-test");
    expect(res.status).toBe(401);
  });

  it("returns 403 when authenticated with a disallowed role", async () => {
    const res = await request(buildRoleApp("analyst")).get("/role-test");
    expect(res.status).toBe(403);
  });

  it("returns 403 for account_manager", async () => {
    const res = await request(buildRoleApp("account_manager")).get("/role-test");
    expect(res.status).toBe(403);
  });

  it("passes when authenticated with agency_admin", async () => {
    const res = await request(buildRoleApp("agency_admin")).get("/role-test");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("passes when authenticated with super_admin", async () => {
    const res = await request(buildRoleApp("super_admin")).get("/role-test");
    expect(res.status).toBe(200);
  });
});

describe("requireClientAccess", () => {
  it("returns 401 when not authenticated", async () => {
    const res = await request(buildRoleApp()).get("/client-test");
    expect(res.status).toBe(401);
  });

  it("returns 403 for analyst (client_users not yet wired)", async () => {
    const res = await request(buildRoleApp("analyst")).get("/client-test");
    expect(res.status).toBe(403);
  });

  it("returns 403 for account_manager (client_users not yet wired)", async () => {
    const res = await request(buildRoleApp("account_manager")).get("/client-test");
    expect(res.status).toBe(403);
  });

  it("passes for agency_admin", async () => {
    const res = await request(buildRoleApp("agency_admin")).get("/client-test");
    expect(res.status).toBe(200);
  });

  it("passes for super_admin", async () => {
    const res = await request(buildRoleApp("super_admin")).get("/client-test");
    expect(res.status).toBe(200);
  });
});
