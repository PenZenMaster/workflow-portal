/*
 * Module/Script Name: costEstimate.ts
 * Path: server/services/costEstimate.ts
 *
 * Description:
 * Estimates USD cost of a completed adapter call from its platform,
 * requested model, and token usage, against a static published-list-price
 * table (issue #35 slice 4).
 *
 * This is an ESTIMATE, not a billed-cost reconciliation: it uses each
 * provider's standard published rate as of the date below, ignoring
 * prompt caching, batch discounts, and (for DeepSeek) time-of-day
 * peak/off-peak pricing. It needs manual upkeep whenever a provider
 * changes pricing or an adapter's default/utility model changes - there
 * is no live pricing API integration.
 *
 * Pricing sourced 2026-08-17 from each provider's official pricing page,
 * except Groq (JS-rendered pricing page could not be fetched directly;
 * sourced from third-party tracker consensus - verify against
 * console.groq.com/pricing if precision matters) and DeepSeek (off-peak
 * rate used as the baseline; peak-hour surcharge not modeled).
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-17
 * Last Modified Date: 2026-08-17
 * Comments:
 * - v1.00 issue #35 slice 4
 */

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

// Keyed by platform slug (matches platforms.slug / adapter registry.ts
// keys), then by the exact requestedModel string an adapter would set.
// Only models this codebase's adapters actually default or override to
// are listed - an unrecognized model returns null rather than a guess.
const PRICING_TABLE: Record<string, Record<string, ModelPricing>> = {
  perplexity: {
    sonar: { inputPerMillion: 1, outputPerMillion: 1 },
  },
  openai: {
    "gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10 },
    "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 }, // utility tier
  },
  anthropic: {
    "claude-opus-4-5": { inputPerMillion: 5, outputPerMillion: 25 },
    "claude-haiku-4-5-20251001": { inputPerMillion: 1, outputPerMillion: 5 }, // utility tier
  },
  gemini: {
    "gemini-3.5-flash": { inputPerMillion: 1.5, outputPerMillion: 9 },
  },
  groq: {
    "llama-3.3-70b-versatile": { inputPerMillion: 0.59, outputPerMillion: 0.79 },
  },
  mistral: {
    "mistral-large-latest": { inputPerMillion: 0.5, outputPerMillion: 1.5 },
    "mistral-small-latest": { inputPerMillion: 0.15, outputPerMillion: 0.6 }, // utility tier
  },
  deepseek: {
    "deepseek-v4-flash": { inputPerMillion: 0.22, outputPerMillion: 0.66 }, // off-peak
  },
};

export function estimateCostUsd(
  platformSlug: string,
  model: string | null,
  usage: { inputTokens: number; outputTokens: number } | null
): number | null {
  if (!model || !usage) return null;
  const pricing = PRICING_TABLE[platformSlug]?.[model];
  if (!pricing) return null;
  return (
    (usage.inputTokens * pricing.inputPerMillion + usage.outputTokens * pricing.outputPerMillion) /
    1_000_000
  );
}
