/*
 * Module/Script Name: phrasingRichness.ts
 * Path: server/services/phrasingRichness.ts
 *
 * Description:
 * Phrasing/context-richness scoring for a prompt's text (issue #27).
 * Deterministic heuristic, chosen over an LLM-as-judge approach 2026-07-30
 * to keep this a pure, zero-cost function alongside the rest of
 * collectionDiagnostics.ts's diagnostics - a prompt that reads like a
 * bare keyword phrase produces less representative measurement data than
 * one that reads like a natural, persona-rich question, but nothing
 * scored that distinction before this. Pure function, no DB access.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-30
 * Last Modified Date: 2026-07-30
 * Comments:
 * - v1.00 issue #27 initial implementation
 */

export type PhrasingRichness = "context_rich" | "keyword_style";

const QUESTION_WORDS = ["who", "what", "when", "where", "why", "how", "which", "can", "does", "do", "is", "are"];
const FIRST_PERSON_MARKERS = ["i'm", "i am", "i need", "my ", "we're", "we need"];
const QUALIFIER_KEYWORDS = [
  "budget",
  "cost",
  "price",
  "wedding",
  "event",
  "party",
  "how many",
  "guests",
  "people",
  "today",
  "tomorrow",
  "weekend",
  "urgent",
  "asap",
  "deadline",
  "date",
];
const QUALIFIER_QUANTITY_PATTERN = /\b\d+[- ]?(person|people|guests|day|days|week|weeks|month|months|year|years)\b/;

function hasQuestionOrFirstPersonPhrasing(lowerText: string, trimmedText: string): boolean {
  if (trimmedText.includes("?")) return true;
  const firstWord = lowerText.split(/\s+/)[0]?.replace(/[^a-z]/g, "");
  if (firstWord && QUESTION_WORDS.includes(firstWord)) return true;
  return FIRST_PERSON_MARKERS.some((marker) => lowerText.includes(marker));
}

function hasContextualQualifier(lowerText: string): boolean {
  if (QUALIFIER_KEYWORDS.some((keyword) => lowerText.includes(keyword))) return true;
  return QUALIFIER_QUANTITY_PATTERN.test(lowerText);
}

export function scorePhrasingRichness(text: string): PhrasingRichness {
  const trimmedText = text.trim();
  const lowerText = trimmedText.toLowerCase();
  const wordCount = trimmedText.split(/\s+/).filter(Boolean).length;

  let signalCount = 0;
  if (wordCount >= 8) signalCount += 1;
  if (hasQuestionOrFirstPersonPhrasing(lowerText, trimmedText)) signalCount += 1;
  if (hasContextualQualifier(lowerText)) signalCount += 1;

  return signalCount >= 2 ? "context_rich" : "keyword_style";
}
