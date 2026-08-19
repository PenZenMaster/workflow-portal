/*
 * Module/Script Name: gbp.ts
 * Path: server/services/gbp.ts
 *
 * Description:
 * Google Business Profile (Business Information API) client using a single
 * shared OAuth credential - unlike GA4's per-client OAuth connection, one
 * Google account already has manager access to every currently-mapped
 * client's GBP location (verified live 2026-08-18: list_accounts() against
 * this same credential returned 15 real accounts). No per-client token
 * storage, no OAuth popup - the access token is cached in-memory at module
 * level since there is only ever one shared token.
 *
 * Env vars required (set once, agency-side):
 *   GBP_OAUTH_CLIENT_ID       - OAuth client ID from Google Cloud Console
 *   GBP_OAUTH_CLIENT_SECRET   - OAuth client secret
 *   GBP_OAUTH_REFRESH_TOKEN   - refresh token for the already-authorized account
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-18
 * Last Modified Date: 2026-08-18
 * Comments:
 * - v1.00 Initial implementation
 */

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GBP_BASE_URL = "https://mybusinessbusinessinformation.googleapis.com/v1";

const LOCATION_READ_MASK = [
  "name",
  "title",
  "categories",
  "serviceArea",
  "storefrontAddress",
  "phoneNumbers",
  "websiteUri",
  "profile",
  "regularHours",
  "serviceItems",
  "metadata.placeId",
].join(",");

export interface GbpConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export function getGbpConfig(): GbpConfig | undefined {
  const clientId = process.env.GBP_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GBP_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GBP_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return undefined;
  return { clientId, clientSecret, refreshToken };
}

export function isGbpConfigured(): boolean {
  return getGbpConfig() !== undefined;
}

let cachedAccessToken: string | undefined;
let cachedExpiry: number | undefined;

async function getAccessToken(): Promise<string> {
  const config = getGbpConfig();
  if (!config) {
    throw new Error(
      "GBP is not configured (missing GBP_OAUTH_CLIENT_ID/GBP_OAUTH_CLIENT_SECRET/GBP_OAUTH_REFRESH_TOKEN)"
    );
  }

  if (cachedAccessToken && cachedExpiry && cachedExpiry > Date.now() + 60_000) {
    return cachedAccessToken;
  }

  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: config.refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`GBP token refresh failed (${resp.status}): ${text}`);
  }

  const data = (await resp.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = data.access_token;
  cachedExpiry = Date.now() + data.expires_in * 1000;
  return cachedAccessToken;
}

async function gbpGet<T>(path: string): Promise<T> {
  const accessToken = await getAccessToken();
  const resp = await fetch(`${GBP_BASE_URL}/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`GBP request failed (${resp.status}): ${text}`);
  }
  return (await resp.json()) as T;
}

export interface GbpAccount {
  name: string;
  accountName: string;
  type: string;
}

export async function listAccounts(): Promise<GbpAccount[]> {
  const data = await gbpGet<{ accounts?: GbpAccount[] }>("accounts");
  return data.accounts ?? [];
}

export interface GbpLocation {
  name: string;
  title: string;
}

export async function listLocations(accountName: string): Promise<GbpLocation[]> {
  const data = await gbpGet<{ locations?: GbpLocation[] }>(
    `${accountName}/locations?readMask=name,title,storefrontAddress,phoneNumbers`
  );
  return data.locations ?? [];
}

interface RawGbpLocation {
  name?: string;
  title?: string;
  categories?: {
    primaryCategory?: { displayName?: string };
    additionalCategories?: Array<{ displayName?: string }>;
  };
  storefrontAddress?: unknown;
  serviceArea?: unknown;
  phoneNumbers?: { primaryPhone?: string };
  websiteUri?: string;
  profile?: { description?: string };
  regularHours?: unknown;
  metadata?: { placeId?: string };
}

export interface GbpLocationSnapshot {
  locationId: string;
  title: string;
  primaryCategory: string | null;
  additionalCategories: string[];
  address: unknown;
  serviceArea: unknown;
  phone: string | null;
  websiteUri: string | null;
  profileDescription: string | null;
  regularHours: unknown;
  placeId: string | null;
}

function extractLocationId(name: string): string {
  const parts = name.split("/");
  return parts[parts.length - 1] ?? "";
}

function toSnapshot(locationName: string, raw: RawGbpLocation): GbpLocationSnapshot {
  return {
    locationId: extractLocationId(raw.name ?? locationName),
    title: raw.title ?? "",
    primaryCategory: raw.categories?.primaryCategory?.displayName ?? null,
    additionalCategories:
      raw.categories?.additionalCategories
        ?.map((c) => c.displayName)
        .filter((d): d is string => Boolean(d)) ?? [],
    address: raw.storefrontAddress ?? null,
    serviceArea: raw.serviceArea ?? null,
    phone: raw.phoneNumbers?.primaryPhone ?? null,
    websiteUri: raw.websiteUri ?? null,
    profileDescription: raw.profile?.description ?? null,
    regularHours: raw.regularHours ?? null,
    placeId: raw.metadata?.placeId ?? null,
  };
}

export async function getLocationSnapshot(locationName: string): Promise<GbpLocationSnapshot> {
  const raw = await gbpGet<RawGbpLocation>(`${locationName}?readMask=${LOCATION_READ_MASK}`);
  return toSnapshot(locationName, raw);
}
