import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

function mockFetch(responses: Array<{ status: number; body: unknown }>) {
  let call = 0;
  return vi.fn().mockImplementation(async () => {
    const { status, body } = responses[Math.min(call++, responses.length - 1)];
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  });
}

const TOKEN_RESPONSE = { access_token: "gbp-access-token", expires_in: 3600 };

beforeEach(() => {
  vi.stubEnv("GBP_OAUTH_CLIENT_ID", "gbp-client-id");
  vi.stubEnv("GBP_OAUTH_CLIENT_SECRET", "gbp-client-secret");
  vi.stubEnv("GBP_OAUTH_REFRESH_TOKEN", "gbp-refresh-token");
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("getGbpConfig / isGbpConfigured", () => {
  it("returns the config when all three env vars are set", async () => {
    const { getGbpConfig } = await import("../../../server/services/gbp");
    expect(getGbpConfig()).toEqual({
      clientId: "gbp-client-id",
      clientSecret: "gbp-client-secret",
      refreshToken: "gbp-refresh-token",
    });
  });

  it("returns undefined when any env var is missing", async () => {
    vi.stubEnv("GBP_OAUTH_REFRESH_TOKEN", "");
    const { getGbpConfig } = await import("../../../server/services/gbp");
    expect(getGbpConfig()).toBeUndefined();
  });

  it("isGbpConfigured mirrors getGbpConfig presence", async () => {
    vi.stubEnv("GBP_OAUTH_CLIENT_ID", "");
    const { isGbpConfigured } = await import("../../../server/services/gbp");
    expect(isGbpConfigured()).toBe(false);
  });
});

describe("listAccounts", () => {
  it("throws when GBP is not configured", async () => {
    vi.stubEnv("GBP_OAUTH_CLIENT_ID", "");
    const { listAccounts } = await import("../../../server/services/gbp");
    await expect(listAccounts()).rejects.toThrow(/not configured/);
  });

  it("refreshes a token then fetches accounts, returning the accounts array", async () => {
    const f = mockFetch([
      { status: 200, body: TOKEN_RESPONSE },
      { status: 200, body: { accounts: [{ name: "accounts/1", accountName: "Acme", type: "LOCATION_GROUP" }] } },
    ]);
    vi.stubGlobal("fetch", f);

    const { listAccounts } = await import("../../../server/services/gbp");
    const accounts = await listAccounts();

    expect(accounts).toEqual([{ name: "accounts/1", accountName: "Acme", type: "LOCATION_GROUP" }]);
    expect(f).toHaveBeenCalledTimes(2);
    const tokenCall = f.mock.calls[0];
    expect(tokenCall[0]).toBe("https://oauth2.googleapis.com/token");
    const accountsCall = f.mock.calls[1];
    expect(accountsCall[0]).toBe("https://mybusinessbusinessinformation.googleapis.com/v1/accounts");
    expect((accountsCall[1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer gbp-access-token",
    });
  });

  it("returns an empty array when the response has no accounts field", async () => {
    const f = mockFetch([{ status: 200, body: TOKEN_RESPONSE }, { status: 200, body: {} }]);
    vi.stubGlobal("fetch", f);

    const { listAccounts } = await import("../../../server/services/gbp");
    expect(await listAccounts()).toEqual([]);
  });

  it("throws with the response body when the accounts call fails", async () => {
    const f = mockFetch([
      { status: 200, body: TOKEN_RESPONSE },
      { status: 403, body: { error: { message: "PERMISSION_DENIED" } } },
    ]);
    vi.stubGlobal("fetch", f);

    const { listAccounts } = await import("../../../server/services/gbp");
    await expect(listAccounts()).rejects.toThrow(/403/);
  });

  it("throws when the token refresh itself fails", async () => {
    const f = mockFetch([{ status: 401, body: { error: "invalid_grant" } }]);
    vi.stubGlobal("fetch", f);

    const { listAccounts } = await import("../../../server/services/gbp");
    await expect(listAccounts()).rejects.toThrow(/token refresh failed/i);
  });
});

describe("listLocations", () => {
  it("fetches locations for the given account name", async () => {
    const f = mockFetch([
      { status: 200, body: TOKEN_RESPONSE },
      { status: 200, body: { locations: [{ name: "accounts/1/locations/2", title: "Main St" }] } },
    ]);
    vi.stubGlobal("fetch", f);

    const { listLocations } = await import("../../../server/services/gbp");
    const locations = await listLocations("accounts/1");

    expect(locations).toEqual([{ name: "accounts/1/locations/2", title: "Main St" }]);
    const url = f.mock.calls[1][0] as string;
    expect(url).toContain("/accounts/1/locations");
    expect(url).toContain("readMask=");
  });
});

describe("getLocationSnapshot", () => {
  const RAW_LOCATION = {
    name: "accounts/1/locations/2",
    title: "Acme HVAC - Main St",
    categories: {
      primaryCategory: { displayName: "HVAC contractor" },
      additionalCategories: [{ displayName: "Furnace repair service" }],
    },
    storefrontAddress: {
      addressLines: ["123 Main St"],
      locality: "Springfield",
      administrativeArea: "OH",
      postalCode: "45501",
    },
    serviceArea: { businessType: "CUSTOMER_LOCATION_ONLY" },
    phoneNumbers: { primaryPhone: "+1 555-0100" },
    websiteUri: "https://acmehvac.example.com",
    profile: { description: "24/7 HVAC repair." },
    regularHours: { periods: [{ openDay: "MONDAY", openTime: "08:00", closeDay: "MONDAY", closeTime: "17:00" }] },
    metadata: { placeId: "ChIJ-real-place-id" },
  };

  it("maps the raw API response into the documented snapshot shape", async () => {
    const f = mockFetch([
      { status: 200, body: TOKEN_RESPONSE },
      { status: 200, body: RAW_LOCATION },
    ]);
    vi.stubGlobal("fetch", f);

    const { getLocationSnapshot } = await import("../../../server/services/gbp");
    const snapshot = await getLocationSnapshot("accounts/1/locations/2");

    expect(snapshot).toEqual({
      locationId: "2",
      title: "Acme HVAC - Main St",
      primaryCategory: "HVAC contractor",
      additionalCategories: ["Furnace repair service"],
      address: RAW_LOCATION.storefrontAddress,
      serviceArea: RAW_LOCATION.serviceArea,
      phone: "+1 555-0100",
      websiteUri: "https://acmehvac.example.com",
      profileDescription: "24/7 HVAC repair.",
      regularHours: RAW_LOCATION.regularHours,
      placeId: "ChIJ-real-place-id",
    });
  });

  it("fills missing optional fields with null/empty defaults rather than throwing", async () => {
    const f = mockFetch([
      { status: 200, body: TOKEN_RESPONSE },
      { status: 200, body: { name: "accounts/1/locations/3", title: "Bare Location" } },
    ]);
    vi.stubGlobal("fetch", f);

    const { getLocationSnapshot } = await import("../../../server/services/gbp");
    const snapshot = await getLocationSnapshot("accounts/1/locations/3");

    expect(snapshot).toEqual({
      locationId: "3",
      title: "Bare Location",
      primaryCategory: null,
      additionalCategories: [],
      address: null,
      serviceArea: null,
      phone: null,
      websiteUri: null,
      profileDescription: null,
      regularHours: null,
      placeId: null,
    });
  });
});
