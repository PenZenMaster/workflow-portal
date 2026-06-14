/*
 * Module/Script Name: promptGenerator.ts
 * Path: server/services/promptGenerator.ts
 *
 * Description:
 * AI-assisted prompt generation for Prompt Collections (B-12). Builds a
 * research prompt from client/brand/competitor context, sends it to the
 * first configured LLM adapter, and parses the response into candidate
 * prompts grouped by type. Generation is read-only and does not persist
 * anything; the caller is responsible for saving selected candidates via
 * the existing bulk prompt-import endpoint.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-06-14
 * Last Modified Date: 2026-06-14
 * Comments:
 * - v1.00 Initial implementation (B-12)
 */

import { getAdapter } from "../adapters/registry";
import type { PlatformAdapter } from "../adapters/types";
import { AppError } from "../errors";
import { insertPromptSchema, type GeneratedPromptCandidate } from "@shared/schema";

const GENERATION_ADAPTER_ORDER = [
  "openai",
  "anthropic",
  "gemini",
  "perplexity",
  "groq",
  "mistral",
  "deepseek",
] as const;

export interface GenerationContext {
  clientName: string;
  primaryDomain: string;
  geographies: string[];
  clientBrandNames: string[];
  competitorNames: string[];
  count: number;
}

const candidateSchema = insertPromptSchema.pick({
  text: true,
  category: true,
  funnelStage: true,
});

export function pickGenerationAdapter(): PlatformAdapter {
  for (const slug of GENERATION_ADAPTER_ORDER) {
    const adapter = getAdapter(slug);
    if (adapter) return adapter;
  }
  throw new AppError(503, "No AI platform is configured for prompt generation", "NO_GENERATION_ADAPTER");
}

export function buildGenerationPrompt(ctx: GenerationContext): string {
  const competitorList = ctx.competitorNames.length > 0 ? ctx.competitorNames.join(", ") : "(none configured)";
  const geoList = ctx.geographies.length > 0 ? ctx.geographies.join(", ") : "(none configured)";
  const brandList = ctx.clientBrandNames.join(", ");

  return [
    "You are an AI visibility researcher. Generate a set of search/chat prompts that real",
    "users might type into AI assistants (ChatGPT, Perplexity, Gemini, etc.) when researching",
    "a topic related to the client described below.",
    "",
    `Client name: ${ctx.clientName}`,
    `Client brand name(s): ${brandList}`,
    `Client website: ${ctx.primaryDomain}`,
    `Client geographies: ${geoList}`,
    `Known competitors: ${competitorList}`,
    "",
    `Generate exactly ${ctx.count} prompts in total, distributed across these 6 prompt types:`,
    "",
    "- informational: broad research questions about the client's subject area, e.g. \"What is the best way to solve X?\"",
    "- comparative: prompts comparing the client brand against a competitor, e.g. \"Brand A vs Brand B\"",
    "- commercial: prompts with buying/shortlist intent, e.g. \"Best software for X\"",
    "- local: prompts with geographic intent, e.g. \"Best emergency plumber near Seattle\"",
    "- problem_aware: prompts describing a symptom or problem the client's product/service solves, e.g. \"Why is my furnace making noise?\"",
    "- alternative: prompts seeking alternatives to a competitor, e.g. \"Alternatives to [competitor]\"",
    "",
    "Respond with ONLY a JSON array, no prose, no markdown code fences. Each element must be an",
    "object with exactly these keys:",
    '  "text": string - the prompt text',
    '  "category": one of "informational", "comparative", "commercial", "local", "problem_aware", "alternative"',
    '  "funnelStage": one of "awareness", "consideration", "decision"',
  ].join("\n");
}

export function parseGeneratedPrompts(raw: string): GeneratedPromptCandidate[] {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidateText = fenced ? fenced[1] : raw;

  const start = candidateText.indexOf("[");
  const end = candidateText.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new AppError(502, "AI response did not contain a JSON array of prompts", "GENERATION_PARSE_ERROR");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidateText.slice(start, end + 1));
  } catch {
    throw new AppError(502, "AI response was not valid JSON", "GENERATION_PARSE_ERROR");
  }

  if (!Array.isArray(parsed)) {
    throw new AppError(502, "AI response did not contain a JSON array of prompts", "GENERATION_PARSE_ERROR");
  }

  const candidates: GeneratedPromptCandidate[] = [];
  for (const item of parsed) {
    const result = candidateSchema.safeParse(item);
    if (result.success) {
      candidates.push(result.data);
    }
  }

  return candidates;
}

export async function generatePrompts(ctx: GenerationContext): Promise<GeneratedPromptCandidate[]> {
  const adapter = pickGenerationAdapter();
  const response = await adapter.run(buildGenerationPrompt(ctx));
  return parseGeneratedPrompts(response.text);
}
