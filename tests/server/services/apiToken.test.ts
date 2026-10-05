import { describe, it, expect } from "vitest";
import {
  createApiToken,
  hashApiToken,
  isApiTokenUsable,
  API_TOKEN_PREFIX,
} from "../../../server/services/apiToken";

describe("createApiToken", () => {
  it("returns a prefixed 64-hex raw token, its sha256 hash and a display prefix", () => {
    const t = createApiToken({ ttlDays: 90 });
    expect(t.rawToken).toMatch(new RegExp(`^${API_TOKEN_PREFIX}[0-9a-f]{64}$`));
    expect(t.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(t.tokenHash).toBe(hashApiToken(t.rawToken));
    expect(t.tokenHash).not.toContain(t.rawToken);
    expect(t.rawToken.startsWith(t.tokenPrefix)).toBe(true);
    expect(t.tokenPrefix).toHaveLength(API_TOKEN_PREFIX.length + 6);
  });

  it("sets expiresAt ttlDays in the future", () => {
    const before = Date.now();
    const t = createApiToken({ ttlDays: 30 });
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    expect(t.expiresAt).toBeGreaterThanOrEqual(before + thirtyDays);
    expect(t.expiresAt).toBeLessThanOrEqual(Date.now() + thirtyDays);
  });

  it("never repeats a token", () => {
    const a = createApiToken({ ttlDays: 1 });
    const b = createApiToken({ ttlDays: 1 });
    expect(a.rawToken).not.toBe(b.rawToken);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });
});

describe("isApiTokenUsable", () => {
  const now = 1_000_000;
  it("is true for an unexpired, unrevoked token", () => {
    expect(isApiTokenUsable({ expiresAt: now + 1, revokedAt: null }, now)).toBe(true);
  });
  it("is false once expired", () => {
    expect(isApiTokenUsable({ expiresAt: now, revokedAt: null }, now)).toBe(false);
    expect(isApiTokenUsable({ expiresAt: now - 1, revokedAt: null }, now)).toBe(false);
  });
  it("is false once revoked", () => {
    expect(isApiTokenUsable({ expiresAt: now + 1000, revokedAt: now - 5 }, now)).toBe(false);
  });
});
