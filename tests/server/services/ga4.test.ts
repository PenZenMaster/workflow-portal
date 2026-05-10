import { describe, it, expect } from "vitest";
import { filterAiSearchRows, AI_SEARCH_REFERRERS } from "../../../server/services/ga4";

interface SessionRow {
  sessionSource: string;
  sessions: number;
}

// ---------------------------------------------------------------------------
describe("filterAiSearchRows — AI Search channel rule", () => {
  it("classifies perplexity.ai sessions as AI Search", () => {
    const rows: SessionRow[] = [
      { sessionSource: "perplexity.ai", sessions: 100 },
      { sessionSource: "google.com", sessions: 500 },
    ];
    const filtered = filterAiSearchRows(rows);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].sessionSource).toBe("perplexity.ai");
  });

  it("classifies chatgpt.com as AI Search", () => {
    const rows: SessionRow[] = [{ sessionSource: "chatgpt.com", sessions: 42 }];
    expect(filterAiSearchRows(rows)).toHaveLength(1);
  });

  it("classifies chat.openai.com as AI Search", () => {
    const rows: SessionRow[] = [{ sessionSource: "chat.openai.com", sessions: 10 }];
    expect(filterAiSearchRows(rows)).toHaveLength(1);
  });

  it("classifies gemini.google.com as AI Search", () => {
    const rows: SessionRow[] = [{ sessionSource: "gemini.google.com", sessions: 7 }];
    expect(filterAiSearchRows(rows)).toHaveLength(1);
  });

  it("classifies copilot.microsoft.com as AI Search", () => {
    const rows: SessionRow[] = [{ sessionSource: "copilot.microsoft.com", sessions: 3 }];
    expect(filterAiSearchRows(rows)).toHaveLength(1);
  });

  it("classifies claude.ai as AI Search", () => {
    const rows: SessionRow[] = [{ sessionSource: "claude.ai", sessions: 5 }];
    expect(filterAiSearchRows(rows)).toHaveLength(1);
  });

  it("excludes non-AI referrers", () => {
    const rows: SessionRow[] = [
      { sessionSource: "google.com", sessions: 1000 },
      { sessionSource: "bing.com", sessions: 200 },
      { sessionSource: "facebook.com", sessions: 150 },
      { sessionSource: "(direct)", sessions: 300 },
    ];
    expect(filterAiSearchRows(rows)).toHaveLength(0);
  });

  it("handles mixed AI and non-AI referrers", () => {
    const rows: SessionRow[] = [
      { sessionSource: "perplexity.ai", sessions: 80 },
      { sessionSource: "google.com", sessions: 1000 },
      { sessionSource: "claude.ai", sessions: 20 },
    ];
    const filtered = filterAiSearchRows(rows);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((r) => r.sessionSource)).toContain("perplexity.ai");
    expect(filtered.map((r) => r.sessionSource)).toContain("claude.ai");
  });

  it("returns empty for empty input", () => {
    expect(filterAiSearchRows([])).toHaveLength(0);
  });

  it("AI_SEARCH_REFERRERS includes all major AI platforms", () => {
    const required = ["perplexity.ai", "chatgpt.com", "gemini.google.com", "claude.ai"];
    for (const domain of required) {
      expect(AI_SEARCH_REFERRERS).toContain(domain);
    }
  });
});
