import { describe, it, expect } from "vitest";
import { analyzeSources, getTopDomains } from "../../../server/services/sources";
import type { ResponseCitation } from "@shared/schema";

function citation(
  rootDomain: string,
  ownedByBrandId: number | null = null,
  position = 1
): ResponseCitation {
  return {
    id: 1,
    responseId: 1,
    url: `https://${rootDomain}/page`,
    rootDomain,
    ownedByBrandId,
    position,
    isTrustedThirdParty: false,
  };
}

const CLIENT_BRAND_ID = 1;

const CITATIONS = [
  citation("acme.com", CLIENT_BRAND_ID),
  citation("acme.com", CLIENT_BRAND_ID),
  citation("searchenginejournal.com"),
  citation("searchenginejournal.com"),
  citation("moz.com"),
  citation("rival.com", 2),
];

// ---------------------------------------------------------------------------
describe("analyzeSources", () => {
  it("counts citations per domain", () => {
    const result = analyzeSources(CITATIONS, CLIENT_BRAND_ID);
    const acme = result.domainCounts.find((d) => d.rootDomain === "acme.com");
    expect(acme?.count).toBe(2);
  });

  it("marks owned domains correctly", () => {
    const result = analyzeSources(CITATIONS, CLIENT_BRAND_ID);
    const acme = result.domainCounts.find((d) => d.rootDomain === "acme.com");
    expect(acme?.isOwnedByClient).toBe(true);
    const sej = result.domainCounts.find((d) => d.rootDomain === "searchenginejournal.com");
    expect(sej?.isOwnedByClient).toBe(false);
  });

  it("computes owned vs third-party counts", () => {
    const result = analyzeSources(CITATIONS, CLIENT_BRAND_ID);
    expect(result.ownedCount).toBe(2);
    expect(result.thirdPartyCount).toBe(4);
  });

  it("computes owned percent", () => {
    const result = analyzeSources(CITATIONS, CLIENT_BRAND_ID);
    expect(result.ownedPercent).toBeCloseTo(33.33, 1);
  });

  it("returns empty results for empty citations", () => {
    const result = analyzeSources([], CLIENT_BRAND_ID);
    expect(result.domainCounts).toHaveLength(0);
    expect(result.ownedCount).toBe(0);
    expect(result.thirdPartyCount).toBe(0);
    expect(result.ownedPercent).toBe(0);
  });
});

describe("getTopDomains", () => {
  it("returns domains sorted by count descending", () => {
    const result = getTopDomains(CITATIONS, 10);
    expect(result[0].count).toBeGreaterThanOrEqual(result[1].count);
  });

  it("respects the limit", () => {
    const result = getTopDomains(CITATIONS, 2);
    expect(result).toHaveLength(2);
  });

  it("extracts root domain correctly from a subdomain URL", () => {
    const c: ResponseCitation = {
      id: 1, responseId: 1, url: "https://blog.example.co.uk/post",
      rootDomain: "example.co.uk", ownedByBrandId: null, position: 1, isTrustedThirdParty: false,
    };
    const result = getTopDomains([c], 10);
    expect(result[0].rootDomain).toBe("example.co.uk");
  });
});
