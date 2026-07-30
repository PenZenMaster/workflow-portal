/*
 * Module/Script Name: nearDuplicate.ts
 * Path: server/services/nearDuplicate.ts
 *
 * Description:
 * Semantic near-duplicate detection for generated prompt candidates
 * (issue #4 Phase 2 item 7). Normalized exact matching (see
 * promptGenerator.ts's normalizePromptText) only catches punctuation/
 * case/whitespace variants; this adds a second-stage token/Jaccard
 * similarity check so differently-worded prompts asking the same
 * measurement question are also caught. First-pass heuristic per the
 * issue's own framing ("may use token/Jaccard similarity... suggested
 * threshold") - plain lowercased tokens with a small stopword list, no
 * stemming, so related word forms (e.g. "roofers" vs "roofing") are not
 * merged. Pure functions, no DB access.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-24
 * Last Modified Date: 2026-07-29
 * Comments:
 * - v1.00 issue #4 Phase 2 item 7 initial implementation
 * - v1.01 issue #4 Phase 3 item J (slice 5): normalizePromptText moved
 *   here from promptGenerator.ts - both are text-normalization/duplicate-
 *   detection concerns, and collectionDiagnostics.ts needed it without
 *   pulling in promptGenerator.ts (whose LLM-adapter dependency several
 *   test files mock wholesale, which broke unrelated pure-function
 *   imports from the same module)
 */

// Normalization for exact-duplicate detection: case, leading numbering,
// punctuation, and whitespace variants collapse to the same key.
export function normalizePromptText(text: string): string {
  return text
    .toLowerCase()
    .replace(/^\s*\d+[.)]\s*/, "")
    .replace(/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set([
  "a", "an", "the",
  "is", "are", "was", "were", "be", "been", "being",
  "of", "in", "on", "at", "to", "for", "and", "or", "but",
  "who", "what", "which", "that", "this", "these", "those",
  "how", "when", "where", "why",
  "do", "does", "did", "has", "have", "had",
  "i", "you", "he", "she", "it", "we", "they",
  "my", "your", "his", "her", "its", "our", "their",
  "with", "as", "by", "from", "about", "into",
]);

export function tokenize(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 0 && !STOPWORDS.has(w));
  return new Set(words);
}

export function jaccardSimilarity(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (tokensA.size === 0 && tokensB.size === 0) return 0;

  let intersectionSize = 0;
  tokensA.forEach((t) => {
    if (tokensB.has(t)) intersectionSize++;
  });
  const unionSize = tokensA.size + tokensB.size - intersectionSize;
  return unionSize === 0 ? 0 : intersectionSize / unionSize;
}

export const DEFAULT_NEAR_DUPLICATE_THRESHOLD = 0.75;

export function isNearDuplicate(
  a: string,
  b: string,
  threshold: number = DEFAULT_NEAR_DUPLICATE_THRESHOLD
): boolean {
  return jaccardSimilarity(a, b) >= threshold;
}
