import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { buildAuthApp } from "./_helpers/buildAuthApp";
import { AppError } from "../../server/errors";

// --- mocks ------------------------------------------------------------------

const mockPlatformStore = {
  list: vi.fn(),
  get: vi.fn(),
  getBySlug: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  countResponses: vi.fn(),
  seedDefaults: vi.fn(),
};
const mockCollectionStore = {
  listByClient: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  clone: vi.fn(),
  activate: vi.fn(),
  setStatus: vi.fn(),
  countRuns: vi.fn(),
  delete: vi.fn(),
};
const mockPromptStore = {
  listByCollection: vi.fn(),
  create: vi.fn(),
  bulkCreate: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};
const mockStorage = { countUsers: vi.fn() };
const mockClientStore = { get: vi.fn() };
const mockBrandStore = { listByClient: vi.fn() };
const mockGenerationRunStore = {
  create: vi.fn().mockResolvedValue({ id: 55 }),
  get: vi.fn(),
  listByCollection: vi.fn(),
};

vi.mock("../../server/storage", () => ({
  storage: mockStorage,
  platformStore: mockPlatformStore,
  promptCollectionStore: mockCollectionStore,
  promptStore: mockPromptStore,
  clientStore: mockClientStore,
  brandStore: mockBrandStore,
  promptMethodologyStore: { getActive: vi.fn().mockResolvedValue({ version: "1.0" }) },
  promptGenerationRunStore: mockGenerationRunStore,
  // Sprint 1 stores (not used in these routes but present in the barrel)
  aliasStore: {},
  competitorStore: {},
  clientUserStore: {},
}));

