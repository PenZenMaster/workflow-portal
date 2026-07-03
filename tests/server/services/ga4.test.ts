import { describe, it, expect, vi, afterEach } from "vitest";
import {
  filterAiSearchRows,
  AI_SEARCH_REFERRERS,
  listAccountProperties,
  exchangeCode,
} from "../../../server/services/ga4";

interface SessionRow {
  sessionSource: string;
  sessions: number;
}

// ---------------------------------------------------------------------------
describe("filterAiSearchRows — AI Search channel rule", () => {
  it("classifies perplexity.ai sessions as AI Search", () => {
    const rows: SessionRow[] = [
      { sessionSource: "perplexity.ai", sessions: 100 },
      { sessionSource: "google.com", sessions: 500 },
    ];
    const filtered = filterAiSearchRows(rows);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].sessionSource).toBe("perplexity.ai");
  });

  it("classifies chatgpt.com as AI Search", () => {
    const rows: SessionRow[] = [{ sessionSource: "chatgpt.com", sessions: 42 }];
    expect(filterAiSearchRows(rows)).toHaveLength(1);
  });

  it("classifies chat.openai.com as AI Search", () => {
    const rows: SessionRow[] = [{ sessionSource: "chat.openai.com", sessions: 10 }];
    expect(filterAiSearchRows(rows)).toHaveLength(1);
  });

  it("classifies gemini.google.com as AI Search", () => {
    const rows: SessionRow[] = [{ sessionSource: "gemini.google.com", sessions: 7 }];
    expect(filterAiSearchRows(rows)).toHaveLength(1);
  });

  it("classifies copilot.microsoft.com as AI Search", () => {
    const rows: SessionRow[] = [{ sessionSource: "copilot.microsoft.com", sessions: 3 }];
    expect(filterAiSearchRows(rows)).toHaveLength(1);
  });

  it("classifies claude.ai as AI Search", () => {
    const rows: SessionRow[] = [{ sessionSource: "claude.ai", sessions: 5 }];
    expect(filterAiSearchRows(rows)).toHaveLength(1);
  });

  it("excludes non-AI referrers", () => {
    const rows: SessionRow[] = [
      { sessionSource: "google.com", sessions: 1000 },
      { sessionSource: "bing.com", sessions: 200 },
      { sessionSource: "facebook.com", sessions: 150 },
      { sessionSource: "(direct)", sessions: 300 },
    ];
    expect(filterAiSearchRows(rows)).toHaveLength(0);
  });

  it("handles mixed AI and non-AI referrers", () => {
    const rows: SessionRow[] = [
      { sessionSource: "perplexity.ai", sessions: 80 },
      { sessionSource: "google.com", sessions: 1000 },
      { sessionSource: "claude.ai", sessions: 20 },
    ];
    const filtered = filterAiSearchRows(rows);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((r) => r.sessionSource)).toContain("perplexity.ai");
    expect(filtered.map((r) => r.sessionSource)).toContain("claude.ai");
  });

  it("returns empty for empty input", () => {
    expect(filterAiSearchRows([])).toHaveLength(0);
  });

  it("AI_SEARCH_REFERRERS includes all major AI platforms", () => {
    const required = ["perplexity.ai", "chatgpt.com", "gemini.google.com", "claude.ai"];
    for (const domain of required) {
      expect(AI_SEARCH_REFERRERS).toContain(domain);
    }
  });
});

// ---------------------------------------------------------------------------
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

const VALID_CONFIG = {
  propertyId: "",
  accessToken: "valid-access-token",
  refreshToken: "refresh-token",
  tokenExpiry: Date.now() + 60 * 60 * 1000,
  connectedEmail: "user@example.com",
};

