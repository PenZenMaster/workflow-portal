/*
 * Module/Script Name: ga4.ts
 * Path: server/services/ga4.ts
 *
 * Description:
 * Google Analytics 4 Data API client using native fetch + service-account
 * JWT auth (no SDK dependency). filterAiSearchRows() is exported as a pure
 * function so the AI Search channel rule is testable independently.
 *
 * Config expected in process.env:
 *   GA4_SERVICE_ACCOUNT_KEY_PATH — path to service account JSON file
 *
 * Config expected in integration.config:
 *   propertyId — GA4 property ID (e.g. "G-XXXXXXXX" or numeric "123456789")
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-10
 * Last Modified Date: 2026-05-10
 * Comments:
 * - v1.00 Sprint 7 initial implementation
 */

import fs from "node:fs";
import crypto from "node:crypto";
import { logger } from "../logger";

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

export interface Ga4TrafficData {
  sessions: number;
  engagementRate: number;
  pagesPerSession: number;
  conversionRate: number;
  referrers: Array<{ sessionSource: string; sessions: number }>;
  fromDate: string;
  toDate: string;
}

/** Pure filter — returns only rows whose source is in AI_SEARCH_REFERRERS. */
export function filterAiSearchRows<T extends SessionRow>(rows: T[]): T[] {
  return rows.filter((r) => AI_SEARCH_REFERRERS.includes(r.sessionSource));
}

// ---------------------------------------------------------------------------
// JWT / OAuth2 helpers (service account flow)

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function signJwt(payload: Record<string, unknown>, privateKey: string): string {
  const header = base64url(Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const body = base64url(Buffer.from(JSON.stringify(payload)));
  const unsigned = `${header}.${body}`;
  const sig = base64url(
    crypto.createSign("RSA-SHA256").update(unsigned).sign(privateKey)
  );
  return `${unsigned}.${sig}`;
}

async function getAccessToken(key: ServiceAccountKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const jwt = signJwt(
    {
      iss: key.client_email,
      sub: key.client_email,
      scope: "https://www.googleapis.com/auth/analytics.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    },
    key.private_key
  );

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`GA4 token exchange failed (${resp.status}): ${text}`);
  }

  const { access_token } = (await resp.json()) as { access_token: string };
  return access_token;
}

// ---------------------------------------------------------------------------

export class Ga4Service {
  private loadKey(): ServiceAccountKey {
    const keyPath = process.env.GA4_SERVICE_ACCOUNT_KEY_PATH;
    if (!keyPath || !fs.existsSync(keyPath)) {
      throw new Error(
        "GA4_SERVICE_ACCOUNT_KEY_PATH is not set or does not exist. " +
          "Set this env var to the path of your GA4 service account JSON file."
      );
    }
    return JSON.parse(fs.readFileSync(keyPath, "utf-8")) as ServiceAccountKey;
  }

  async getAiTraffic(
    config: Record<string, unknown>,
    fromDate: string,
    toDate: string
  ): Promise<Ga4TrafficData> {
    const propertyId = String(config.propertyId ?? "");
    if (!propertyId) throw new Error("GA4 integration config missing propertyId");

    const key = this.loadKey();
    const token = await getAccessToken(key);

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
        Authorization: `Bearer ${token}`,
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
        ? aiRows.reduce((s, r) => s + ((r.engagementRate as number) ?? 0), 0) /
          aiRows.length
        : 0;
    const avgPages =
      aiRows.length > 0
        ? aiRows.reduce((s, r) => s + ((r.pagesPerSession as number) ?? 0), 0) /
          aiRows.length
        : 0;

    logger.info("ga4: traffic fetched", {
      propertyId,
      aiSessions: totalSessions,
      referrers: aiRows.length,
    });

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
