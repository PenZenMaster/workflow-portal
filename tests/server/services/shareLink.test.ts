import { describe, it, expect } from "vitest";
import { createShareToken, hashToken, isTokenExpired, isTokenRevoked } from "../../../server/services/shareLink";


// ---------------------------------------------------------------------------
describe("createShareToken", () => {
  it("returns a rawToken and its hash", () => {
    const { rawToken, tokenHash } = createShareToken({ ttlDays: 7 });
    expect(rawToken).toBeTypeOf("string");
    expect(rawToken.length).toBeGreaterThan(20);
    expect(tokenHash).toBeTypeOf("string");
    expect(tokenHash.length).toBe(64); // SHA-256 hex
  });

  it("rawToken and tokenHash are different strings", () => {
    const { rawToken, tokenHash } = createShareToken({ ttlDays: 7 });
    expect(rawToken).not.toBe(tokenHash);
  });

  it("two calls produce different tokens", () => {
    const a = createShareToken({ ttlDays: 7 });
    const b = createShareToken({ ttlDays: 7 });
    expect(a.rawToken).not.toBe(b.rawToken);
  });

  it("sets expiresAt approximately ttlDays in the future", () => {
    const before = Date.now();
    const { expiresAt } = createShareToken({ ttlDays: 30 });
    const after = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    expect(expiresAt).toBeGreaterThanOrEqual(before + thirtyDaysMs - 1000);
    expect(expiresAt).toBeLessThanOrEqual(after + thirtyDaysMs + 1000);
  });
});

describe("hashToken", () => {
  it("produces the same hash for the same input", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashToken("abc")).not.toBe(hashToken("xyz"));
  });

  it("round-trips: hash of rawToken equals the stored tokenHash", () => {
    const { rawToken, tokenHash } = createShareToken({ ttlDays: 1 });
    expect(hashToken(rawToken)).toBe(tokenHash);
  });
});

describe("isTokenExpired", () => {
  it("returns true when expiresAt is in the past", () => {
    expect(isTokenExpired(Date.now() - 1000)).toBe(true);
  });

  it("returns false when expiresAt is in the future", () => {
    expect(isTokenExpired(Date.now() + 86_400_000)).toBe(false);
  });
});

describe("isTokenRevoked", () => {
  it("returns true when revokedAt is set", () => {
    expect(isTokenRevoked(Date.now() - 1000)).toBe(true);
  });

  it("returns false when revokedAt is null", () => {
    expect(isTokenRevoked(null)).toBe(false);
  });
});
