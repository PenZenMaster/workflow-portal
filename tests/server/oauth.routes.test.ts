/*
 * Module/Script Name: oauth.routes.test.ts
 * Path: tests/server/oauth.routes.test.ts
 *
 * Description:
 * Integration tests for the Google OAuth callback route.
 * Verifies the popup SPA redirect flow: callback redirects to
 * /#/oauth/popup?type=success|error so the SPA page handles
 * postMessage + window.close() without CSP-blocked inline scripts.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-20
 * Last Modified Date: 2026-05-20
 * Comments:
 * - v1.00 Initial popup postMessage flow tests
 * - v1.01 Updated to SPA redirect flow (fixes CSP inline-script block)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { buildAuthApp } from "./_helpers/buildAuthApp";

const mockIntegrationStore = {
  listByClient: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
  updateStatus: vi.fn(),
  updateConfig: vi.fn(),
};

vi.mock("../../server/storage", () => ({
  storage: { countUsers: vi.fn() },
  platformStore: { seedDefaults: vi.fn().mockResolvedValue(undefined) },
  integrationStore: mockIntegrationStore,
  citationStore: {},
  mentionStore: {},
  sentimentStore: {},
  shareTokenStore: {},
  exportStore: {},
  clientStore: {},
  brandStore: {},
  aliasStore: {},
  competitorStore: {},
  clientUserStore: {},
  promptStore: {},
  promptCollectionStore: {},
  runStore: {},
  scheduleStore: {},
  responseStore: {},
  annotationStore: {},
  metricStore: {},
}));

const mockExchangeCode = vi.fn();
const mockParseOAuthState = vi.fn();

vi.mock("../../server/services/ga4", () => ({
  exchangeCode: mockExchangeCode,
  parseOAuthState: mockParseOAuthState,
  buildAuthUrl: vi.fn().mockReturnValue("https://accounts.google.com/o/oauth2/auth"),
  buildOAuthState: vi.fn().mockReturnValue("state-token"),
  AI_SEARCH_REFERRERS: [],
  filterAiSearchRows: vi.fn(),
  Ga4Service: vi.fn(),
}));

vi.mock("../../server/jobs/runner", () => ({
  jobRunner: { enqueue: vi.fn(), register: vi.fn() },
}));

const { registerOAuthRoutes } = await import("../../server/routes/oauth");

function buildApp() {
  return buildAuthApp((app) => registerOAuthRoutes(app), { role: "agency_admin" });
}

const SAMPLE_TOKENS = {
  accessToken: "tok_access",
  refreshToken: "tok_refresh",
  tokenExpiry: Date.now() + 3600000,
  connectedEmail: "user@example.com",
};

describe("GET /api/oauth/google/callback — popup SPA redirect flow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects to /#/oauth/popup?type=success on successful new connection", async () => {
    mockParseOAuthState.mockReturnValue({ clientId: 42, userId: 1 });
    mockExchangeCode.mockResolvedValue(SAMPLE_TOKENS);
    mockIntegrationStore.listByClient.mockResolvedValue([]);
    mockIntegrationStore.create.mockResolvedValue({ id: 1 });

    const res = await request(buildApp())
      .get("/api/oauth/google/callback")
      .query({ code: "auth_code", state: "valid_state" });

    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/#\/oauth\/popup\?type=success/);
    expect(res.headers.location).toContain("clientId=42");
  });

  it("redirects to /#/oauth/popup?type=error when OAuth is denied by user", async () => {
    const res = await request(buildApp())
      .get("/api/oauth/google/callback")
      .query({ error: "access_denied", state: "valid_state" });

    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/#\/oauth\/popup\?type=error/);
  });

  it("redirects to /#/oauth/popup?type=error when state parameter is invalid", async () => {
    mockParseOAuthState.mockReturnValue(null);

    const res = await request(buildApp())
      .get("/api/oauth/google/callback")
      .query({ code: "auth_code", state: "tampered_state" });

    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/#\/oauth\/popup\?type=error/);
  });

  it("redirects to /#/oauth/popup?type=error when token exchange throws", async () => {
    mockParseOAuthState.mockReturnValue({ clientId: 42, userId: 1 });
    mockExchangeCode.mockRejectedValue(new Error("network error"));

    const res = await request(buildApp())
      .get("/api/oauth/google/callback")
      .query({ code: "auth_code", state: "valid_state" });

    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/#\/oauth\/popup\?type=error/);
  });

  it("updates existing integration tokens on reconnect, preserving propertyId", async () => {
    const existing = {
      id: 7, clientId: 42, kind: "ga4",
      config: { propertyId: "99887766", refreshToken: "old_tok" },
      status: "failing", lastSyncedAt: null, lastError: "invalid_grant",
    };
    mockParseOAuthState.mockReturnValue({ clientId: 42, userId: 1 });
    mockExchangeCode.mockResolvedValue(SAMPLE_TOKENS);
    mockIntegrationStore.listByClient.mockResolvedValue([existing]);
    mockIntegrationStore.updateStatus.mockResolvedValue(undefined);
    mockIntegrationStore.updateConfig.mockResolvedValue(undefined);

    const res = await request(buildApp())
      .get("/api/oauth/google/callback")
      .query({ code: "auth_code", state: "valid_state" });

    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/#\/oauth\/popup\?type=success/);
    expect(mockIntegrationStore.updateConfig).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        refreshToken: "tok_refresh",
        propertyId: "99887766",
      })
    );
    expect(mockIntegrationStore.create).not.toHaveBeenCalled();
  });
});