const mockGeneratePrompts = vi.fn();
vi.mock("../../server/services/promptGenerator", () => ({
  generatePrompts: mockGeneratePrompts,
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
  panelType: "balanced_baseline" as const,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const SAMPLE_CLIENT = {
  id: 10,
  name: "Acme Plumbing",
  primaryDomain: "acmeplumbing.com",
  geographies: ["Seattle, WA"],
  exclusions: ["septic services"],
  coreServices: ["drain cleaning"],
  ownerUserId: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const SAMPLE_PROMPT = {
  id: 100,
  collectionId: 1,
  text: "Best SEO agency in Seattle",
  category: "commercial" as const,
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

// ---------------------------------------------------------------------------
describe("POST /api/platforms", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp())
      .post("/api/platforms")
      .send({ slug: "custom-llm", displayName: "Custom LLM" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for analyst role", async () => {
    const res = await request(buildApp("analyst"))
      .post("/api/platforms")
      .send({ slug: "custom-llm", displayName: "Custom LLM" });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid slug", async () => {
    const res = await request(buildApp("agency_admin"))
      .post("/api/platforms")
      .send({ slug: "Custom LLM!", displayName: "Custom LLM" });
    expect(res.status).toBe(400);
  });

  it("returns 409 when slug already exists", async () => {
    mockPlatformStore.getBySlug.mockResolvedValue(SAMPLE_PLATFORM);
    const res = await request(buildApp("agency_admin"))
      .post("/api/platforms")
      .send({ slug: "perplexity", displayName: "Perplexity Again" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("DUPLICATE_SLUG");
  });

  it("creates a custom platform", async () => {
    mockPlatformStore.getBySlug.mockResolvedValue(undefined);
    mockPlatformStore.create.mockResolvedValue({
      id: 8, slug: "custom-llm", displayName: "Custom LLM", enabled: true, config: { model: "v1" },
    });
    const res = await request(buildApp("super_admin"))
      .post("/api/platforms")
      .send({ slug: "custom-llm", displayName: "Custom LLM", config: { model: "v1" } });
    expect(res.status).toBe(201);
    expect(res.body.data.slug).toBe("custom-llm");
    expect(mockPlatformStore.create).toHaveBeenCalledWith({
      slug: "custom-llm", displayName: "Custom LLM", config: { model: "v1" },
    });
  });
});

// ---------------------------------------------------------------------------
describe("PATCH /api/platforms/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp()).patch("/api/platforms/1").send({ enabled: false });
    expect(res.status).toBe(401);
  });

  it("returns 403 for analyst role", async () => {
    const res = await request(buildApp("analyst")).patch("/api/platforms/1").send({ enabled: false });
    expect(res.status).toBe(403);
  });

  it("returns 404 when platform not found", async () => {
    mockPlatformStore.update.mockResolvedValue(undefined);
    const res = await request(buildApp("agency_admin")).patch("/api/platforms/999").send({ enabled: false });
    expect(res.status).toBe(404);
  });

  it("updates a platform", async () => {
    mockPlatformStore.update.mockResolvedValue({
      id: 1, slug: "perplexity", displayName: "Perplexity", enabled: false, config: {},
    });
    const res = await request(buildApp("agency_admin")).patch("/api/platforms/1").send({ enabled: false });
    expect(res.status).toBe(200);
    expect(res.body.data.enabled).toBe(false);
    expect(mockPlatformStore.update).toHaveBeenCalledWith(1, { enabled: false });
  });
});

// ---------------------------------------------------------------------------
describe("DELETE /api/platforms/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp()).delete("/api/platforms/1");
    expect(res.status).toBe(401);
  });

  it("returns 403 for analyst role", async () => {
    const res = await request(buildApp("analyst")).delete("/api/platforms/1");
    expect(res.status).toBe(403);
  });

  it("returns 404 when platform not found", async () => {
    mockPlatformStore.get.mockResolvedValue(undefined);
    const res = await request(buildApp("agency_admin")).delete("/api/platforms/999");
    expect(res.status).toBe(404);
  });

  it("returns 409 when the platform has responses", async () => {
    mockPlatformStore.get.mockResolvedValue(SAMPLE_PLATFORM);
    mockPlatformStore.countResponses.mockResolvedValue(3);
    const res = await request(buildApp("agency_admin")).delete("/api/platforms/1");
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PLATFORM_IN_USE");
    expect(mockPlatformStore.delete).not.toHaveBeenCalled();
  });

  it("deletes a platform with no responses", async () => {
    mockPlatformStore.get.mockResolvedValue(SAMPLE_PLATFORM);
    mockPlatformStore.countResponses.mockResolvedValue(0);
    mockPlatformStore.delete.mockResolvedValue(true);
    const res = await request(buildApp("agency_admin")).delete("/api/platforms/1");
    expect(res.status).toBe(204);
    expect(mockPlatformStore.delete).toHaveBeenCalledWith(1);
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

describe("POST /api/prompt-collections/:id/archive", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 with the archived collection", async () => {
    mockCollectionStore.setStatus.mockResolvedValue({ ...SAMPLE_COLLECTION, status: "archived" });
    const res = await request(buildApp("analyst"))
      .post("/api/prompt-collections/1/archive");
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("archived");
    expect(mockCollectionStore.setStatus).toHaveBeenCalledWith(1, "archived");
  });

  it("returns 404 when the collection does not exist", async () => {
    mockCollectionStore.setStatus.mockResolvedValue(undefined);
    const res = await request(buildApp("agency_admin"))
      .post("/api/prompt-collections/999/archive");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("COLLECTION_NOT_FOUND");
  });

  it("returns 403 for client_viewer", async () => {
    const res = await request(buildApp("client_viewer"))
      .post("/api/prompt-collections/1/archive");
    expect(res.status).toBe(403);
  });
});

describe("POST /api/prompt-collections/:id/unarchive", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 with the collection back in draft", async () => {
    mockCollectionStore.setStatus.mockResolvedValue({ ...SAMPLE_COLLECTION, status: "draft" });
    const res = await request(buildApp("analyst"))
      .post("/api/prompt-collections/1/unarchive");
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("draft");
    expect(mockCollectionStore.setStatus).toHaveBeenCalledWith(1, "draft");
  });
});