describe("listAccountProperties — GA4 Admin API", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses accountSummaries into a flat property list", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([
        {
          status: 200,
          body: {
            accountSummaries: [
              {
                displayName: "Acme Inc",
                propertySummaries: [
                  { property: "properties/111111111", displayName: "Acme - Main Site" },
                  { property: "properties/222222222", displayName: "Acme - Blog" },
                ],
              },
              {
                displayName: "Beta LLC",
                propertySummaries: [
                  { property: "properties/333333333", displayName: "Beta - Web" },
                ],
              },
            ],
          },
        },
      ])
    );

    const onRefreshed = vi.fn().mockResolvedValue(undefined);
    const result = await listAccountProperties(VALID_CONFIG, onRefreshed);

    expect(result).toEqual([
      { propertyId: "111111111", displayName: "Acme - Main Site", accountName: "Acme Inc" },
      { propertyId: "222222222", displayName: "Acme - Blog", accountName: "Acme Inc" },
      { propertyId: "333333333", displayName: "Beta - Web", accountName: "Beta LLC" },
    ]);
    expect(onRefreshed).not.toHaveBeenCalled();
  });

  it("returns an empty array when the account has no GA4 properties", async () => {
    vi.stubGlobal("fetch", mockFetch([{ status: 200, body: { accountSummaries: [] } }]));
    const result = await listAccountProperties(VALID_CONFIG, vi.fn());
    expect(result).toEqual([]);
  });

  it("follows nextPageToken and merges results across pages", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([
        {
          status: 200,
          body: {
            accountSummaries: [
              {
                displayName: "Acme Inc",
                propertySummaries: [
                  { property: "properties/111111111", displayName: "Acme - Main Site" },
                ],
              },
            ],
            nextPageToken: "page-2",
          },
        },
        {
          status: 200,
          body: {
            accountSummaries: [
              {
                displayName: "Beta LLC",
                propertySummaries: [
                  { property: "properties/333333333", displayName: "Beta - Web" },
                ],
              },
            ],
          },
        },
      ])
    );

    const result = await listAccountProperties(VALID_CONFIG, vi.fn());
    expect(result).toEqual([
      { propertyId: "111111111", displayName: "Acme - Main Site", accountName: "Acme Inc" },
      { propertyId: "333333333", displayName: "Beta - Web", accountName: "Beta LLC" },
    ]);
  });

  it("throws on a non-OK Admin API response", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([{ status: 403, body: { error: "Admin API not enabled" } }])
    );
    await expect(listAccountProperties(VALID_CONFIG, vi.fn())).rejects.toThrow(/GA4 Admin API error \(403\)/);
  });

  it("throws a checkbox-hint error when the granted scopes lack analytics.readonly", async () => {
    // Google's granular consent screen lets the user uncheck the Analytics
    // permission; the code exchange still succeeds but the token is useless.
    vi.stubGlobal(
      "fetch",
      mockFetch([
        {
          status: 200,
          body: {
            access_token: "scopeless-token",
            refresh_token: "refresh",
            expires_in: 3600,
            scope: "https://www.googleapis.com/auth/userinfo.email openid",
          },
        },
      ])
    );
    await expect(exchangeCode("auth-code")).rejects.toThrow(
      /Google Analytics/
    );
  });

  it("returns tokens when the granted scopes include analytics.readonly", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([
        {
          status: 200,
          body: {
            access_token: "good-token",
            refresh_token: "refresh",
            expires_in: 3600,
            scope:
              "https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/userinfo.email",
          },
        },
        { status: 200, body: { email: "user@example.com" } },
      ])
    );
    const tokens = await exchangeCode("auth-code");
    expect(tokens.accessToken).toBe("good-token");
    expect(tokens.connectedEmail).toBe("user@example.com");
  });

  it("tolerates a token response without a scope field", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([
        {
          status: 200,
          body: { access_token: "t", refresh_token: "r", expires_in: 3600 },
        },
        { status: 200, body: { email: "user@example.com" } },
      ])
    );
    const tokens = await exchangeCode("auth-code");
    expect(tokens.accessToken).toBe("t");
  });

  it("refreshes the access token when expired before calling the Admin API", async () => {
    const expiredConfig = { ...VALID_CONFIG, tokenExpiry: Date.now() - 1000 };
    vi.stubGlobal(
      "fetch",
      mockFetch([
        { status: 200, body: { access_token: "new-token", expires_in: 3600 } },
        { status: 200, body: { accountSummaries: [] } },
      ])
    );
    const onRefreshed = vi.fn().mockResolvedValue(undefined);
    await listAccountProperties(expiredConfig, onRefreshed);
    expect(onRefreshed).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "new-token" })
    );
  });
});
