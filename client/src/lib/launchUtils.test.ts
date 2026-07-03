import { describe, it, expect } from "vitest";
import {
  fillPrompt,
  isPerplexityHost,
  buildPerplexityLaunchUrl,
  hasSensitiveInputLabel,
  getLaunchPlan,
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

describe("hasSensitiveInputLabel", () => {
  it("flags password labels", () => {
    expect(hasSensitiveInputLabel(["WP App Password"])).toBe(true);
  });

  it("flags API key labels", () => {
    expect(hasSensitiveInputLabel(["Website URL", "API Key"])).toBe(true);
  });

  it("flags token and secret labels", () => {
    expect(hasSensitiveInputLabel(["Access Token"])).toBe(true);
    expect(hasSensitiveInputLabel(["Client Secret"])).toBe(true);
  });

  it("does not flag ordinary labels", () => {
    expect(
      hasSensitiveInputLabel(["Website URL", "Business name", "GBP link"])
    ).toBe(false);
  });

  it("returns false for an empty list", () => {
    expect(hasSensitiveInputLabel([])).toBe(false);
  });
});

describe("getLaunchPlan", () => {
  const PPLX_ROOT = "https://www.perplexity.ai/";
  const PPLX_COMPUTER = "https://www.perplexity.ai/computer";

  it("auto-submits via /search for the Perplexity homepage", () => {
    const plan = getLaunchPlan(PPLX_ROOT, "hello world", ["Website URL"]);
    expect(plan.mode).toBe("auto-submit");
    expect(plan.url).toContain("/search");
    expect(new URL(plan.url).searchParams.get("q")).toBe("hello world");
  });

  it("prefills without auto-submit for the /computer path", () => {
    const plan = getLaunchPlan(PPLX_COMPUTER, "hello world", ["Website URL"]);
    expect(plan.mode).toBe("prefill");
    expect(plan.url).toContain("/computer");
    expect(new URL(plan.url).searchParams.get("q")).toBe("hello world");
  });

  it("falls back to clipboard when the encoded prompt is too long", () => {
    const plan = getLaunchPlan(PPLX_COMPUTER, "a".repeat(1900), [
      "Website URL",
    ]);
    expect(plan.mode).toBe("clipboard");
    expect(plan.url).toBe(PPLX_COMPUTER);
  });

  it("never puts the prompt in the URL when an input label is a credential", () => {
    const plan = getLaunchPlan(PPLX_COMPUTER, "prompt with secret123", [
      "Website URL",
      "WP App Password",
    ]);
    expect(plan.mode).toBe("clipboard");
    expect(plan.url).toBe(PPLX_COMPUTER);
    expect(plan.url).not.toContain("secret123");
  });

  it("uses clipboard mode for non-Perplexity URLs", () => {
    const plan = getLaunchPlan("https://claude.ai/", "hello", []);
    expect(plan.mode).toBe("clipboard");
    expect(plan.url).toBe("https://claude.ai/");
  });
});