describe("DELETE /api/prompt-collections/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 204 and deletes when no runs reference the collection", async () => {
    mockCollectionStore.get.mockResolvedValue(SAMPLE_COLLECTION);
    mockCollectionStore.countRuns.mockResolvedValue(0);
    mockCollectionStore.delete.mockResolvedValue(true);
    const res = await request(buildApp("agency_admin"))
      .delete("/api/prompt-collections/1");
    expect(res.status).toBe(204);
    expect(mockCollectionStore.delete).toHaveBeenCalledWith(1);
  });

  it("returns 409 COLLECTION_IN_USE when runs reference the collection", async () => {
    mockCollectionStore.get.mockResolvedValue(SAMPLE_COLLECTION);
    mockCollectionStore.countRuns.mockResolvedValue(3);
    const res = await request(buildApp("agency_admin"))
      .delete("/api/prompt-collections/1");
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("COLLECTION_IN_USE");
    expect(mockCollectionStore.delete).not.toHaveBeenCalled();
  });

  it("returns 404 when the collection does not exist", async () => {
    mockCollectionStore.get.mockResolvedValue(undefined);
    const res = await request(buildApp("agency_admin"))
      .delete("/api/prompt-collections/999");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("COLLECTION_NOT_FOUND");
  });

  it("returns 403 for analyst (delete is admin-only)", async () => {
    const res = await request(buildApp("analyst"))
      .delete("/api/prompt-collections/1");
    expect(res.status).toBe(403);
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
      .send({ text: "Test", category: "commercial", priorityWeight: 11 });
    expect(res.status).toBe(400);
  });

  it("returns 201 with created prompt", async () => {
    mockPromptStore.create.mockResolvedValue(SAMPLE_PROMPT);
    const res = await request(buildApp("analyst"))
      .post("/api/prompt-collections/1/prompts")
      .send({ text: "Best SEO agency in Seattle", category: "commercial" });
    expect(res.status).toBe(201);
    expect(res.body.data.text).toBe("Best SEO agency in Seattle");
  });

  it("recomputes brandContext/brandInPrompt from the actual text, overriding a stale client-supplied value (issue #4 Phase 2 item 8)", async () => {
    mockCollectionStore.get.mockResolvedValue(SAMPLE_COLLECTION); // clientId 10
    mockBrandStore.listByClient.mockResolvedValue([
      { id: 1, clientId: 10, canonicalName: "Acme Plumbing", kind: "client", primaryDomain: null, createdAt: Date.now() },
    ]);
    mockPromptStore.create.mockResolvedValue(SAMPLE_PROMPT);

    await request(buildApp("analyst"))
      .post("/api/prompt-collections/1/prompts")
      .send({
        text: "Is Acme Plumbing a good choice?",
        category: "informational",
        brandContext: "unbranded",
        brandInPrompt: false,
      });

    expect(mockPromptStore.create).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ brandContext: "client_branded", brandInPrompt: true })
    );
  });

  it("derives category from intentType, overriding a stale client-supplied category (issue #4 Phase 3 item I)", async () => {
    mockPromptStore.create.mockResolvedValue(SAMPLE_PROMPT);

    await request(buildApp("analyst"))
      .post("/api/prompt-collections/1/prompts")
      .send({ text: "Who repairs water heaters in Tacoma?", category: "informational", intentType: "geographic_discovery" });

    expect(mockPromptStore.create).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ category: "local" })
    );
  });

  it("creates successfully without a category when intentType is provided (issue #4 Phase 3 item I)", async () => {
    mockPromptStore.create.mockResolvedValue(SAMPLE_PROMPT);

    const res = await request(buildApp("analyst"))
      .post("/api/prompt-collections/1/prompts")
      .send({ text: "Who repairs water heaters in Tacoma?", intentType: "geographic_discovery" });

    expect(res.status).toBe(201);
    expect(mockPromptStore.create).toHaveBeenCalledWith(1, expect.objectContaining({ category: "local" }));
  });

  it("leaves client-supplied category untouched when intentType is not provided (backward compatible)", async () => {
    mockPromptStore.create.mockResolvedValue(SAMPLE_PROMPT);

    await request(buildApp("analyst"))
      .post("/api/prompt-collections/1/prompts")
      .send({ text: "Best SEO agency in Seattle", category: "commercial" });

    expect(mockPromptStore.create).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ category: "commercial" })
    );
  });
});

