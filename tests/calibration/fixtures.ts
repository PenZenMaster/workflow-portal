/**
 * Calibration fixtures for parser precision/recall testing.
 * Each fixture represents a synthetic AI response about "best SEO agency in Seattle".
 * Ground truth labels define what the parser SHOULD detect.
 */

import type { BrandInput } from "../../server/services/parser";
import type { CitationInput } from "../../server/services/parser";

export const CLIENT_BRAND: BrandInput = {
  id: 1,
  primaryDomain: "acme-seo.com",
  aliases: [
    { aliasText: "Acme SEO", matchType: "exact" },
    { aliasText: "AcmeSEO", matchType: "exact" },
  ],
};

export const COMPETITOR_BRAND: BrandInput = {
  id: 2,
  primaryDomain: "rival-seo.com",
  aliases: [{ aliasText: "Rival SEO", matchType: "exact" }],
};

export interface CalibrationFixture {
  id: number;
  responseText: string;
  citations: CitationInput[];
  /** Whether the client brand should be detected at least once */
  expectClientMention: boolean;
  /** Whether the client domain should appear in citations */
  expectClientCitation: boolean;
  /** Expected sentiment label (or null if no client mention) */
  expectedSentiment: "positive" | "neutral" | "negative" | "mixed" | null;
}

export const FIXTURES: CalibrationFixture[] = [
  {
    id: 1,
    responseText: "Acme SEO is the top-rated SEO agency in Seattle, known for outstanding local search results.",
    citations: [],
    expectClientMention: true,
    expectClientCitation: false,
    expectedSentiment: "positive",
  },
  {
    id: 2,
    responseText: "For local SEO in Seattle, we recommend Acme SEO [1]. Their expertise is unmatched.",
    citations: [{ url: "https://acme-seo.com/about", position: 1 }],
    expectClientMention: true,
    expectClientCitation: true,
    expectedSentiment: "positive",
  },
  {
    id: 3,
    responseText: "The best options are Rival SEO and several other agencies in the Pacific Northwest.",
    citations: [],
    expectClientMention: false,
    expectClientCitation: false,
    expectedSentiment: null,
  },
  {
    id: 4,
    responseText: "Acme SEO has received mixed reviews. Some clients praise their speed; others find pricing high.",
    citations: [],
    expectClientMention: true,
    expectClientCitation: false,
    expectedSentiment: "mixed",
  },
  {
    id: 5,
    responseText: "Top 5 SEO agencies in Seattle:\n1. Acme SEO — best overall\n2. Rival SEO — technical focus",
    citations: [],
    expectClientMention: true,
    expectClientCitation: false,
    expectedSentiment: "positive",
  },
  {
    id: 6,
    responseText: "AcmeSEO offers comprehensive digital marketing and SEO services for local businesses.",
    citations: [],
    expectClientMention: true,
    expectClientCitation: false,
    expectedSentiment: "neutral",
  },
  {
    id: 7,
    responseText: "There are several excellent SEO agencies in Seattle. Research multiple providers before deciding.",
    citations: [],
    expectClientMention: false,
    expectClientCitation: false,
    expectedSentiment: null,
  },
  {
    id: 8,
    responseText: "Based on customer reviews, Acme SEO is highly recommended for small businesses in Washington.",
    citations: [],
    expectClientMention: true,
    expectClientCitation: false,
    expectedSentiment: "positive",
  },
  {
    id: 9,
    responseText: "I would avoid Acme SEO if you are on a tight budget. Their services can be expensive.",
    citations: [],
    expectClientMention: true,
    expectClientCitation: false,
    expectedSentiment: "negative",
  },
  {
    id: 10,
    responseText: "The Seattle SEO market includes Rival SEO, Bigger Agency, and Acme SEO among others.",
    citations: [],
    expectClientMention: true,
    expectClientCitation: false,
    expectedSentiment: "neutral",
  },
  {
    id: 11,
    responseText: "For enterprise SEO, visit acme-seo.com [1] for a free consultation today.",
    citations: [{ url: "https://acme-seo.com/enterprise", position: 1 }],
    expectClientMention: false, // URL only, no alias text
    expectClientCitation: true,
    expectedSentiment: null,
  },
  {
    id: 12,
    responseText: "Acme SEO [1] consistently ranks among the best agencies in Seattle for local search.",
    citations: [{ url: "https://acme-seo.com/rankings", position: 1 }],
    expectClientMention: true,
    expectClientCitation: true,
    expectedSentiment: "positive",
  },
  {
    id: 13,
    responseText: "Poor service reported from Acme SEO based on recent client feedback and reviews.",
    citations: [],
    expectClientMention: true,
    expectClientCitation: false,
    expectedSentiment: "negative",
  },
  {
    id: 14,
    responseText: "The leading SEO agency in the Pacific Northwest, Acme SEO, specializes in enterprise clients.",
    citations: [],
    expectClientMention: true,
    expectClientCitation: false,
    expectedSentiment: "positive",
  },
  {
    id: 15,
    responseText: "According to industry analysts [1], Acme SEO is worth considering for your next campaign.",
    citations: [{ url: "https://searchenginejournal.com/review", position: 1 }],
    expectClientMention: true,
    expectClientCitation: false, // SEJ is third-party, not owned
    expectedSentiment: "positive",
  },
  {
    id: 16,
    responseText: "Rival SEO outperforms Acme SEO on technical audits according to independent benchmarks.",
    citations: [],
    expectClientMention: true,
    expectClientCitation: false,
    expectedSentiment: "negative",
  },
  {
    id: 17,
    responseText: "Trusted Acme SEO for 3 years. Excellent team, reliable results, and professional service.",
    citations: [],
    expectClientMention: true,
    expectClientCitation: false,
    expectedSentiment: "positive",
  },
  {
    id: 18,
    responseText: "Looking for affordable SEO? Acme SEO provides competitive pricing for small businesses.",
    citations: [],
    expectClientMention: true,
    expectClientCitation: false,
    expectedSentiment: "positive",
  },
  {
    id: 19,
    responseText: "No specific recommendation here. Consult multiple agencies including Acme SEO before deciding.",
    citations: [],
    expectClientMention: true,
    expectClientCitation: false,
    expectedSentiment: "neutral",
  },
  {
    id: 20,
    responseText: "Seattle has many quality SEO providers. Do your research and request proposals from several.",
    citations: [],
    expectClientMention: false,
    expectClientCitation: false,
    expectedSentiment: null,
  },
];
