import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import session from "express-session";
import { createServer } from "node:http";

// --- mocks (must be hoisted before imports that use them) -------------------

const mockStorage = {
  countUsers: vi.fn(),
  createUser: vi.fn(),
  verifyUser: vi.fn(),
  getUserById: vi.fn(),
  listWorkflows: vi.fn(),
  getWorkflow: vi.fn(),
  createWorkflow: vi.fn(),
  updateWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(),
};

vi.mock("../../server/storage", () => ({
  storage: mockStorage,
  // Sprint 2: platformStore.seedDefaults() is called in the route aggregator.
  platformStore: { seedDefaults: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("../../server/seed", () => ({ seedIfEmpty: vi.fn() }));

// Import AFTER mocks are registered
const { registerRoutes } = await import("../../server/routes");

// ---------------------------------------------------------------------------

function buildApp(authenticated = false) {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(
    session({
      secret: "test-secret-32-chars-minimum-ok",
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false },
    })
  );
  if (authenticated) {
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.session.user = { id: 1, username: "testuser", role: "agency_admin" };
      next();
    });
  }
  return app;
}

async function createTestApp(authenticated = false) {
  const app = buildApp(authenticated);
  const server = createServer(app);
  await registerRoutes(server, app);
  return app;
}

// ---------------------------------------------------------------------------

describe("GET /api/auth/status", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns needsSetup=true when no users exist", async () => {
    mockStorage.countUsers.mockResolvedValue(0);
    const app = await createTestApp();
    const res = await request(app).get("/api/auth/status");
    expect(res.status).toBe(200);
    expect(res.body.needsSetup).toBe(true);
    expect(res.body.authenticated).toBe(false);
  });

  it("returns needsSetup=false and authenticated=true when session has user", async () => {
    mockStorage.countUsers.mockResolvedValue(1);
    const app = await createTestApp(true);
    const res = await request(app).get("/api/auth/status");
    expect(res.status).toBe(200);
    expect(res.body.needsSetup).toBe(false);
    expect(res.body.authenticated).toBe(true);
    expect(res.body.user.username).toBe("testuser");
  });
});

describe("POST /api/auth/setup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates the first user and returns 201", async () => {
    mockStorage.countUsers.mockResolvedValue(0);
    mockStorage.createUser.mockResolvedValue({ id: 1, username: "admin" });
    const app = await createTestApp();
    const res = await request(app)
      .post("/api/auth/setup")
      .send({ username: "admin", password: "strongpassword1" });
    expect(res.status).toBe(201);
    expect(res.body.user.username).toBe("admin");
  });

  it("returns 403 when a user already exists", async () => {
    mockStorage.countUsers.mockResolvedValue(1);
    const app = await createTestApp();
    const res = await request(app)
      .post("/api/auth/setup")
      .send({ username: "admin", password: "strongpassword1" });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid input", async () => {
    mockStorage.countUsers.mockResolvedValue(0);
    const app = await createTestApp();
    const res = await request(app)
      .post("/api/auth/setup")
      .send({ username: "ab", password: "short" });
    expect(res.status).toBe(400);
  });

  it("returns 409 for a duplicate username", async () => {
    mockStorage.countUsers.mockResolvedValue(0);
    mockStorage.createUser.mockRejectedValue(new Error("UNIQUE constraint failed"));
    const app = await createTestApp();
    const res = await request(app)
      .post("/api/auth/setup")
      .send({ username: "admin", password: "strongpassword1" });
    expect(res.status).toBe(409);
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 and user on valid credentials", async () => {
    mockStorage.verifyUser.mockResolvedValue({ id: 1, username: "alice" });
    const app = await createTestApp();
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "alice", password: "correct" });
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe("alice");
  });

  it("returns 401 for bad credentials", async () => {
    mockStorage.verifyUser.mockResolvedValue(null);
    const app = await createTestApp();
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "alice", password: "wrong" });
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing fields", async () => {
    const app = await createTestApp();
    const res = await request(app).post("/api/auth/login").send({});
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/logout", () => {
  it("returns 200 and destroys the session", async () => {
    const app = await createTestApp(true);
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe("GET /api/workflows (auth required)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockStorage.countUsers.mockResolvedValue(1);
    const app = await createTestApp(false);
    const res = await request(app).get("/api/workflows");
    expect(res.status).toBe(401);
  });

  it("returns workflow list when authenticated", async () => {
    const wf = [{ id: 1, name: "Test" }];
    mockStorage.listWorkflows.mockResolvedValue(wf);
    const app = await createTestApp(true);
    const res = await request(app).get("/api/workflows");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(wf);
  });
});