describe("POST /api/prompt-collections/:id/prompts/bulk", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when more than 200 prompts submitted", async () => {
    const prompts = Array.from({ length: 201 }, (_, i) => ({
      text: `Prompt ${i}`,
      category: "commercial",
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
          { text: "Prompt 1", category: "commercial" },
          { text: "Prompt 2", category: "informational" },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveLength(2);
  });

  it("recomputes brandContext/brandInPrompt for every prompt in the batch, overriding stale client-supplied values (issue #4 Phase 2 item 8)", async () => {
    mockCollectionStore.get.mockResolvedValue(SAMPLE_COLLECTION);
    mockBrandStore.listByClient.mockResolvedValue([
      { id: 1, clientId: 10, canonicalName: "Acme Plumbing", kind: "client", primaryDomain: null, createdAt: Date.now() },
      { id: 2, clientId: 10, canonicalName: "Best Plumbers Inc", kind: "competitor", primaryDomain: null, createdAt: Date.now() },
    ]);
    mockPromptStore.bulkCreate.mockResolvedValue([SAMPLE_PROMPT, SAMPLE_PROMPT]);

    await request(buildApp("analyst"))
      .post("/api/prompt-collections/1/prompts/bulk")
      .send({
        prompts: [
          { text: "Is Acme Plumbing reputable?", category: "informational", brandContext: "unbranded" },
          { text: "Alternatives to Best Plumbers Inc", category: "alternative", brandContext: "unbranded" },
        ],
      });

    const [, promptsArg] = mockPromptStore.bulkCreate.mock.calls[0];
    expect(promptsArg[0]).toMatchObject({ brandContext: "client_branded", brandInPrompt: true });
    expect(promptsArg[1]).toMatchObject({ brandContext: "competitor_branded", brandInPrompt: false });
  });

  it("derives category from intentType for every prompt in the batch (issue #4 Phase 3 item I)", async () => {
    mockPromptStore.bulkCreate.mockResolvedValue([SAMPLE_PROMPT, SAMPLE_PROMPT]);

    await request(buildApp("analyst"))
      .post("/api/prompt-collections/1/prompts/bulk")
      .send({
        prompts: [
          { text: "Prompt 1", category: "commercial", intentType: "brand_validation" },
          { text: "Prompt 2", category: "informational", intentType: "alternative" },
        ],
      });

    const [, promptsArg] = mockPromptStore.bulkCreate.mock.calls[0];
    expect(promptsArg[0]).toMatchObject({ category: "informational" });
    expect(promptsArg[1]).toMatchObject({ category: "alternative" });
  });
});

