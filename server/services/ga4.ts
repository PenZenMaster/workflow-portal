/*
 * Module/Script Name: ga4.ts
 * Path: server/services/ga4.ts
 *
 * Description:
 * Google Analytics 4 Data API client using OAuth 2.0 with standard
 * Google accounts. Each integration stores its own refresh token so
 * multiple clients can connect different GA4 properties without any
 * Cloud IAM or service-account friction.
 *
 * Env vars required (set once, agency-side):
 *   GOOGLE_CLIENT_ID       — OAuth client ID from Google Cloud Console
 *   GOOGLE_CLIENT_SECRET   — OAuth client secret
 *   GOOGLE_REDIRECT_URI    — e.g. https://portal.example.com/api/oauth/google/callback
 *
 * Per-integration config stored in integrations.config (JSON):
 *   propertyId      — GA4 numeric or "G-XXXXX" property ID
 *   refreshToken    — stored after OAuth consent
 *   accessToken     — cached, auto-refreshed before expiry
 *   tokenExpiry     — ms timestamp when accessToken expires
 *   connectedEmail  — Google account used for the connection
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-10
 * Last Modified Date: 2026-05-10
 * Comments:
 * - v1.00 Sprint 7 initial implementation (service account)
 * - v2.00 Refactored to OAuth 2.0 — service accounts not supported by GA4
 */

import crypto from "node:crypto";
import { logger } from "../logger";

// ---------------------------------------------------------------------------
// AI Search channel rule — pure, testable, unchanged

export const AI_SEARCH_REFERRERS = [
  "perplexity.ai",
  "chatgpt.com",
  "chat.openai.com",
  "gemini.google.com",
  "copilot.microsoft.com",
  "claude.ai",
];

export interface SessionRow {
  sessionSource: string;
  sessions: number;
  [key: string]: unknown;
}

export function filterAiSearchRows<T extends SessionRow>(rows: T[]): T[] {
  return rows.filter((r) => AI_SEARCH_REFERRERS.includes(r.sessionSource));
}

// ---------------------------------------------------------------------------
// OAuth helpers

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

/** Build a signed state token to prevent CSRF in the OAuth callback. */
export function buildOAuthState(clientId: number, userId: number): string {
  const data = `${clientId}:${userId}:${Date.now()}`;
  const sig = crypto
    .createHmac("sha256", process.env.SESSION_SECRET ?? "insecure")
    .update(data)
    .digest("hex");
  return Buffer.from(`${data}:${sig}`).toString("base64url");
}

/** Verify the state token. Returns { clientId, userId } or null if invalid. */
export function parseOAuthState(
  state: string
): { clientId: number; userId: number } | null {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const parts = decoded.split(":");
    if (parts.length !== 4) return null;
    const [rawClientId, rawUserId, , sig] = parts;
    const data = `${rawClientId}:${rawUserId}:${parts[2]}`;
    const expected = crypto
      .createHmac("sha256", process.env.SESSION_SECRET ?? "insecure")
      .update(data)
      .digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex")))
      return null;
    return { clientId: Number(rawClientId), userId: Number(rawUserId) };
  } catch {
    return null;
  }
}

/** Build the Google OAuth consent URL. */
export function buildAuthUrl(state: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? "";
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params}`;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenExpiry: number;
  connectedEmail: string;
}

/** Exchange an authorization code for tokens + fetch the user's email. */
export async function exchangeCode(code: string): Promise<OAuthTokens> {
  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: process.env.GOOGLE_REDIRECT_URI ?? "",
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Google token exchange failed (${resp.status}): ${text}`);
  }

  const tokenData = (await resp.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  if (!tokenData.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. " +
        "Revoke app access at myaccount.google.com/permissions and try again."
    );
  }

  // Fetch the connected account email.
  const userResp = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const { email = "unknown" } = userResp.ok
    ? ((await userResp.json()) as { email?: string })
    : {};

  return {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    tokenExpiry: Date.now() + tokenData.expires_in * 1000,
    connectedEmail: email,
  };
}

