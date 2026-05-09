import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createServer } from "node:http";
import { buildAuthApp } from "./_helpers/buildAuthApp";

// --- mocks (hoisted before imports that use them) ---------------------------

const mockClientStore = {
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};
const mockBrandStore = {
  listByClient: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};
const mockAliasStore = {
  listByBrand: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
};
const mockCompetitorStore = {
  listByClient: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
};
const mockClientUserStore = {
  listByClient: vi.fn(),
  grant: vi.fn(),
  revoke: vi.fn(),
  canAccess: vi.fn(),
};
const mockStorage = {
  countUsers: vi.fn(),
  listWorkflows: vi.fn(),
};

vi.mock("../../server/storage", () => ({
  storage: mockStorage,
  clientStore: mockClientStore,
  brandStore: mockBrandStore,
  aliasStore: mockAliasStore,
  competitorStore: mockCompetitorStore,
  clientUserStore: mockClientUserStore,
}));

// Import AFTER mocks are registered
const { registerClientRoutes } = await import("../../server/routes/clients");

// ---------------------------------------------------------------------------

function buildApp(role?: "super_admin" | "agency_admin" | "analyst" | "account_manager" | "client_viewer") {
  return buildAuthApp(
    (app) => {
      const server = createServer(app);
      void server; // registerClientRoutes only needs Express app
      registerClientRoutes(app);
    },
    role ? { role } : {}
  );
}

const SAMPLE_CLIENT = {
  id: 1,
  name: "Acme Corp",
  primaryDomain: "acme.com",
  geographies: [],
  exclusions: [],
  ownerUserId: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const SAMPLE_BRAND = {
  id: 10,
  clientId: 1,
  canonicalName: "Acme Corp",
  kind: "client" as const,
  primaryDomain: "acme.com",
  createdAt: Date.now(),
};

// ---------------------------------------------------------------------------
describe("GET /api/clients", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp()).get("/api/clients");
    expect(res.status).toBe(401);
  });

  it("returns 200 with empty list for agency_admin", async () => {
    mockClientStore.list.mockResolvedValue([]);
    const res = await request(buildApp("agency_admin")).get("/api/clients");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("returns client list", async () => {
    mockClientStore.list.mockResolvedValue([SAMPLE_CLIENT]);
    const res = await request(buildApp("agency_admin")).get("/api/clients");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe("Acme Corp");
  });
});

describe("POST /api/clients", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp()).post("/api/clients").send({ name: "Acme", primaryDomain: "acme.com" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for analyst role", async () => {
    const res = await request(buildApp("analyst")).post("/api/clients").send({ name: "Acme", primaryDomain: "acme.com" });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid body", async () => {
    const res = await request(buildApp("agency_admin")).post("/api/clients").send({});
    expect(res.status).toBe(400);
  });

  it("returns 201 with created client", async () => {
    mockClientStore.create.mockResolvedValue(SAMPLE_CLIENT);
    const res = await request(buildApp("agency_admin"))
      .post("/api/clients")
      .send({ name: "Acme Corp", primaryDomain: "acme.com" });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe("Acme Corp");
  });
});

describe("GET /api/clients/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp()).get("/api/clients/1");
    expect(res.status).toBe(401);
  });

  it("returns 404 when client not found", async () => {
    mockClientStore.get.mockResolvedValue(undefined);
    const res = await request(buildApp("agency_admin")).get("/api/clients/999");
    expect(res.status).toBe(404);
  });

  it("returns 200 with client data", async () => {
    mockClientStore.get.mockResolvedValue(SAMPLE_CLIENT);
    const res = await request(buildApp("agency_admin")).get("/api/clients/1");
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Acme Corp");
  });

  it("returns 400 for non-numeric id", async () => {
    const res = await request(buildApp("agency_admin")).get("/api/clients/abc");
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/clients/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for analyst", async () => {
    const res = await request(buildApp("analyst"))
      .patch("/api/clients/1")
      .send({ name: "Updated", primaryDomain: "new.com" });
    expect(res.status).toBe(403);
  });

  it("returns 404 when client not found", async () => {
    mockClientStore.update.mockResolvedValue(undefined);
    const res = await request(buildApp("agency_admin"))
      .patch("/api/clients/999")
      .send({ name: "Updated", primaryDomain: "new.com" });
    expect(res.status).toBe(404);
  });

  it("returns 200 with updated client", async () => {
    mockClientStore.update.mockResolvedValue({ ...SAMPLE_CLIENT, name: "Updated" });
    const res = await request(buildApp("agency_admin"))
      .patch("/api/clients/1")
      .send({ name: "Updated", primaryDomain: "new.com" });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Updated");
  });
});

describe("DELETE /api/clients/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for analyst", async () => {
    const res = await request(buildApp("analyst")).delete("/api/clients/1");
    expect(res.status).toBe(403);
  });

  it("returns 404 when not found", async () => {
    mockClientStore.delete.mockResolvedValue(false);
    const res = await request(buildApp("agency_admin")).delete("/api/clients/999");
    expect(res.status).toBe(404);
  });

  it("returns 204 on success", async () => {
    mockClientStore.delete.mockResolvedValue(true);
    const res = await request(buildApp("agency_admin")).delete("/api/clients/1");
    expect(res.status).toBe(204);
  });
});

describe("GET /api/clients/:id/brands", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp()).get("/api/clients/1/brands");
    expect(res.status).toBe(401);
  });

  it("returns 200 with brand list", async () => {
    mockBrandStore.listByClient.mockResolvedValue([SAMPLE_BRAND]);
    const res = await request(buildApp("agency_admin")).get("/api/clients/1/brands");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe("POST /api/clients/:id/brands", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for client_viewer", async () => {
    const res = await request(buildApp("client_viewer"))
      .post("/api/clients/1/brands")
      .send({ canonicalName: "Acme", kind: "client" });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid body", async () => {
    const res = await request(buildApp("agency_admin"))
      .post("/api/clients/1/brands")
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 201 with created brand", async () => {
    mockBrandStore.create.mockResolvedValue(SAMPLE_BRAND);
    const res = await request(buildApp("agency_admin"))
      .post("/api/clients/1/brands")
      .send({ canonicalName: "Acme Corp", kind: "client" });
    expect(res.status).toBe(201);
    expect(res.body.data.canonicalName).toBe("Acme Corp");
  });
});

describe("POST /api/clients/:id/competitors", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 201 with competitor data", async () => {
    mockBrandStore.create.mockResolvedValue({ ...SAMPLE_BRAND, kind: "competitor" });
    mockCompetitorStore.create.mockResolvedValue({
      id: 1, clientId: 1, brandId: 10, priority: 0,
    });
    const res = await request(buildApp("agency_admin"))
      .post("/api/clients/1/competitors")
      .send({ canonicalName: "Rival Co", priority: 0 });
    expect(res.status).toBe(201);
  });
});

describe("POST /api/clients/:id/users", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for analyst", async () => {
    const res = await request(buildApp("analyst"))
      .post("/api/clients/1/users")
      .send({ userId: 2 });
    expect(res.status).toBe(403);
  });

  it("returns 201 on successful grant", async () => {
    mockClientUserStore.grant.mockResolvedValue(undefined);
    const res = await request(buildApp("agency_admin"))
      .post("/api/clients/1/users")
      .send({ userId: 2 });
    expect(res.status).toBe(201);
    expect(res.body.data.ok).toBe(true);
  });
});