describe("POST /api/clients/:clientId/prompt-collections/:id/generate-prompts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp())
      .post("/api/clients/10/prompt-collections/1/generate-prompts")
      .send({});
    expect(res.status).toBe(401);
  });

  it("returns 403 for client_viewer", async () => {
    const res = await request(buildApp("client_viewer"))
      .post("/api/clients/10/prompt-collections/1/generate-prompts")
      .send({});
    expect(res.status).toBe(403);
  });

  it("returns 404 when client not found", async () => {
    mockClientStore.get.mockResolvedValue(undefined);
    const res = await request(buildApp("analyst"))
      .post("/api/clients/999/prompt-collections/1/generate-prompts")
      .send({});
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("CLIENT_NOT_FOUND");
  });

  it("returns 404 when collection not found", async () => {
    mockClientStore.get.mockResolvedValue(SAMPLE_CLIENT);
    mockCollectionStore.get.mockResolvedValue(undefined);
    const res = await request(buildApp("analyst"))
      .post("/api/clients/10/prompt-collections/999/generate-prompts")
      .send({});
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("COLLECTION_NOT_FOUND");
  });

  it("returns 404 when the collection belongs to a different client (FR-01)", async () => {
    mockClientStore.get.mockResolvedValue({ ...SAMPLE_CLIENT, id: 11 });
    mockCollectionStore.get.mockResolvedValue(SAMPLE_COLLECTION); // clientId 10
    const res = await request(buildApp("analyst"))
      .post("/api/clients/11/prompt-collections/1/generate-prompts")
      .send({});
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("COLLECTION_NOT_FOUND");
    expect(mockGeneratePrompts).not.toHaveBeenCalled();
  });

  it("returns 503 when no generation adapter is configured", async () => {
    mockClientStore.get.mockResolvedValue(SAMPLE_CLIENT);
    mockCollectionStore.get.mockResolvedValue(SAMPLE_COLLECTION);
    mockBrandStore.listByClient.mockResolvedValue([]);
    mockPromptStore.listByCollection.mockResolvedValue([]);
    mockGeneratePrompts.mockRejectedValue(
      new AppError(503, "No AI platform is configured for prompt generation", "NO_GENERATION_ADAPTER")
    );
    const res = await request(buildApp("analyst"))
      .post("/api/clients/10/prompt-collections/1/generate-prompts")
      .send({});
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("NO_GENERATION_ADAPTER");
  });

  it("returns 200 with candidates, invalid diagnostics, and warnings", async () => {
    mockClientStore.get.mockResolvedValue(SAMPLE_CLIENT);
    mockCollectionStore.get.mockResolvedValue(SAMPLE_COLLECTION);
    mockBrandStore.listByClient.mockResolvedValue([
      { id: 1, clientId: 10, canonicalName: "Acme Plumbing", kind: "client", primaryDomain: "acmeplumbing.com", createdAt: Date.now() },
      { id: 2, clientId: 10, canonicalName: "Best Plumbers Inc", kind: "competitor", primaryDomain: null, createdAt: Date.now() },
    ]);
    mockPromptStore.listByCollection.mockResolvedValue([SAMPLE_PROMPT]);
    mockGeneratePrompts.mockResolvedValue({
      candidates: [
        {
          text: "Who fixes leaky faucets in Seattle?",
          category: "problem_aware",
          funnelStage: "awareness",
          intentType: "problem_solution",
          brandInPrompt: false,
          service: "drain cleaning",
          geo: "Seattle, WA",
          rationale: "Problem-to-provider connection",
        },
      ],
      invalid: [{ item: { text: "" }, errors: ["Prompt text is required"] }],
      warnings: ["Only 1 of 5 requested prompts were valid"],
      provenance: { adapterSlug: "openai", modelVariant: "gpt-4o-mini", rawText: "RAW_LLM_OUTPUT" },
    });

    const res = await request(buildApp("analyst"))
      .post("/api/clients/10/prompt-collections/1/generate-prompts")
      .send({ count: 5 });

    expect(res.status).toBe(200);
    expect(res.body.data.candidates).toHaveLength(1);
    expect(res.body.data.invalid).toHaveLength(1);
    expect(res.body.data.warnings).toHaveLength(1);
    expect(mockGeneratePrompts).toHaveBeenCalledWith({
      clientName: "Acme Plumbing",
      primaryDomain: "acmeplumbing.com",
      geographies: ["Seattle, WA"],
      clientBrandNames: ["Acme Plumbing"],
      competitorNames: ["Best Plumbers Inc"],
      coreServices: ["drain cleaning"],
      exclusions: ["septic services"],
      existingPromptTexts: ["Best SEO agency in Seattle"],
      existingPromptCells: [],
      count: 5,
      panelType: "balanced_baseline",
    });
  });

  it("passes the collection's panelType through to generation (issue #4 Phase 3 item 9)", async () => {
    mockClientStore.get.mockResolvedValue(SAMPLE_CLIENT);
    mockCollectionStore.get.mockResolvedValue({ ...SAMPLE_COLLECTION, panelType: "discovery" });
    mockBrandStore.listByClient.mockResolvedValue([]);
    mockPromptStore.listByCollection.mockResolvedValue([]);
    mockGeneratePrompts.mockResolvedValue({
      candidates: [],
      invalid: [],
      warnings: [],
      provenance: { adapterSlug: "openai", modelVariant: "gpt-4o-mini", rawText: "RAW_LLM_OUTPUT" },
    });

    await request(buildApp("analyst"))
      .post("/api/clients/10/prompt-collections/1/generate-prompts")
      .send({ count: 5 });

    const context = mockGeneratePrompts.mock.calls[0][0];
    expect(context.panelType).toBe("discovery");
  });

  it("passes existing prompts' measurement cells through for duplicate-cell detection (issue #4 Phase 2 item 7), excluding unclassified prompts", async () => {
    mockClientStore.get.mockResolvedValue(SAMPLE_CLIENT);
    mockCollectionStore.get.mockResolvedValue(SAMPLE_COLLECTION);
    mockBrandStore.listByClient.mockResolvedValue([]);
    mockPromptStore.listByCollection.mockResolvedValue([
      {
        ...SAMPLE_PROMPT,
        id: 101,
        intentType: "provider_recommendation",
        service: "drain cleaning",
        geo: "Seattle, WA",
        brandContext: "unbranded",
      },
      { ...SAMPLE_PROMPT, id: 102, intentType: null, brandContext: null }, // unclassified - excluded
    ]);
    mockGeneratePrompts.mockResolvedValue({
      candidates: [],
      invalid: [],
      warnings: [],
      provenance: { adapterSlug: "openai", modelVariant: "gpt-4o-mini", rawText: "RAW_LLM_OUTPUT" },
    });

    await request(buildApp("analyst"))
      .post("/api/clients/10/prompt-collections/1/generate-prompts")
      .send({ count: 5 });

    const context = mockGeneratePrompts.mock.calls[0][0];
    expect(context.existingPromptCells).toEqual([
      { intentType: "provider_recommendation", service: "drain cleaning", geo: "Seattle, WA", brandContext: "unbranded" },
    ]);
  });

  it("persists a generation run with provenance and returns generationRunId (E2c)", async () => {
    mockClientStore.get.mockResolvedValue(SAMPLE_CLIENT);
    mockCollectionStore.get.mockResolvedValue(SAMPLE_COLLECTION);
    mockBrandStore.listByClient.mockResolvedValue([]);
    mockPromptStore.listByCollection.mockResolvedValue([]);
    mockGeneratePrompts.mockResolvedValue({
      candidates: [
        {
          text: "Who fixes leaky faucets in Seattle?",
          category: "problem_aware",
          funnelStage: "awareness",
          intentType: "problem_solution",
          brandInPrompt: false,
          service: null,
          geo: null,
          rationale: null,
        },
      ],
      invalid: [{ item: { text: "" }, errors: ["Prompt text is required"] }],
      warnings: [],
      provenance: { adapterSlug: "openai", modelVariant: "gpt-4o-mini", rawText: "RAW_LLM_OUTPUT" },
    });

    const res = await request(buildApp("analyst"))
      .post("/api/clients/10/prompt-collections/1/generate-prompts")
      .send({ count: 5 });

    expect(res.status).toBe(200);
    expect(res.body.data.generationRunId).toBe(55);
    expect(mockGenerationRunStore.create).toHaveBeenCalledTimes(1);
    const run = mockGenerationRunStore.create.mock.calls[0][0];
    expect(run).toMatchObject({
      clientId: 10,
      collectionId: 1,
      requestedCount: 5,
      adapterSlug: "openai",
      modelVariant: "gpt-4o-mini",
      methodologyVersion: "1.0",
      rawOutput: "RAW_LLM_OUTPUT",
      validCount: 1,
      invalidCount: 1,
    });
    expect(run.contextSnapshot).toContain("Acme Plumbing");
    expect(run.invalidItems).toHaveLength(1);
  });
});

