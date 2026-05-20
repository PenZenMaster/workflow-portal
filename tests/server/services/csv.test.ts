import { describe, it, expect } from "vitest";
import { generateCsvLines } from "../../../server/services/csv";

// ---------------------------------------------------------------------------
describe("generateCsvLines — csv-executive", () => {
  it("produces a header row followed by data rows", () => {
    const snapshots = [
      { dateIso: "2026-05-01", mentionCount: 5, citationCount: 3, allBrandMentions: 15, promptResponseCount: 10, visibilityScoreSum: 20 },
      { dateIso: "2026-05-02", mentionCount: 7, citationCount: 4, allBrandMentions: 20, promptResponseCount: 12, visibilityScoreSum: 28 },
    ];
    const lines = generateCsvLines("csv-executive", { snapshots });
    expect(lines).toHaveLength(3); // header + 2 data rows
    expect(lines[0]).toContain("date");
    expect(lines[1]).toContain("2026-05-01");
    expect(lines[2]).toContain("2026-05-02");
  });

  it("line count equals snapshots.length + 1 (header)", () => {
    const snapshots = Array.from({ length: 5 }, (_, i) => ({
      dateIso: `2026-05-0${i + 1}`,
      mentionCount: i,
      citationCount: i,
      allBrandMentions: i * 3,
      promptResponseCount: 10,
      visibilityScoreSum: i * 4,
    }));
    const lines = generateCsvLines("csv-executive", { snapshots });
    expect(lines).toHaveLength(6); // 1 header + 5 data
  });

  it("returns just a header with no data when snapshots is empty", () => {
    const lines = generateCsvLines("csv-executive", { snapshots: [] });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("date");
  });
});

describe("generateCsvLines — csv-mentions", () => {
  it("produces header + mention rows", () => {
    const mentions = [
      {
        id: 1, responseId: 10, brandId: 1, matchedText: "Acme Corp",
        section: "summary", recommendationRank: 1, evidenceExcerpt: "Best agency",
        sentimentLabel: "positive", sentimentScore: 0.8,
      },
    ];
    const lines = generateCsvLines("csv-mentions", { mentions });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("matchedText");
    expect(lines[1]).toContain("Acme Corp");
  });

  it("escapes commas in field values", () => {
    const mentions = [
      {
        id: 1, responseId: 10, brandId: 1,
        matchedText: "Acme, Inc",
        section: "body", recommendationRank: null, evidenceExcerpt: null,
        sentimentLabel: "neutral", sentimentScore: 0,
      },
    ];
    const lines = generateCsvLines("csv-mentions", { mentions });
    // "Acme, Inc" should be quoted in the CSV
    expect(lines[1]).toContain('"Acme, Inc"');
  });
});
