/*
 * Module/Script Name: sourceDomains.routes.test.ts
 * Path: tests/server/sourceDomains.routes.test.ts
 *
 * Description:
 * Route tests for the source-domain registry API: list with class
 * filter, upsert with validation (registry classes only - ownership
 * classes are derived, never stored), unreviewed queue, and RBAC.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-14
 * Last Modified Date: 2026-07-14
 * Comments:
 * - v1.00 YLG defensibility sprint - source registry slice
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { buildAuthApp } from "./_helpers/buildAuthApp";

// --- mocks ------------------------------------------------------------------

const mockSourceDomainStore = {
  list: vi.fn(),
  getByDomain: vi.fn(),
  upsert: vi.fn(),
  getMapForDomains: vi.fn(),
  listUnreviewed: vi.fn(),
  seedDefaults: vi.fn(),
};

vi.mock("../../server/storage", () => ({
  sourceDomainStore: mockSourceDomainStore,
}));

const { registerSourceDomainRoutes } = await import("../../server/routes/sourceDomains");

// ---------------------------------------------------------------------------

function buildApp(role?: "super_admin" | "agency_admin" | "analyst" | "account_manager" | "client_viewer") {
  return buildAuthApp((app) => registerSourceDomainRoutes(app), role ? { role } : {});
}

const SAMPLE_DOMAIN = {
  id: 1,
  rootDomain: "yelp.com",
  sourceClass: "review_platform" as const,
  rationale: "Consumer review platform",
  classifiedBy: "seed",
  createdAt: 1,
  updatedAt: 1,
};

describe("GET /api/source-domains", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the registry for admins", async () => {
    mockSourceDomainStore.list.mockResolvedValue([SAMPLE_DOMAIN]);
    const res = await request(buildApp("agency_admin")).get("/api/source-domains");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].rootDomain).toBe("yelp.com");
    expect(mockSourceDomainStore.list).toHaveBeenCalledWith({});
  });

  it("passes a valid class filter through and rejects an invalid one", async () => {
    mockSourceDomainStore.list.mockResolvedValue([]);
    const ok = await request(buildApp("super_admin")).get(
      "/api/source-domains?class=review_platform"
    );
    expect(ok.status).toBe(200);
    expect(mockSourceDomainStore.list).toHaveBeenCalledWith({ sourceClass: "review_platform" });

    const bad = await request(buildApp("super_admin")).get(
      "/api/source-domains?class=made_up_class"
    );
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe("INVALID_SOURCE_CLASS");
  });

  it("is forbidden for non-admin roles", async () => {
    const res = await request(buildApp("analyst")).get("/api/source-domains");
    expect(res.status).toBe(403);
  });
});

describe("PUT /api/source-domains/:domain", () => {
  beforeEach(() => vi.clearAllMocks());

  it("upserts a domain classification with rationale, recording the acting user", async () => {
    mockSourceDomainStore.upsert.mockResolvedValue({
      ...SAMPLE_DOMAIN,
      rootDomain: "bbb.org",
      sourceClass: "review_platform",
      classifiedBy: "user:1",
    });
    const res = await request(buildApp("agency_admin"))
      .put("/api/source-domains/bbb.org")
      .send({ sourceClass: "review_platform", rationale: "Better Business Bureau profiles" });
    expect(res.status).toBe(200);
    expect(res.body.data.rootDomain).toBe("bbb.org");
    expect(mockSourceDomainStore.upsert).toHaveBeenCalledWith("bbb.org", {
      sourceClass: "review_platform",
      rationale: "Better Business Bureau profiles",
      classifiedBy: "user:1",
    });
  });

  it("normalizes the domain to lowercase", async () => {
    mockSourceDomainStore.upsert.mockResolvedValue(SAMPLE_DOMAIN);
    const res = await request(buildApp("super_admin"))
      .put("/api/source-domains/Yelp.COM")
      .send({ sourceClass: "review_platform", rationale: "Review platform" });
    expect(res.status).toBe(200);
    expect(mockSourceDomainStore.upsert).toHaveBeenCalledWith(
      "yelp.com",
      expect.objectContaining({ sourceClass: "review_platform" })
    );
  });

  it("rejects ownership classes - they are derived from brand domains, never stored", async () => {
    for (const sourceClass of ["client_owned", "competitor_owned"]) {
      const res = await request(buildApp("super_admin"))
        .put("/api/source-domains/acme.com")
        .send({ sourceClass, rationale: "Should not be storable" });
      expect(res.status, sourceClass).toBe(400);
      expect(res.body.code).toBe("INVALID_INPUT");
    }
    expect(mockSourceDomainStore.upsert).not.toHaveBeenCalled();
  });

  it("rejects a malformed domain and a missing rationale", async () => {
    const badDomain = await request(buildApp("super_admin"))
      .put("/api/source-domains/not_a_domain")
      .send({ sourceClass: "review_platform", rationale: "r" });
    expect(badDomain.status).toBe(400);
    expect(badDomain.body.code).toBe("INVALID_DOMAIN");

    const noRationale = await request(buildApp("super_admin"))
      .put("/api/source-domains/ok.com")
      .send({ sourceClass: "review_platform" });
    expect(noRationale.status).toBe(400);
    expect(noRationale.body.code).toBe("INVALID_INPUT");
  });

  it("is forbidden for non-admin roles", async () => {
    const res = await request(buildApp("account_manager"))
      .put("/api/source-domains/yelp.com")
      .send({ sourceClass: "review_platform", rationale: "r" });
    expect(res.status).toBe(403);
  });
});

describe("GET /api/source-domains/unreviewed", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the unreviewed queue for admins", async () => {
    mockSourceDomainStore.listUnreviewed.mockResolvedValue([
      { rootDomain: "facebook.com", citationCount: 417 },
      { rootDomain: "reddit.com", citationCount: 274 },
    ]);
    const res = await request(buildApp("super_admin")).get("/api/source-domains/unreviewed");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      { rootDomain: "facebook.com", citationCount: 417 },
      { rootDomain: "reddit.com", citationCount: 274 },
    ]);
  });

  it("is forbidden for non-admin roles", async () => {
    const res = await request(buildApp("client_viewer")).get("/api/source-domains/unreviewed");
    expect(res.status).toBe(403);
  });
});