describe("GET /api/prompt-collections/:id/generation-runs (E2c)", () => {
  beforeEach(() => vi.clearAllMocks());

  const SAMPLE_GEN_RUN = {
    id: 55,
    clientId: 10,
    collectionId: 1,
    requestedCount: 12,
    adapterSlug: "openai",
    modelVariant: "gpt-4o-mini",
    methodologyVersion: "1.0",
    contextSnapshot: "{}",
    rawOutput: "RAW",
    validCount: 10,
    invalidCount: 2,
    warnings: [],
    invalidItems: [],
    createdByUserId: 1,
    createdAt: Date.now(),
  };

  it("returns 401 when not authenticated", async () => {
    const res = await request(buildApp()).get("/api/prompt-collections/1/generation-runs");
    expect(res.status).toBe(401);
  });

  it("returns 403 for client_viewer", async () => {
    const res = await request(buildApp("client_viewer")).get("/api/prompt-collections/1/generation-runs");
    expect(res.status).toBe(403);
  });

  it("returns the collection's generation runs", async () => {
    mockGenerationRunStore.listByCollection.mockResolvedValue([SAMPLE_GEN_RUN]);
    const res = await request(buildApp("analyst")).get("/api/prompt-collections/1/generation-runs");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].adapterSlug).toBe("openai");
    expect(mockGenerationRunStore.listByCollection).toHaveBeenCalledWith(1);
  });

  it("returns run detail by id including raw output and diagnostics", async () => {
    mockGenerationRunStore.get.mockResolvedValue(SAMPLE_GEN_RUN);
    const res = await request(buildApp("analyst")).get("/api/generation-runs/55");
    expect(res.status).toBe(200);
    expect(res.body.data.rawOutput).toBe("RAW");
    expect(res.body.data.methodologyVersion).toBe("1.0");
  });

  it("returns 404 GENERATION_RUN_NOT_FOUND for a missing run", async () => {
    mockGenerationRunStore.get.mockResolvedValue(undefined);
    const res = await request(buildApp("analyst")).get("/api/generation-runs/999");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("GENERATION_RUN_NOT_FOUND");
  });

  it("returns 403 for client_viewer on run detail", async () => {
    const res = await request(buildApp("client_viewer")).get("/api/generation-runs/55");
    expect(res.status).toBe(403);
  });
});

