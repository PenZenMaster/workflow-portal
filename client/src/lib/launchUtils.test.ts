import { describe, it, expect } from "vitest";
import {
  fillPrompt,
  isPerplexityHost,
  buildPerplexityLaunchUrl,
} from "./launchUtils";

describe("fillPrompt", () => {
  it("replaces <PASTE> tokens in order", () => {
    const result = fillPrompt("A: <PASTE>\nB: <PASTE>", ["one", "two"]);
    expect(result).toBe("A: one\nB: two");
  });

  it("leaves template unchanged when no tokens present", () => {
    expect(fillPrompt("No tokens here", ["unused"])).toBe("No tokens here");
  });

  it("substitutes empty string when values run out", () => {
    expect(fillPrompt("<PASTE> and <PASTE>", ["only one"])).toBe(
      "only one and "
    );
  });

  it("handles an empty template", () => {
    expect(fillPrompt("", ["val"])).toBe("");
  });

  it("handles multiple tokens with matching values", () => {
    const template = "URL: <PASTE>\nGBP: <PASTE>\nType: <PASTE>";
    const result = fillPrompt(template, ["https://example.com", "gbp-link", "Local"]);
    expect(result).toBe("URL: https://example.com\nGBP: gbp-link\nType: Local");
  });
});

describe("isPerplexityHost", () => {
  it("returns true for perplexity.ai", () => {
    expect(isPerplexityHost("https://www.perplexity.ai/")).toBe(true);
  });

  it("returns true for bare perplexity.ai", () => {
    expect(isPerplexityHost("https://perplexity.ai/")).toBe(true);
  });

  it("returns true for subdomain of perplexity.ai", () => {
    expect(isPerplexityHost("https://labs.perplexity.ai/")).toBe(true);
  });

  it("returns false for a non-Perplexity URL", () => {
    expect(isPerplexityHost("https://www.perplexity.com/")).toBe(false);
  });

  it("returns false for a URL that contains but is not perplexity.ai", () => {
    expect(isPerplexityHost("https://notperplexity.ai/")).toBe(false);
  });

  it("returns false for an invalid URL", () => {
    expect(isPerplexityHost("not-a-url")).toBe(false);
  });

  it("returns false for Claude", () => {
    expect(isPerplexityHost("https://claude.ai/")).toBe(false);
  });
});

describe("buildPerplexityLaunchUrl", () => {
  const PPLX = "https://www.perplexity.ai/";

  it("returns null for a non-Perplexity URL", () => {
    expect(buildPerplexityLaunchUrl("https://claude.ai/", "prompt")).toBeNull();
  });

  it("routes bare homepage to /search", () => {
    const url = buildPerplexityLaunchUrl(PPLX, "hello world");
    expect(url).toContain("/search");
    expect(url).toContain("q=hello+world");
  });

  it("preserves a custom path like /computer", () => {
    const url = buildPerplexityLaunchUrl(
      "https://www.perplexity.ai/computer",
      "my prompt"
    );
    expect(url).toContain("/computer");
    expect(url).toContain("q=my+prompt");
  });

  it("returns null when encoded prompt exceeds 1800 chars", () => {
    const longPrompt = "a".repeat(1900);
    expect(buildPerplexityLaunchUrl(PPLX, longPrompt)).toBeNull();
  });

  it("returns a URL string for a normal short prompt", () => {
    const url = buildPerplexityLaunchUrl(PPLX, "SEO audit");
    expect(typeof url).toBe("string");
    expect(url).toMatch(/^https:\/\/www\.perplexity\.ai/);
  });

  it("appends the prompt as the q parameter", () => {
    const url = buildPerplexityLaunchUrl(PPLX, "test prompt");
    expect(new URL(url!).searchParams.get("q")).toBe("test prompt");
  });
});
