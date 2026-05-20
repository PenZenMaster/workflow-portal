import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { buildAuthApp } from "./_helpers/buildAuthApp";

// --- mocks ------------------------------------------------------------------

const mockPlatformStore = { list: vi.fn(), get: vi.fn(), seedDefaults: vi.fn() };
const mockCollectionStore = {
  listByClient: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  clone: vi.fn(),
  activate: vi.fn(),
};
const mockPromptStore = {
  listByCollection: vi.fn(),
  create: vi.fn(),
  bulkCreate: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};
const mockStorage = { countUsers: vi.fn() };

vi.mock("../../server/storage", () => ({
  storage: mockStorage,
  platformStore: mockPlatformStore,
  promptCollectionStore: mockCollectionStore,
  promptStore: mockPromptStore,
  // Sprint 1 stores (not used in these routes but present in the barrel)
  clientStore: {},
  brandStore: {},
  aliasStore: {},
  competitorStore: {},
  clientUserStore: {},
}));

const { registerPromptRoutes } = await import("../../server/routes/prompts");

// ---------------------------------------------------------------------------

function buildApp(role?: "super_admin" | "agency_admin" | "analyst" | "account_manager" | "client_viewer") {
  return buildAuthApp(
    (app) => registerPromptRoutes(app),
    role ? { role } : {}
  );
}

const SAMPLE_COLLECTION = {
  id: 1,
  clientId: 10,
  name: "Q1 Audit",
  version: 1,
  status: "draft" as const,
  notes: null,
  parentCollectionId: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const SAMPLE_PROMPT = {
  id: 100,
  collectionId: 1,
  text: "Best SEO agency in Seattle",
  category: "category" as const,
  funnelStage: "awareness" as const,
  geo: null,
  deviceContext: null,
  priorityWeight: 1,
  status: "active" as const,
  targetPlatforms: [],
  position: 0,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const SAMPLE_PLATFORM = { id: 1, slug: "perplexity", displayName: "Perplexity", enabled: true, config: {} };

// ---------------------------------------------------------------------------
describe("GET /api/platforms", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp()).get("/api/platforms");
    expect(res.status).toBe(401);
  });

  it("returns platform list", async () => {
    mockPlatformStore.list.mockResolvedValue([SAMPLE_PLATFORM]);
    const res = await request(buildApp("agency_admin")).get("/api/platforms");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].slug).toBe("perplexity");
  });
});

describe("GET /api/clients/:clientId/prompt-collections", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp()).get("/api/clients/10/prompt-collections");
    expect(res.status).toBe(401);
  });

  it("returns collection list", async () => {
    mockCollectionStore.listByClient.mockResolvedValue([SAMPLE_COLLECTION]);
    const res = await request(buildApp("agency_admin")).get("/api/clients/10/prompt-collections");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe("POST /api/clients/:clientId/prompt-collections", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for client_viewer", async () => {
    const res = await request(buildApp("client_viewer"))
      .post("/api/clients/10/prompt-collections")
      .send({ name: "New Collection" });
    expect(res.status).toBe(403);
  });

  it("returns 400 for missing name", async () => {
    const res = await request(buildApp("agency_admin"))
      .post("/api/clients/10/prompt-collections")
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 201 with created collection", async () => {
    mockCollectionStore.create.mockResolvedValue(SAMPLE_COLLECTION);
    const res = await request(buildApp("agency_admin"))
      .post("/api/clients/10/prompt-collections")
      .send({ name: "Q1 Audit" });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe("Q1 Audit");
  });
});

describe("POST /api/prompt-collections/:id/clone", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 201 with cloned collection", async () => {
    mockCollectionStore.clone.mockResolvedValue({ ...SAMPLE_COLLECTION, id: 2, version: 2 });
    const res = await request(buildApp("agency_admin"))
      .post("/api/prompt-collections/1/clone");
    expect(res.status).toBe(201);
    expect(res.body.data.version).toBe(2);
  });

  it("returns 404 when source not found", async () => {
    mockCollectionStore.clone.mockRejectedValue(new Error("NOT_FOUND"));
    const res = await request(buildApp("agency_admin"))
      .post("/api/prompt-collections/999/clone");
    expect(res.status).toBe(404);
  });
});

