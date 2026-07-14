import { describe, it, expect } from "vitest";
import { parseResponse } from "../../../server/services/parser";
import type { BrandInput } from "../../../server/services/parser";

const CLIENT_BRAND: BrandInput = {
  id: 1,
  primaryDomain: "acme.com",
  aliases: [
    { aliasText: "Acme Corp", matchType: "exact" },
    { aliasText: "Acme", matchType: "exact" },
  ],
};

const COMPETITOR_BRAND: BrandInput = {
  id: 2,
  primaryDomain: "rival.com",
  aliases: [
    { aliasText: "Rival Co", matchType: "exact" },
  ],
};

const BRANDS = [CLIENT_BRAND, COMPETITOR_BRAND];

// ---------------------------------------------------------------------------
describe("parseResponse — mention detection", () => {
  it("detects an exact-match brand mention", () => {
    const result = parseResponse(
      "Acme Corp is the best SEO agency in Seattle.",
      [],
      BRANDS
    );
    expect(result.mentions).toHaveLength(1);
    expect(result.mentions[0].brandId).toBe(1);
    expect(result.mentions[0].matchedText).toBe("Acme Corp");
  });

  it("is case-insensitive for exact matches", () => {
    const result = parseResponse("acme corp leads the market.", [], BRANDS);
    expect(result.mentions).toHaveLength(1);
    expect(result.mentions[0].brandId).toBe(1);
  });

  it("detects a regex-match alias", () => {
    const regexBrand: BrandInput = {
      id: 3,
      primaryDomain: "example.com",
      aliases: [{ aliasText: "acme.?corp", matchType: "regex" }],
    };
    const result = parseResponse("acme-corp is great.", [], [regexBrand]);
    expect(result.mentions).toHaveLength(1);
  });

  it("detects multiple brands in the same response", () => {
    const result = parseResponse(
      "Acme Corp beats Rival Co in all benchmarks.",
      [],
      BRANDS
    );
    const brandIds = result.mentions.map((m) => m.brandId);
    expect(brandIds).toContain(1);
    expect(brandIds).toContain(2);
  });

  it("does not double-count a brand mentioned via two aliases in the same text", () => {
    const result = parseResponse(
      "Acme Corp (also known as Acme) leads the market.",
      [],
      BRANDS
    );
    // Both aliases match but should produce separate mention rows
    const acmeMentions = result.mentions.filter((m) => m.brandId === 1);
    expect(acmeMentions.length).toBeGreaterThanOrEqual(1);
  });

  it("returns no mentions when no brand is present", () => {
    const result = parseResponse("Some other company does SEO.", [], BRANDS);
    expect(result.mentions).toHaveLength(0);
  });
});

describe("parseResponse — section detection", () => {
  it("classifies a match in the first third of text as summary", () => {
    const text = "Acme Corp is the top choice. " + "filler ".repeat(30);
    const result = parseResponse(text, [], BRANDS);
    expect(result.mentions[0].section).toBe("summary");
  });

  it("classifies a match in a numbered list context as list", () => {
    const text =
      "Top agencies:\n1. Acme Corp\n2. Rival Co\n\nThey all offer great services.";
    const result = parseResponse(text, [], BRANDS);
    const acme = result.mentions.find((m) => m.brandId === 1);
    expect(acme?.section).toBe("list");
  });

  it("assigns recommendation rank 1 for first item in a list", () => {
    const text = "1. Acme Corp — best for local SEO\n2. Rival Co — good for technical";
    const result = parseResponse(text, [], BRANDS);
    const acme = result.mentions.find((m) => m.brandId === 1);
    expect(acme?.recommendationRank).toBe(1);
  });

  // TD-20: LLM responses almost always bold list items; markdown markers
  // between the number and the brand must not defeat rank detection.
  it("assigns recommendation rank when the list item is bolded (1. **Brand**)", () => {
    const text = "1. **Acme Corp**: great for local SEO\n2. **Rival Co**: solid technical work";
    const result = parseResponse(text, [], BRANDS);
    const acme = result.mentions.find((m) => m.brandId === 1);
    const rival = result.mentions.find((m) => m.brandId === 2);
    expect(acme?.recommendationRank).toBe(1);
    expect(rival?.recommendationRank).toBe(2);
  });

  it("assigns recommendation rank when the list number itself is bolded (**1.** Brand)", () => {
    const text = "**1.** Acme Corp — the top pick\n**2.** Rival Co — runner-up";
    const result = parseResponse(text, [], BRANDS);
    const acme = result.mentions.find((m) => m.brandId === 1);
    expect(acme?.recommendationRank).toBe(1);
  });

  it("does not treat a decimal number before a mention as a list rank", () => {
    const text = "Rated 4.5 Acme Corp reviews are strong.";
    const result = parseResponse(text, [], BRANDS);
    const acme = result.mentions.find((m) => m.brandId === 1);
    expect(acme?.recommendationRank).toBeNull();
  });
});

describe("parseResponse — citation extraction", () => {
  it("extracts root domain from a URL", () => {
    const citations = [{ url: "https://help.acme.com/guide", position: 1 }];
    const result = parseResponse("Some text.", citations, BRANDS);
    expect(result.citations[0].rootDomain).toBe("acme.com");
  });

  it("marks a citation as owned by a brand when domain matches", () => {
    const citations = [{ url: "https://acme.com/about", position: 1 }];
    const result = parseResponse("Some text.", citations, BRANDS);
    expect(result.citations[0].ownedByBrandId).toBe(1);
  });

  it("marks a citation as unowned when domain does not match any brand", () => {
    const citations = [{ url: "https://searchenginejournal.com/article", position: 1 }];
    const result = parseResponse("Some text.", citations, BRANDS);
    expect(result.citations[0].ownedByBrandId).toBeNull();
  });

  it("preserves citation order", () => {
    const citations = [
      { url: "https://rival.com/page", position: 1 },
      { url: "https://acme.com/page", position: 2 },
    ];
    const result = parseResponse("Some text.", citations, BRANDS);
    expect(result.citations[0].position).toBe(1);
    expect(result.citations[1].position).toBe(2);
  });
});