describe("POST /api/prompt-collections/:id/prompts/bulk — generationRunId (E2c)", () => {
  beforeEach(() => vi.clearAllMocks());

  const BULK_PROMPT = { text: "Who fixes leaky faucets?", category: "problem_aware" };

  it("passes generationRunId through to bulkCreate so saved prompts are stamped", async () => {
    mockPromptStore.bulkCreate.mockResolvedValue([{ ...SAMPLE_PROMPT, generationRunId: 42 }]);
    const res = await request(buildApp("analyst"))
      .post("/api/prompt-collections/1/prompts/bulk")
      .send({ prompts: [BULK_PROMPT], generationRunId: 42 });
    expect(res.status).toBe(201);
    expect(mockPromptStore.bulkCreate).toHaveBeenCalledWith(
      1,
      expect.arrayContaining([expect.objectContaining({ text: "Who fixes leaky faucets?" })]),
      42
    );
  });

  it("omits the run id for manual bulk imports", async () => {
    mockPromptStore.bulkCreate.mockResolvedValue([SAMPLE_PROMPT]);
    const res = await request(buildApp("analyst"))
      .post("/api/prompt-collections/1/prompts/bulk")
      .send({ prompts: [BULK_PROMPT] });
    expect(res.status).toBe(201);
    expect(mockPromptStore.bulkCreate).toHaveBeenCalledWith(
      1,
      expect.anything(),
      undefined
    );
  });
});

describe("PATCH /api/prompts/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 when not found", async () => {
    mockPromptStore.update.mockResolvedValue(undefined);
    const res = await request(buildApp("analyst"))
      .patch("/api/prompts/999")
      .send({ text: "Updated", category: "informational" });
    expect(res.status).toBe(404);
  });

  it("returns 200 with updated prompt", async () => {
    mockPromptStore.update.mockResolvedValue({ ...SAMPLE_PROMPT, text: "Updated" });
    const res = await request(buildApp("analyst"))
      .patch("/api/prompts/1")
      .send({ text: "Updated", category: "informational" });
    expect(res.status).toBe(200);
    expect(res.body.data.text).toBe("Updated");
  });

  it("derives category from intentType, overriding a stale client-supplied category (issue #4 Phase 3 item I)", async () => {
    mockPromptStore.update.mockResolvedValue(SAMPLE_PROMPT);

    await request(buildApp("analyst"))
      .patch("/api/prompts/1")
      .send({ text: "Updated", category: "informational", intentType: "geographic_discovery" });

    expect(mockPromptStore.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ category: "local" })
    );
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