describe("POST /api/prompt-collections/:id/activate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 with activated collection", async () => {
    mockCollectionStore.activate.mockResolvedValue({ ...SAMPLE_COLLECTION, status: "active" });
    const res = await request(buildApp("agency_admin"))
      .post("/api/prompt-collections/1/activate");
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("active");
  });
});

describe("GET /api/prompt-collections/:id/prompts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp()).get("/api/prompt-collections/1/prompts");
    expect(res.status).toBe(401);
  });

  it("returns prompt list", async () => {
    mockPromptStore.listByCollection.mockResolvedValue([SAMPLE_PROMPT]);
    const res = await request(buildApp("analyst")).get("/api/prompt-collections/1/prompts");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe("POST /api/prompt-collections/:id/prompts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 for invalid category", async () => {
    const res = await request(buildApp("analyst"))
      .post("/api/prompt-collections/1/prompts")
      .send({ text: "Test", category: "invalid-category" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when priority weight exceeds 10", async () => {
    const res = await request(buildApp("analyst"))
      .post("/api/prompt-collections/1/prompts")
      .send({ text: "Test", category: "category", priorityWeight: 11 });
    expect(res.status).toBe(400);
  });

  it("returns 201 with created prompt", async () => {
    mockPromptStore.create.mockResolvedValue(SAMPLE_PROMPT);
    const res = await request(buildApp("analyst"))
      .post("/api/prompt-collections/1/prompts")
      .send({ text: "Best SEO agency in Seattle", category: "category" });
    expect(res.status).toBe(201);
    expect(res.body.data.text).toBe("Best SEO agency in Seattle");
  });
});

describe("POST /api/prompt-collections/:id/prompts/bulk", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when more than 200 prompts submitted", async () => {
    const prompts = Array.from({ length: 201 }, (_, i) => ({
      text: `Prompt ${i}`,
      category: "category",
    }));
    const res = await request(buildApp("analyst"))
      .post("/api/prompt-collections/1/prompts/bulk")
      .send({ prompts });
    expect(res.status).toBe(400);
  });

  it("returns 201 with created prompts", async () => {
    mockPromptStore.bulkCreate.mockResolvedValue([SAMPLE_PROMPT, SAMPLE_PROMPT]);
    const res = await request(buildApp("analyst"))
      .post("/api/prompt-collections/1/prompts/bulk")
      .send({
        prompts: [
          { text: "Prompt 1", category: "category" },
          { text: "Prompt 2", category: "problem" },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveLength(2);
  });
});

describe("PATCH /api/prompts/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 when not found", async () => {
    mockPromptStore.update.mockResolvedValue(undefined);
    const res = await request(buildApp("analyst"))
      .patch("/api/prompts/999")
      .send({ text: "Updated", category: "brand" });
    expect(res.status).toBe(404);
  });

  it("returns 200 with updated prompt", async () => {
    mockPromptStore.update.mockResolvedValue({ ...SAMPLE_PROMPT, text: "Updated" });
    const res = await request(buildApp("analyst"))
      .patch("/api/prompts/1")
      .send({ text: "Updated", category: "brand" });
    expect(res.status).toBe(200);
    expect(res.body.data.text).toBe("Updated");
  });
});

describe("DELETE /api/prompts/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 403 for account_manager", async () => {
    const res = await request(buildApp("account_manager")).delete("/api/prompts/1");
    expect(res.status).toBe(403);
  });

  it("returns 404 when not found", async () => {
    mockPromptStore.delete.mockResolvedValue(false);
    const res = await request(buildApp("agency_admin")).delete("/api/prompts/999");
    expect(res.status).toBe(404);
  });

  it("returns 204 on success", async () => {
    mockPromptStore.delete.mockResolvedValue(true);
    const res = await request(buildApp("agency_admin")).delete("/api/prompts/1");
    expect(res.status).toBe(204);
  });
});
