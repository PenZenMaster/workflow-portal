import { describe, it, expect, vi, afterEach } from "vitest";
import { logger } from "../../server/logger";

describe("logger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("info calls console.info with a JSON string", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logger.info("test message");
    expect(spy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(spy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(parsed.level).toBe("info");
    expect(parsed.msg).toBe("test message");
  });

  it("warn calls console.warn with a JSON string", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logger.warn("warn message");
    expect(spy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(spy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(parsed.level).toBe("warn");
    expect(parsed.msg).toBe("warn message");
  });

  it("error calls console.error with a JSON string", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.error("error message");
    expect(spy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(spy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(parsed.level).toBe("error");
    expect(parsed.msg).toBe("error message");
  });

  it("merges context fields into the top-level log object", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logger.info("with context", { requestId: "abc-123", userId: 42 });
    const parsed = JSON.parse(spy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(parsed.requestId).toBe("abc-123");
    expect(parsed.userId).toBe(42);
  });

  it("ts field is an ISO 8601 string", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logger.info("ts check");
    const parsed = JSON.parse(spy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(typeof parsed.ts).toBe("string");
    expect(parsed.ts as string).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("works without a context argument", () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    expect(() => logger.info("no ctx")).not.toThrow();
  });

  it("context does not override level, msg, or ts fields", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logger.info("safe", { level: "hacked", msg: "hacked", ts: "hacked" });
    const parsed = JSON.parse(spy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(parsed.level).toBe("info");
    expect(parsed.msg).toBe("safe");
    expect(parsed.ts).not.toBe("hacked");
  });
});
