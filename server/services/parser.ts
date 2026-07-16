/*
 * Module/Script Name: parser.ts
 * Path: server/services/parser.ts
 *
 * Description:
 * Parses a raw AI response into detected brand mentions and ordered
 * citations. Supports exact, fuzzy, and regex alias matching. Section
 * detection uses position heuristics (summary = first third, list =
 * adjacent to numbered items, body = everything else).
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-10
 * Last Modified Date: 2026-07-14
 * Comments:
 * - v1.00 Sprint 4 initial implementation
 * - v1.01 TD-20: rank detection tolerates markdown emphasis around list markers
 * - v1.02 TD-21: ownership matching accepts URL-formatted brand primary domains
 */

// Bumped whenever mention/citation extraction behavior changes — recorded
// on run manifests for comparability (issue #3 Epic 2).
export const PARSER_VERSION = "1.0";

export interface AliasInput {
  aliasText: string;
  matchType: "exact" | "fuzzy" | "regex";
}

export interface BrandInput {
  id: number;
  primaryDomain: string | null;
  aliases: AliasInput[];
}

export interface CitationInput {
  url: string;
  position: number;
}

export interface ParsedMention {
  brandId: number;
  matchedText: string;
  matchType: "exact" | "fuzzy" | "regex";
  section: "summary" | "list" | "body";
  recommendationRank: number | null;
  confidence: number;
  evidenceExcerpt: string | null;
}

export interface ParsedCitation {
  url: string;
  rootDomain: string;
  ownedByBrandId: number | null;
  position: number;
  isTrustedThirdParty: boolean;
}

export interface ParseResult {
  mentions: ParsedMention[];
  citations: ParsedCitation[];
}

function extractRootDomain(url: string): string {
  try {
    const { hostname } = new URL(url);
    const parts = hostname.split(".");
    return parts.length <= 2 ? hostname : parts.slice(-2).join(".");
  } catch {
    return url;
  }
}

function detectSection(text: string, matchIndex: number): "summary" | "list" | "body" {
  // Check if inside a numbered list context: look at 80 chars around match.
  const window = text.slice(Math.max(0, matchIndex - 80), matchIndex + 80);
  if (/^\s*\d+\.\s/m.test(window)) return "list";

  // First third of the document = summary.
  if (matchIndex < text.length / 3) return "summary";

  return "body";
}

function detectRecommendationRank(text: string, matchIndex: number): number | null {
  // Look at the characters immediately before the match for a "N. " list
  // marker. Markdown emphasis markers may sit between the number and the
  // brand ("1. **Brand**") or wrap the number itself ("**1.** Brand"), so
  // whitespace, asterisks, underscores, and backticks are allowed after
  // the dot. A digit after the dot (e.g. "4.5") is not a list marker.
  const before = text.slice(Math.max(0, matchIndex - 12), matchIndex);
  const match = /(\d+)\.[\s*_`]*$/.exec(before);
  if (match) return parseInt(match[1], 10);
  return null;
}

function extractExcerpt(text: string, matchIndex: number, matchLen: number): string {
  const start = Math.max(0, matchIndex - 60);
  const end = Math.min(text.length, matchIndex + matchLen + 60);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function matchesAlias(text: string, alias: AliasInput): number {
  if (alias.matchType === "regex") {
    try {
      const re = new RegExp(alias.aliasText, "i");
      const m = re.exec(text);
      return m ? m.index : -1;
    } catch {
      return -1;
    }
  }
  // exact and fuzzy both use case-insensitive contains for MVP.
  return text.toLowerCase().indexOf(alias.aliasText.toLowerCase());
}

export function parseResponse(
  responseText: string,
  citations: CitationInput[],
  brands: BrandInput[]
): ParseResult {
  const mentions: ParsedMention[] = [];

  for (const brand of brands) {
    // Sort aliases longest-first so a longer alias claim wins over a shorter one
    // at the same position (e.g. "Acme Corp" wins over "Acme").
    const sortedAliases = [...brand.aliases].sort(
      (a, b) => b.aliasText.length - a.aliasText.length
    );

    // Track matched character ranges for this brand to avoid double-counting.
    const claimed: Array<[number, number]> = [];

    for (const alias of sortedAliases) {
      let searchFrom = 0;
      while (searchFrom < responseText.length) {
        const idx = matchesAlias(responseText.slice(searchFrom), alias);
        if (idx === -1) break;

        const start = searchFrom + idx;
        const end = start + alias.aliasText.length;

        // Skip if this range overlaps a longer alias already claimed.
        const overlaps = claimed.some(([s, e]) => start < e && end > s);
        if (!overlaps) {
          claimed.push([start, end]);
          const section = detectSection(responseText, start);
          const rank = detectRecommendationRank(responseText, start);
          mentions.push({
            brandId: brand.id,
            matchedText: alias.aliasText,
            matchType: alias.matchType,
            section,
            recommendationRank: rank,
            confidence: 1.0,
            evidenceExcerpt: extractExcerpt(responseText, start, alias.aliasText.length),
          });
        }

        searchFrom = end || searchFrom + 1;
      }
    }
  }

  // Brand records hold primary_domain as either a bare domain
  // ("acme.com") or a full URL ("https://www.rival.com/"); only prefix
  // a scheme when one is missing so both forms resolve to a root domain.
  const brandRootDomain = (primaryDomain: string): string =>
    extractRootDomain(
      primaryDomain.includes("://") ? primaryDomain : `https://${primaryDomain}`
    );

  const parsedCitations: ParsedCitation[] = citations.map((c) => {
    const rootDomain = extractRootDomain(c.url);
    const owner = brands.find(
      (b) => b.primaryDomain && brandRootDomain(b.primaryDomain) === rootDomain
    );
    return {
      url: c.url,
      rootDomain,
      ownedByBrandId: owner?.id ?? null,
      position: c.position,
      isTrustedThirdParty: false, // derived from the source class in the parse-response handler
    };
  });

  return { mentions, citations: parsedCitations };
}
