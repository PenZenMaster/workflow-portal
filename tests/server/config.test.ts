import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { validateEnv } from "../../server/config";

// Vite loads the project .env automatically, which may have BASE_URL or other
// SMTP vars set. beforeEach zeroes every relevant var so each test starts from
// a known clean state; individual tests override only what they need.
describe("validateEnv", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("PORT", "");
    vi.stubEnv("DATA_DB_PATH", "");
    vi.stubEnv("SESSION_DB_PATH", "");
    vi.stubEnv("SMTP_HOST", "");
    vi.stubEnv("SMTP_PORT", "");
    vi.stubEnv("SMTP_USER", "");
    vi.stubEnv("SMTP_PASS", "");
    vi.stubEnv("BASE_URL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("SESSION_SECRET — production", () => {
    it("throws when SESSION_SECRET is not set", () => {
      vi.stubEnv("NODE_ENV", "production");
      expect(() => validateEnv()).toThrow("SESSION_SECRET");
    });

    it("throws when SESSION_SECRET is shorter than 32 characters", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("SESSION_SECRET", "tooshort");
      expect(() => validateEnv()).toThrow("SESSION_SECRET");
    });

    it("does not throw with a 32-character SESSION_SECRET", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("SESSION_SECRET", "a".repeat(32));
      expect(() => validateEnv()).not.toThrow();
    });
  });

  describe("SESSION_SECRET — development", () => {
    it("does not throw when SESSION_SECRET is missing", () => {
      expect(() => validateEnv()).not.toThrow();
    });
  });

  describe("SMTP group validation", () => {
    it("throws when some but not all SMTP vars are set", () => {
      vi.stubEnv("SMTP_HOST", "mail.example.com");
      expect(() => validateEnv()).toThrow(/SMTP/i);
    });

    it("includes the missing var names in the error message", () => {
      vi.stubEnv("SMTP_HOST", "mail.example.com");
      vi.stubEnv("SMTP_PORT", "465");
      expect(() => validateEnv()).toThrow(/SMTP_USER/);
    });

    it("does not throw when no SMTP vars are set", () => {
      expect(() => validateEnv()).not.toThrow();
    });

    it("does not throw when all SMTP vars are set", () => {
      vi.stubEnv("SMTP_HOST", "mail.example.com");
      vi.stubEnv("SMTP_PORT", "465");
      vi.stubEnv("SMTP_USER", "user@example.com");
      vi.stubEnv("SMTP_PASS", "secret");
      vi.stubEnv("BASE_URL", "https://example.com");
      expect(() => validateEnv()).not.toThrow();
    });
  });

  describe("returned config", () => {
    it("defaults PORT to 5000", () => {
      const c = validateEnv();
      expect(c.PORT).toBe(5000);
    });

    it("parses PORT from env", () => {
      vi.stubEnv("PORT", "3000");
      const c = validateEnv();
      expect(c.PORT).toBe(3000);
    });

    it("defaults DATA_DB_PATH", () => {
      const c = validateEnv();
      expect(c.DATA_DB_PATH).toBe("data.db");
    });

    it("defaults SESSION_DB_PATH", () => {
      const c = validateEnv();
      expect(c.SESSION_DB_PATH).toBe("sessions.db");
    });

    it("returns SMTP null when not configured", () => {
      const c = validateEnv();
      expect(c.SMTP).toBeNull();
    });

    it("returns SMTP config when fully configured", () => {
      vi.stubEnv("SMTP_HOST", "mail.example.com");
      vi.stubEnv("SMTP_PORT", "465");
      vi.stubEnv("SMTP_USER", "user@example.com");
      vi.stubEnv("SMTP_PASS", "secret");
      vi.stubEnv("BASE_URL", "https://example.com");
      const c = validateEnv();
      expect(c.SMTP).toEqual({
        host: "mail.example.com",
        port: 465,
        user: "user@example.com",
        pass: "secret",
        baseUrl: "https://example.com",
      });
    });
  });
});
