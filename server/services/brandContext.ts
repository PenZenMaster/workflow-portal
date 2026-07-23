/*
 * Module/Script Name: brandContext.ts
 * Path: server/services/brandContext.ts
 *
 * Description:
 * Deterministic brand-context classifier (issue #4 Phase 1 slice 2).
 * Given a prompt's text and the client's brand/competitor roster, derives
 * whether the text is unbranded, client-branded, competitor-branded, or
 * both. Reuses parser.ts's matchesAlias so mention detection and
 * brand-context derivation never disagree about whether a brand appears
 * in a given piece of text. Pure function, no DB access.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-23
 * Last Modified Date: 2026-07-23
 * Comments:
 * - v1.00 issue #4 Phase 1 slice 2 initial implementation
 */

import type { BrandContext } from "@shared/schema";
import { matchesAlias, type AliasInput, type BrandInput } from "./parser";

export const BRAND_CONTEXT_CLASSIFIER_VERSION = "rules-1.0";

function brandMentioned(text: string, brand: BrandInput): boolean {
  // Canonical name always counts as an implicit exact alias, matching
  // parser.ts's PARSER_VERSION 1.1 behavior: a brand with no alias rows
  // is still detectable.
  const canonical = brand.canonicalName.trim();
  const effectiveAliases: AliasInput[] = [...brand.aliases];
  if (
    canonical.length > 0 &&
    !effectiveAliases.some((a) => a.aliasText.toLowerCase() === canonical.toLowerCase())
  ) {
    effectiveAliases.push({ aliasText: canonical, matchType: "exact" });
  }
  return effectiveAliases.some((alias) => matchesAlias(text, alias) !== -1);
}

export function deriveBrandContext(
  text: string,
  clientBrands: BrandInput[],
  competitorBrands: BrandInput[]
): BrandContext {
  const hasClient = clientBrands.some((b) => brandMentioned(text, b));
  const hasCompetitor = competitorBrands.some((b) => brandMentioned(text, b));

  if (hasClient && hasCompetitor) return "client_and_competitor";
  if (hasClient) return "client_branded";
  if (hasCompetitor) return "competitor_branded";
  return "unbranded";
}