describe("GET /api/workflows/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 for a non-numeric id", async () => {
    const app = await createTestApp(true);
    const res = await request(app).get("/api/workflows/abc");
    expect(res.status).toBe(400);
  });

  it("returns 404 when not found", async () => {
    mockStorage.getWorkflow.mockResolvedValue(undefined);
    const app = await createTestApp(true);
    const res = await request(app).get("/api/workflows/999");
    expect(res.status).toBe(404);
  });

  it("returns the workflow when found", async () => {
    mockStorage.getWorkflow.mockResolvedValue({ id: 1, name: "Found" });
    const app = await createTestApp(true);
    const res = await request(app).get("/api/workflows/1");
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Found");
  });
});

describe("POST /api/workflows", () => {
  const VALID_BODY = {
    name: "New Workflow",
    category: "Audit",
    description: "Desc",
    inputs: [],
    tags: [],
    prompt: "",
    launchUrl: "",
    launchLabel: "",
    pinned: false,
  };

  beforeEach(() => vi.clearAllMocks());

  it("returns 400 for invalid body", async () => {
    const app = await createTestApp(true);
    const res = await request(app).post("/api/workflows").send({});
    expect(res.status).toBe(400);
  });

  it("creates and returns 201", async () => {
    mockStorage.createWorkflow.mockResolvedValue({ id: 5, ...VALID_BODY });
    const app = await createTestApp(true);
    const res = await request(app).post("/api/workflows").send(VALID_BODY);
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(5);
  });
});

describe("PUT /api/workflows/:id", () => {
  const VALID_BODY = {
    name: "Updated",
    category: "Audit",
    description: "Desc",
    inputs: [],
    tags: [],
    prompt: "",
    launchUrl: "",
    launchLabel: "",
    pinned: false,
  };

  beforeEach(() => vi.clearAllMocks());

  it("returns 400 for a non-numeric id", async () => {
    const app = await createTestApp(true);
    const res = await request(app).put("/api/workflows/abc").send(VALID_BODY);
    expect(res.status).toBe(400);
  });

  it("returns 404 when the workflow does not exist", async () => {
    mockStorage.updateWorkflow.mockResolvedValue(undefined);
    const app = await createTestApp(true);
    const res = await request(app).put("/api/workflows/999").send(VALID_BODY);
    expect(res.status).toBe(404);
  });

  it("updates and returns the workflow", async () => {
    mockStorage.updateWorkflow.mockResolvedValue({ id: 1, ...VALID_BODY });
    const app = await createTestApp(true);
    const res = await request(app).put("/api/workflows/1").send(VALID_BODY);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Updated");
  });
});

describe("DELETE /api/workflows/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 for a non-numeric id", async () => {
    const app = await createTestApp(true);
    const res = await request(app).delete("/api/workflows/abc");
    expect(res.status).toBe(400);
  });

  it("returns 404 when not found", async () => {
    mockStorage.deleteWorkflow.mockResolvedValue(false);
    const app = await createTestApp(true);
    const res = await request(app).delete("/api/workflows/999");
    expect(res.status).toBe(404);
  });

  it("deletes and returns ok", async () => {
    mockStorage.deleteWorkflow.mockResolvedValue(true);
    const app = await createTestApp(true);
    const res = await request(app).delete("/api/workflows/1");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
