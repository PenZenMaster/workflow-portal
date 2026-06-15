import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockListByClientBrand,
  mockListByBrandAlias,
  mockListByClientCollection,
  mockListByCollectionPrompt,
  mockClientList,
} = vi.hoisted(() => ({
  mockListByClientBrand: vi.fn(),
  mockListByBrandAlias: vi.fn(),
  mockListByClientCollection: vi.fn(),
  mockListByCollectionPrompt: vi.fn(),
  mockClientList: vi.fn(),
}));

vi.mock("../../../server/storage", () => ({
  brandStore: { listByClient: mockListByClientBrand },
  aliasStore: { listByBrand: mockListByBrandAlias },
  promptCollectionStore: { listByClient: mockListByClientCollection },
  promptStore: { listByCollection: mockListByCollectionPrompt },
  clientStore: { list: mockClientList },
}));

import {
  computeReadiness,
  computeReadinessForAllClients,
} from "../../../server/services/clientReadiness";

const CLIENT_BRAND = { id: 1, clientId: 10, canonicalName: "Acme", kind: "client" as const, primaryDomain: "acme.com", createdAt: 0 };
const COMPETITOR_BRAND = { id: 2, clientId: 10, canonicalName: "Rival", kind: "competitor" as const, primaryDomain: null, createdAt: 0 };
const ALIAS = { id: 1, brandId: 2, aliasText: "Rival Co", matchType: "exact" as const, language: null };
const ACTIVE_COLLECTION = { id: 5, clientId: 10, name: "Q1", version: 1, status: "active" as const, notes: null, parentCollectionId: null, createdAt: 0, updatedAt: 0 };
const DRAFT_COLLECTION = { id: 6, clientId: 10, name: "Draft", version: 1, status: "draft" as const, notes: null, parentCollectionId: null, createdAt: 0, updatedAt: 0 };
const PROMPT = { id: 1, collectionId: 5, text: "x", category: "informational" as const, funnelStage: "awareness" as const, geo: null, deviceContext: null, priorityWeight: 1, status: "active" as const, targetPlatforms: [], position: 0, createdAt: 0, updatedAt: 0 };

describe("clientReadiness", () => {
  beforeEach(() => {
    mockListByClientBrand.mockReset();
    mockListByBrandAlias.mockReset();
    mockListByClientCollection.mockReset();
    mockListByCollectionPrompt.mockReset();
    mockClientList.mockReset();
  });

  describe("computeReadiness", () => {
    it("is ready when a client brand, an aliased competitor, and an active collection with prompts exist", async () => {
      mockListByClientBrand.mockResolvedValue([CLIENT_BRAND, COMPETITOR_BRAND]);
      mockListByBrandAlias.mockResolvedValue([ALIAS]);
      mockListByClientCollection.mockResolvedValue([ACTIVE_COLLECTION, DRAFT_COLLECTION]);
      mockListByCollectionPrompt.mockResolvedValue([PROMPT]);

      const result = await computeReadiness(10);

      expect(result).toEqual({
        clientId: 10,
        hasClientBrand: true,
        competitorBrandCount: 1,
        competitorBrandsWithAliasCount: 1,
        hasActivePromptCollectionWithPrompts: true,
        ready: true,
        issues: [],
      });
    });

    it("flags a missing client brand", async () => {
      mockListByClientBrand.mockResolvedValue([COMPETITOR_BRAND]);
      mockListByBrandAlias.mockResolvedValue([ALIAS]);
      mockListByClientCollection.mockResolvedValue([ACTIVE_COLLECTION]);
      mockListByCollectionPrompt.mockResolvedValue([PROMPT]);

      const result = await computeReadiness(10);

      expect(result.hasClientBrand).toBe(false);
      expect(result.ready).toBe(false);
      expect(result.issues).toContain("No client brand defined");
    });

    it("flags missing competitor brands as an AI Share of Voice risk", async () => {
      mockListByClientBrand.mockResolvedValue([CLIENT_BRAND]);
      mockListByBrandAlias.mockResolvedValue([]);
      mockListByClientCollection.mockResolvedValue([ACTIVE_COLLECTION]);
      mockListByCollectionPrompt.mockResolvedValue([PROMPT]);

      const result = await computeReadiness(10);

      expect(result.competitorBrandCount).toBe(0);
      expect(result.ready).toBe(false);
      expect(result.issues).toContain("No competitor brands defined - AI Share of Voice will be meaningless");
    });

    it("flags competitor brands that have no aliases configured", async () => {
      mockListByClientBrand.mockResolvedValue([CLIENT_BRAND, COMPETITOR_BRAND]);
      mockListByBrandAlias.mockResolvedValue([]);
      mockListByClientCollection.mockResolvedValue([ACTIVE_COLLECTION]);
      mockListByCollectionPrompt.mockResolvedValue([PROMPT]);

      const result = await computeReadiness(10);

      expect(result.competitorBrandsWithAliasCount).toBe(0);
      expect(result.ready).toBe(false);
      expect(result.issues).toContain("Competitor brands have no aliases configured");
    });

    it("flags missing an active prompt collection with prompts", async () => {
      mockListByClientBrand.mockResolvedValue([CLIENT_BRAND, COMPETITOR_BRAND]);
      mockListByBrandAlias.mockResolvedValue([ALIAS]);
      mockListByClientCollection.mockResolvedValue([DRAFT_COLLECTION]);
      mockListByCollectionPrompt.mockResolvedValue([]);

      const result = await computeReadiness(10);

      expect(result.hasActivePromptCollectionWithPrompts).toBe(false);
      expect(result.ready).toBe(false);
      expect(result.issues).toContain("No active prompt collection with prompts");
    });
  });

  describe("computeReadinessForAllClients", () => {
    it("returns readiness for every client", async () => {
      mockClientList.mockResolvedValue([
        { id: 10, name: "Acme", primaryDomain: "acme.com", geographies: [], exclusions: [], ownerUserId: null, createdAt: 0, updatedAt: 0 },
        { id: 11, name: "Beta", primaryDomain: "beta.com", geographies: [], exclusions: [], ownerUserId: null, createdAt: 0, updatedAt: 0 },
      ]);
      mockListByClientBrand.mockResolvedValue([]);
      mockListByBrandAlias.mockResolvedValue([]);
      mockListByClientCollection.mockResolvedValue([]);
      mockListByCollectionPrompt.mockResolvedValue([]);

      const result = await computeReadinessForAllClients();

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.clientId)).toEqual([10, 11]);
      expect(result.every((r) => r.ready === false)).toBe(true);
    });
  });
});
