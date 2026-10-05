import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { buildAuthApp } from "./_helpers/buildAuthApp";

const mockApiTokenStore = {
  create: vi.fn(),
  listByClient: vi.fn(),
  revoke: vi.fn(),
};
const mockClientStore = { get: vi.fn() };

vi.mock("../../server/storage", () => ({
  storage: { countUsers: vi.fn(), getUserById: vi.fn() },
  platformStore: { seedDefaults: vi.fn().mockResolvedValue(undefined) },
  apiTokenStore: mockApiTokenStore,
  clientStore: mockClientStore,
}));

const { registerApiTokenRoutes } = await import("../../server/routes/apiTokens");

type Role = "super_admin" | "agency_admin" | "analyst" | "account_manager" | "client_viewer";

function buildApp(role?: Role) {
  return buildAuthApp((app) => registerApiTokenRoutes(app), role ? { role, userId: 3 } : {});
}

function stored(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 11,
    clientId: 4,
    name: "Reporting Suite",
    tokenHash: "secret-hash",
    tokenPrefix: "wfp_abc123",
    expiresAt: 2_000_000_000_000,
    createdByUserId: 3,
    revokedAt: null,
    lastUsedAt: null,
    createdAt: 1_000,
    ...over,
  };
}

describe("API token management routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClientStore.get.mockResolvedValue({ id: 4, name: "Salvo Metal Works" });
    mockApiTokenStore.create.mockImplementation(async (d: Record<string, unknown>) => stored(d));
    mockApiTokenStore.listByClient.mockResolvedValue([stored()]);
    mockApiTokenStore.revoke.mockResolvedValue(true);
  });

  describe("POST /api/clients/:id/api-tokens", () => {
    it("returns 401 when unauthenticated", async () => {
      const res = await request(buildApp()).post("/api/clients/4/api-tokens").send({ name: "x" });
      expect(res.status).toBe(401);
    });

    it.each(["analyst", "account_manager", "client_viewer"] as const)("returns 403 for %s", async (role) => {
      const res = await request(buildApp(role)).post("/api/clients/4/api-tokens").send({ name: "x" });
      expect(res.status).toBe(403);
      expect(mockApiTokenStore.create).not.toHaveBeenCalled();
    });

    it.each(["super_admin", "agency_admin"] as const)(
      "lets %s create a token, showing the raw token once and storing only its hash",
      async (role) => {
        const res = await request(buildApp(role))
          .post("/api/clients/4/api-tokens")
          .send({ name: "Reporting Suite", ttlDays: 60 });

        expect(res.status).toBe(201);
        expect(res.body.data.token).toMatch(/^wfp_[0-9a-f]{64}$/);
        expect(res.body.data).toMatchObject({ name: "Reporting Suite", clientId: 4 });
        expect(res.body.data).not.toHaveProperty("tokenHash");

        const saved = mockApiTokenStore.create.mock.calls[0][0];
        expect(saved.clientId).toBe(4);
        expect(saved.createdByUserId).toBe(3);
        expect(saved.tokenHash).toMatch(/^[0-9a-f]{64}$/);
        expect(JSON.stringify(saved)).not.toContain(res.body.data.token);
        expect(saved.tokenPrefix).toBe(res.body.data.token.slice(0, saved.tokenPrefix.length));
      }
    );

    it("defaults the lifetime to 90 days", async () => {
      await request(buildApp("agency_admin")).post("/api/clients/4/api-tokens").send({ name: "Suite" });
      const saved = mockApiTokenStore.create.mock.calls[0][0];
      const days = (saved.expiresAt - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(89.9);
      expect(days).toBeLessThanOrEqual(90);
    });

    it.each([
      ["missing name", {}],
      ["blank name", { name: "   " }],
      ["name too long", { name: "x".repeat(81) }],
      ["ttl below 1", { name: "x", ttlDays: 0 }],
      ["ttl above 365", { name: "x", ttlDays: 366 }],
      ["fractional ttl", { name: "x", ttlDays: 1.5 }],
    ])("returns 400 for %s", async (_label, body) => {
      const res = await request(buildApp("agency_admin")).post("/api/clients/4/api-tokens").send(body);
      expect(res.status).toBe(400);
      expect(mockApiTokenStore.create).not.toHaveBeenCalled();
    });

    it("returns 400 for a bad client id and 404 for an unknown client", async () => {
      expect((await request(buildApp("agency_admin")).post("/api/clients/abc/api-tokens").send({ name: "x" })).status).toBe(400);
      mockClientStore.get.mockResolvedValue(undefined);
      expect((await request(buildApp("agency_admin")).post("/api/clients/4/api-tokens").send({ name: "x" })).status).toBe(404);
      expect(mockApiTokenStore.create).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/clients/:id/api-tokens", () => {
    it("lists tokens without hashes or raw values, for admins only", async () => {
      const res = await request(buildApp("agency_admin")).get("/api/clients/4/api-tokens");
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([
        {
          id: 11, clientId: 4, name: "Reporting Suite", tokenPrefix: "wfp_abc123",
          expiresAt: 2_000_000_000_000, lastUsedAt: null, revokedAt: null, createdAt: 1_000,
        },
      ]);
      expect(JSON.stringify(res.body)).not.toContain("secret-hash");
      expect((await request(buildApp("analyst")).get("/api/clients/4/api-tokens")).status).toBe(403);
      expect((await request(buildApp()).get("/api/clients/4/api-tokens")).status).toBe(401);
    });
  });

  describe("DELETE /api/clients/:id/api-tokens/:tokenId", () => {
    it("revokes a token for the client and returns 204", async () => {
      const res = await request(buildApp("super_admin")).delete("/api/clients/4/api-tokens/11");
      expect(res.status).toBe(204);
      expect(mockApiTokenStore.revoke).toHaveBeenCalledWith(11, 4);
    });

    it("returns 404 when nothing was revoked, 400 for bad ids, 403 for non-admins", async () => {
      mockApiTokenStore.revoke.mockResolvedValue(false);
      expect((await request(buildApp("agency_admin")).delete("/api/clients/4/api-tokens/99")).status).toBe(404);
      expect((await request(buildApp("agency_admin")).delete("/api/clients/4/api-tokens/abc")).status).toBe(400);
      expect((await request(buildApp("analyst")).delete("/api/clients/4/api-tokens/11")).status).toBe(403);
    });
  });
});
