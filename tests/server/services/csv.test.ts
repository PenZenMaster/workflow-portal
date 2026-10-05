import { describe, it, expect } from "vitest";
import { generateCsvLines, generateOverviewCsvLines } from "../../../server/services/csv";

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

// ---------------------------------------------------------------------------
describe("generateOverviewCsvLines", () => {
  const base = {
    clientId: 4,
    clientName: "Acme Roofing",
    primaryDomain: "acme.com",
    periodFrom: "2026-09-05",
    periodTo: "2026-10-05",
    totalResponses: 40,
    citationFrequency: 12.5,
    mentionRate: 37.5,
    aiSoV: 21.4285714,
    avgVisibilityScore: 3.456,
  };

  it("emits the header row with the four overview metrics", () => {
    const lines = generateOverviewCsvLines([]);
    expect(lines).toEqual([
      "client_id,client_name,primary_domain,period_from,period_to,total_responses,citation_frequency_pct,mention_rate_pct,ai_share_of_voice_pct,avg_visibility_score",
    ]);
  });

  it("emits one row per client, rounding metrics to 2 decimals", () => {
    const lines = generateOverviewCsvLines([base]);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe("4,Acme Roofing,acme.com,2026-09-05,2026-10-05,40,12.50,37.50,21.43,3.46");
  });

  it("escapes commas and quotes in the client name", () => {
    const lines = generateOverviewCsvLines([{ ...base, clientName: 'Smith, "Sons" LLC' }]);
    expect(lines[1].startsWith('4,"Smith, ""Sons"" LLC",')).toBe(true);
  });

  it("writes zeros for a client with no responses", () => {
    const lines = generateOverviewCsvLines([
      { ...base, totalResponses: 0, citationFrequency: 0, mentionRate: 0, aiSoV: 0, avgVisibilityScore: 0 },
    ]);
    expect(lines[1]).toBe("4,Acme Roofing,acme.com,2026-09-05,2026-10-05,0,0.00,0.00,0.00,0.00");
  });
});

// ---------------------------------------------------------------------------
describe("generateCsvLines - spreadsheet formula protection", () => {
  const mention = (matchedText: string) => ({
    id: 1, responseId: 2, brandId: 3, matchedText, section: "summary",
    recommendationRank: null, evidenceExcerpt: null, sentimentLabel: "neutral", sentimentScore: 0,
  });

  it.each(["=SUM(A1:A9)", "+1+1", "-2+3", "@cmd"])(
    "prefixes a text cell starting with %s so Excel will not run it",
    (text) => {
      const lines = generateCsvLines("csv-mentions", { mentions: [mention(text)] });
      expect(lines[1].split(",")[3]).toBe(`'${text}`);
    }
  );

  it("leaves ordinary text and numeric cells untouched", () => {
    const lines = generateCsvLines("csv-mentions", {
      mentions: [{ ...mention("Acme Roofing"), recommendationRank: 1, sentimentScore: -0.5 }],
    });
    expect(lines[1]).toBe("1,2,3,Acme Roofing,summary,1,,neutral,-0.5");
  });
});
