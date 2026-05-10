/*
 * Module/Script Name: shareLink.ts
 * Path: server/services/shareLink.ts
 *
 * Description:
 * Share-link token lifecycle utilities. Uses SHA-256 to hash random tokens
 * so raw values are never stored, mirroring the password-reset flow already
 * in the codebase. SESSION_SECRET is not used for the hash (tokens are
 * random enough without it); expiry and revocation are enforced at the DB
 * level.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-10
 * Last Modified Date: 2026-05-10
 * Comments:
 * - v1.00 Sprint 6 initial implementation
 */

import crypto from "node:crypto";

export interface CreateTokenResult {
  rawToken: string;
  tokenHash: string;
  expiresAt: number;
}

export function createShareToken(opts: { ttlDays: number }): CreateTokenResult {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = Date.now() + opts.ttlDays * 24 * 60 * 60 * 1000;
  return { rawToken, tokenHash, expiresAt };
}

export function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export function isTokenExpired(expiresAt: number): boolean {
  return expiresAt < Date.now();
}

export function isTokenRevoked(revokedAt: number | null): boolean {
  return revokedAt !== null;
}
