import { describe, it, expect } from "vitest";
import { parseResponse } from "../../../server/services/parser";
import type { BrandInput } from "../../../server/services/parser";

const CLIENT_BRAND: BrandInput = {
  id: 1,
  canonicalName: "Acme Corp",
  primaryDomain: "acme.com",
  aliases: [
    { aliasText: "Acme Corp", matchType: "exact" },
    { aliasText: "Acme", matchType: "exact" },
  ],
};

const COMPETITOR_BRAND: BrandInput = {
  id: 2,
  canonicalName: "Rival Co",
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

  it("matches a brand with no aliases by its canonical name (implicit exact alias)", () => {
    const aliasLess: BrandInput = {
      id: 40,
      canonicalName: "United Rentals",
      primaryDomain: "https://www.unitedrentals.com/",
      aliases: [],
    };
    const result = parseResponse(
      "United Rentals offers porta potty rentals nationwide.",
      [],
      [aliasLess]
    );
    expect(result.mentions).toHaveLength(1);
    expect(result.mentions[0].brandId).toBe(40);
    expect(result.mentions[0].matchedText).toBe("United Rentals");
    expect(result.mentions[0].matchType).toBe("exact");
  });

  it("does not double-count when an alias duplicates the canonical name (case-insensitive)", () => {
    const dupBrand: BrandInput = {
      id: 41,
      canonicalName: "Acme Corp",
      primaryDomain: "acme.com",
      aliases: [{ aliasText: "acme corp", matchType: "exact" }],
    };
    const result = parseResponse("Acme Corp is great.", [], [dupBrand]);
    expect(result.mentions).toHaveLength(1);
  });

  it("detects a regex-match alias", () => {
    const regexBrand: BrandInput = {
      id: 3,
      canonicalName: "Example Brand",
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

  // TD-22: naive "last two dot-separated labels" collapsed multi-part
  // public suffixes to the meaningless suffix itself (anything.co.uk ->
  // "co.uk"), grouping unrelated citations under one fake root and making
  // them permanently unclassifiable/unmatchable for ownership. Fixed via
  // the psl package (the actual Mozilla Public Suffix List).
  it("extracts the full registrable domain under a multi-part public suffix (co.uk), not just the last two labels", () => {
    const citations = [{ url: "https://www.chicagometalsupply.co.uk/products", position: 1 }];
    const result = parseResponse("Some text.", citations, BRANDS);
    expect(result.citations[0].rootDomain).toBe("chicagometalsupply.co.uk");
  });

  it("extracts the full registrable domain under other common multi-part suffixes (com.au)", () => {
    const citations = [{ url: "https://shop.example.com.au/page", position: 1 }];
    const result = parseResponse("Some text.", citations, BRANDS);
    expect(result.citations[0].rootDomain).toBe("example.com.au");
  });

  it("matches ownership for a brand whose primary domain sits under a multi-part public suffix", () => {
    const ukBrand: BrandInput = {
      id: 6,
      canonicalName: "UK Metal Co",
      primaryDomain: "ukmetalco.co.uk",
      aliases: [],
    };
    const citations = [{ url: "https://www.ukmetalco.co.uk/about", position: 1 }];
    const result = parseResponse("Some text.", citations, [...BRANDS, ukBrand]);
    expect(result.citations[0].rootDomain).toBe("ukmetalco.co.uk");
    expect(result.citations[0].ownedByBrandId).toBe(6);
  });

  it("marks a citation as owned by a brand when domain matches", () => {
    const citations = [{ url: "https://acme.com/about", position: 1 }];
    const result = parseResponse("Some text.", citations, BRANDS);
    expect(result.citations[0].ownedByBrandId).toBe(1);
  });

  // TD-21: brand records store primary_domain both as bare domains
  // ("acme.com") and full URLs ("https://www.rival.com/"). Ownership
  // matching must handle both.
  it("matches ownership when the brand's primaryDomain is a full URL", () => {
    const urlBrand: BrandInput = {
      id: 5,
      canonicalName: "Rival Co",
      primaryDomain: "https://www.rival.com/",
      aliases: [{ aliasText: "Rival Co", matchType: "exact" }],
    };
    const citations = [{ url: "https://rival.com/services", position: 1 }];
    const result = parseResponse("Some text.", citations, [urlBrand]);
    expect(result.citations[0].ownedByBrandId).toBe(5);
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