/**
 * Return a fresh access token for the given integration config.
 * If the stored token is expired (within 60s), exchanges the refresh token
 * and calls onRefreshed so the caller can persist the new token to the DB.
 */
export async function getOrRefreshAccessToken(
  config: Record<string, unknown>,
  onRefreshed: (updated: Record<string, unknown>) => Promise<void>
): Promise<string> {
  const { accessToken, refreshToken, tokenExpiry } = config as {
    accessToken?: string;
    refreshToken?: string;
    tokenExpiry?: number;
  };

  if (accessToken && tokenExpiry && tokenExpiry > Date.now() + 60_000) {
    return accessToken;
  }

  if (!refreshToken) {
    throw new Error("Not connected. Please click Connect Google Analytics.");
  }

  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Google token refresh failed (${resp.status}): ${text}`);
  }

  const data = (await resp.json()) as { access_token: string; expires_in: number };
  const updated = {
    ...config,
    accessToken: data.access_token,
    tokenExpiry: Date.now() + data.expires_in * 1000,
  };
  await onRefreshed(updated);
  return data.access_token;
}

// ---------------------------------------------------------------------------
// GA4 Data API

export interface Ga4TrafficData {
  sessions: number;
  engagementRate: number;
  pagesPerSession: number;
  conversionRate: number;
  referrers: Array<{ sessionSource: string; sessions: number }>;
  fromDate: string;
  toDate: string;
}

export class Ga4Service {
  async getAiTraffic(
    config: Record<string, unknown>,
    fromDate: string,
    toDate: string,
    onTokenRefreshed: (updated: Record<string, unknown>) => Promise<void>
  ): Promise<Ga4TrafficData> {
    const propertyId = String(config.propertyId ?? "");
    if (!propertyId) {
      throw new Error("GA4 property ID not set. Enter it in the Integrations page.");
    }

    const accessToken = await getOrRefreshAccessToken(config, onTokenRefreshed);

    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
    const body = {
      dateRanges: [{ startDate: fromDate, endDate: toDate }],
      dimensions: [{ name: "sessionSource" }],
      metrics: [
        { name: "sessions" },
        { name: "engagementRate" },
        { name: "screenPageViewsPerSession" },
        { name: "conversions" },
      ],
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`GA4 API error (${resp.status}): ${text}`);
    }

    const data = (await resp.json()) as {
      rows?: Array<{
        dimensionValues: Array<{ value: string }>;
        metricValues: Array<{ value: string }>;
      }>;
    };

    const rows: SessionRow[] = (data.rows ?? []).map((r) => ({
      sessionSource: r.dimensionValues[0]?.value ?? "",
      sessions: parseInt(r.metricValues[0]?.value ?? "0", 10),
      engagementRate: parseFloat(r.metricValues[1]?.value ?? "0"),
      pagesPerSession: parseFloat(r.metricValues[2]?.value ?? "0"),
      conversions: parseInt(r.metricValues[3]?.value ?? "0", 10),
    }));

    const aiRows = filterAiSearchRows(rows);
    const totalSessions = aiRows.reduce((s, r) => s + r.sessions, 0);
    const totalConversions = aiRows.reduce(
      (s, r) => s + ((r.conversions as number) ?? 0),
      0
    );
    const avgEngagement =
      aiRows.length > 0
        ? aiRows.reduce((s, r) => s + ((r.engagementRate as number) ?? 0), 0) / aiRows.length
        : 0;
    const avgPages =
      aiRows.length > 0
        ? aiRows.reduce((s, r) => s + ((r.pagesPerSession as number) ?? 0), 0) / aiRows.length
        : 0;

    logger.info("ga4: traffic fetched", { propertyId, aiSessions: totalSessions });

    return {
      sessions: totalSessions,
      engagementRate: Math.round(avgEngagement * 1000) / 1000,
      pagesPerSession: Math.round(avgPages * 100) / 100,
      conversionRate:
        totalSessions > 0
          ? Math.round((totalConversions / totalSessions) * 1000) / 1000
          : 0,
      referrers: aiRows.map((r) => ({
        sessionSource: r.sessionSource,
        sessions: r.sessions,
      })),
      fromDate,
      toDate,
    };
  }
}
