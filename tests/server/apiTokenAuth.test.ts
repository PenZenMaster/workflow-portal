import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import type { Request, Response } from "express";
import { buildAuthApp } from "./_helpers/buildAuthApp";

const mockApiTokenStore = { findByHash: vi.fn(), touchLastUsed: vi.fn() };

vi.mock("../../server/storage", () => ({
  storage: { countUsers: vi.fn(), getUserById: vi.fn() },
  platformStore: { seedDefaults: vi.fn().mockResolvedValue(undefined) },
  apiTokenStore: mockApiTokenStore,
}));

const { requireRoleOrApiToken } = await import("../../server/apiTokenAuth");
const { hashApiToken } = await import("../../server/services/apiToken");

const RAW = "wfp_" + "a".repeat(64);

function record(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 11,
    clientId: 4,
    name: "Reporting Suite",
    tokenHash: hashApiToken(RAW),
    tokenPrefix: "wfp_aaaaaa",
    expiresAt: Date.now() + 86_400_000,
    createdByUserId: 1,
    revokedAt: null,
    lastUsedAt: null,
    createdAt: Date.now() - 1000,
    ...over,
  };
}

type Role = "super_admin" | "agency_admin" | "analyst" | "account_manager" | "client_viewer";

function buildApp(role?: Role, limit?: number) {
  return buildAuthApp(
    (app) => {
      app.get(
        "/api/clients/:id/thing",
        requireRoleOrApiToken(["super_admin", "agency_admin", "analyst"], { perMinuteLimit: limit }),
        (req: Request, res: Response) => {
          res.json({ apiTokenClientId: req.apiToken?.clientId ?? null, viaSession: !req.apiToken });
        }
      );
    },
    role ? { role } : {}
  );
}

const bearer = (token = RAW) => ({ Authorization: `Bearer ${token}` });

describe("requireRoleOrApiToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiTokenStore.findByHash.mockResolvedValue(record());
    mockApiTokenStore.touchLastUsed.mockResolvedValue(undefined);
  });

  it("accepts a valid bearer token for its own client and records last use", async () => {
    const res = await request(buildApp()).get("/api/clients/4/thing").set(bearer());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ apiTokenClientId: 4, viaSession: false });
    expect(mockApiTokenStore.findByHash).toHaveBeenCalledWith(hashApiToken(RAW));
    expect(mockApiTokenStore.touchLastUsed).toHaveBeenCalledWith(11, expect.any(Number));
  });

  it("returns 403 when the token belongs to a different client", async () => {
    const res = await request(buildApp()).get("/api/clients/5/thing").set(bearer());
    expect(res.status).toBe(403);
    expect(mockApiTokenStore.touchLastUsed).not.toHaveBeenCalled();
  });

  it.each([
    ["unknown", () => mockApiTokenStore.findByHash.mockResolvedValue(undefined)],
    ["expired", () => mockApiTokenStore.findByHash.mockResolvedValue(record({ expiresAt: Date.now() - 1 }))],
    ["revoked", () => mockApiTokenStore.findByHash.mockResolvedValue(record({ revokedAt: Date.now() - 1 }))],
  ])("returns 401 with one generic message for a %s token", async (_label, arrange) => {
    arrange();
    const res = await request(buildApp()).get("/api/clients/4/thing").set(bearer());
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid or expired API token");
    expect(mockApiTokenStore.touchLastUsed).not.toHaveBeenCalled();
  });

  it.each(["Basic abc", "Bearer", "Bearer ", "bearer-without-space", "Bearer a b"])(
    "returns 401 for a malformed Authorization header (%s)",
    async (header) => {
      const res = await request(buildApp()).get("/api/clients/4/thing").set("Authorization", header);
      expect(res.status).toBe(401);
      expect(mockApiTokenStore.findByHash).not.toHaveBeenCalled();
    }
  );

  it("does not fall back to the session when a bearer token is present but invalid", async () => {
    mockApiTokenStore.findByHash.mockResolvedValue(undefined);
    const res = await request(buildApp("agency_admin")).get("/api/clients/4/thing").set(bearer());
    expect(res.status).toBe(401);
  });

  it("falls through to role checks when no Authorization header is sent", async () => {
    const ok = await request(buildApp("analyst")).get("/api/clients/4/thing");
    expect(ok.status).toBe(200);
    expect(ok.body.viaSession).toBe(true);
    expect((await request(buildApp("client_viewer")).get("/api/clients/4/thing")).status).toBe(403);
    expect((await request(buildApp()).get("/api/clients/4/thing")).status).toBe(401);
    expect(mockApiTokenStore.findByHash).not.toHaveBeenCalled();
  });

  it("rate limits bearer requests", async () => {
    const app = buildApp(undefined, 2);
    expect((await request(app).get("/api/clients/4/thing").set(bearer())).status).toBe(200);
    expect((await request(app).get("/api/clients/4/thing").set(bearer())).status).toBe(200);
    const limited = await request(app).get("/api/clients/4/thing").set(bearer());
    expect(limited.status).toBe(429);
  });
});
