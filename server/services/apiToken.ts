/*
 * Module/Script Name: apiToken.ts
 * Path: server/services/apiToken.ts
 *
 * Description:
 * Generates and validates machine API tokens. A token is "wfp_" followed
 * by 32 random bytes in hex; only its SHA-256 hash is ever stored. The
 * display prefix lets admins tell tokens apart without revealing them.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-10-05
 * Last Modified Date: 2026-10-05
 * Comments:
 * - v1.00 Initial implementation (Reporting Suite API access)
 */

import crypto from "node:crypto";

export const API_TOKEN_PREFIX = "wfp_";
const DISPLAY_PREFIX_SUFFIX_CHARS = 6;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface CreatedApiToken {
  rawToken: string;
  tokenHash: string;
  tokenPrefix: string;
  expiresAt: number;
}

export function hashApiToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export function createApiToken(opts: { ttlDays: number }): CreatedApiToken {
  const rawToken = `${API_TOKEN_PREFIX}${crypto.randomBytes(32).toString("hex")}`;
  return {
    rawToken,
    tokenHash: hashApiToken(rawToken),
    tokenPrefix: rawToken.slice(0, API_TOKEN_PREFIX.length + DISPLAY_PREFIX_SUFFIX_CHARS),
    expiresAt: Date.now() + opts.ttlDays * DAY_MS,
  };
}

export function isApiTokenUsable(
  token: { expiresAt: number; revokedAt: number | null },
  now: number = Date.now()
): boolean {
  return token.revokedAt === null && token.expiresAt > now;
}
