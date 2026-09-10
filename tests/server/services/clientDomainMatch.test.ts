import { describe, it, expect } from "vitest";
import { normalizeHost, matchClientForBaseUrl } from "../../../server/services/clientDomainMatch";
import type { Client } from "@shared/schema";

function client(overrides: Partial<Client> = {}): Client {
  return {
    id: 1,
    name: "Sample Client",
    primaryDomain: "example.com",
    geographies: [],
    exclusions: [],
    coreServices: [],
    ownerUserId: null,
    rankrocketSiteKey: null,
    gbpLocationName: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("normalizeHost", () => {
  it("strips protocol", () => {
    expect(normalizeHost("https://example.com")).toBe("example.com");
    expect(normalizeHost("http://example.com")).toBe("example.com");
  });

  it("strips a leading www.", () => {
    expect(normalizeHost("https://www.example.com")).toBe("example.com");
  });

  it("strips a trailing path/slash", () => {
    expect(normalizeHost("https://example.com/")).toBe("example.com");
    expect(normalizeHost("https://example.com/wp-json/rankrocket-seo/v1")).toBe("example.com");
  });

  it("lowercases", () => {
    expect(normalizeHost("https://Example.COM")).toBe("example.com");
  });

  it("accepts a bare domain with no protocol", () => {
    expect(normalizeHost("example.com")).toBe("example.com");
  });

  it("does not strip a subdomain other than www", () => {
    expect(normalizeHost("https://shop.example.com")).toBe("shop.example.com");
  });
});

describe("matchClientForBaseUrl", () => {
  it("returns matched with the single client whose primaryDomain matches, ignoring protocol/www/trailing-slash", () => {
    const trevor = client({ id: 4, name: "Trevor Aspiranti", primaryDomain: "tristate-hvac.com" });
    const result = matchClientForBaseUrl("https://www.tristate-hvac.com/", [trevor]);
    expect(result).toEqual({ status: "matched", client: trevor });
  });

  it("returns no_match when no client's domain matches", () => {
    const result = matchClientForBaseUrl("https://tristate-hvac.com", [
      client({ id: 1, primaryDomain: "overheaddoorjoliet.com" }),
    ]);
    expect(result).toEqual({ status: "no_match" });
  });

  it("returns no_match for a subdomain that doesn't exactly match a client's domain", () => {
    const result = matchClientForBaseUrl("https://shop.tristate-hvac.com", [
      client({ id: 1, primaryDomain: "tristate-hvac.com" }),
    ]);
    expect(result).toEqual({ status: "no_match" });
  });

  it("returns ambiguous when more than one client shares the same normalized domain", () => {
    const a = client({ id: 1, name: "A", primaryDomain: "tristate-hvac.com" });
    const b = client({ id: 2, name: "B", primaryDomain: "www.tristate-hvac.com" });
    const result = matchClientForBaseUrl("https://tristate-hvac.com", [a, b]);
    expect(result).toEqual({ status: "ambiguous", clients: [a, b] });
  });

  it("returns no_match for an empty client list", () => {
    expect(matchClientForBaseUrl("https://tristate-hvac.com", [])).toEqual({ status: "no_match" });
  });
});
