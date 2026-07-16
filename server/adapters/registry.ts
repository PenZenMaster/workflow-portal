import type { PlatformAdapter } from "./types";
import { PerplexityAdapter } from "./perplexity";
import { OpenAIAdapter } from "./openai";
import { AnthropicAdapter } from "./anthropic";
import { GeminiAdapter } from "./gemini";
import { GroqAdapter } from "./groq";
import { MistralAdapter } from "./mistral";
import { DeepSeekAdapter } from "./deepseek";

function buildAdapters(): Map<string, PlatformAdapter> {
  const map = new Map<string, PlatformAdapter>();

  if (process.env.PERPLEXITY_API_KEY)
    map.set("perplexity", new PerplexityAdapter(process.env.PERPLEXITY_API_KEY));
  if (process.env.OPENAI_API_KEY)
    map.set("openai", new OpenAIAdapter(process.env.OPENAI_API_KEY));
  if (process.env.ANTHROPIC_API_KEY)
    map.set("anthropic", new AnthropicAdapter(process.env.ANTHROPIC_API_KEY));
  if (process.env.GOOGLE_AI_API_KEY)
    map.set("gemini", new GeminiAdapter(process.env.GOOGLE_AI_API_KEY));
  if (process.env.GROQ_API_KEY)
    map.set("groq", new GroqAdapter(process.env.GROQ_API_KEY));
  if (process.env.MISTRAL_API_KEY)
    map.set("mistral", new MistralAdapter(process.env.MISTRAL_API_KEY));
  if (process.env.DEEPSEEK_API_KEY)
    map.set("deepseek", new DeepSeekAdapter(process.env.DEEPSEEK_API_KEY));

  return map;
}

const _adapters = buildAdapters();

export function getAdapter(slug: string): PlatformAdapter | undefined {
  return _adapters.get(slug);
}

export function getConfiguredSlugs(): string[] {
  return Array.from(_adapters.keys());
}

// --- Utility tier (issue #2 F4) ---------------------------------------------
// Internal calls (prompt generation, workflow CSV runs) use economy models
// with a larger output cap; measurement surfaces keep their default models.
// Built on demand so UTILITY_MODEL_<SLUG> env overrides apply per call.

const UTILITY_MAX_TOKENS = 4096; // generation returns long JSON payloads

const UTILITY_MODEL_DEFAULTS: Record<string, string | undefined> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-4-5-20251001",
  mistral: "mistral-small-latest",
  // gemini/groq/deepseek/perplexity defaults are already economy-tier
};

type UtilityOpts = { model?: string; maxTokens?: number };

const UTILITY_FACTORIES: Record<
  string,
  { envKey: string; build: (key: string, opts: UtilityOpts) => PlatformAdapter }
> = {
  perplexity: { envKey: "PERPLEXITY_API_KEY", build: (k, o) => new PerplexityAdapter(k, o) },
  openai: { envKey: "OPENAI_API_KEY", build: (k, o) => new OpenAIAdapter(k, o) },
  anthropic: { envKey: "ANTHROPIC_API_KEY", build: (k, o) => new AnthropicAdapter(k, o) },
  gemini: { envKey: "GOOGLE_AI_API_KEY", build: (k, o) => new GeminiAdapter(k, o) },
  groq: { envKey: "GROQ_API_KEY", build: (k, o) => new GroqAdapter(k, o) },
  mistral: { envKey: "MISTRAL_API_KEY", build: (k, o) => new MistralAdapter(k, o) },
  deepseek: { envKey: "DEEPSEEK_API_KEY", build: (k, o) => new DeepSeekAdapter(k, o) },
};

export function getUtilityAdapter(slug: string): PlatformAdapter | undefined {
  const factory = UTILITY_FACTORIES[slug];
  if (!factory) return undefined;
  const key = process.env[factory.envKey];
  if (!key) return undefined;
  const model =
    process.env[`UTILITY_MODEL_${slug.toUpperCase()}`] || UTILITY_MODEL_DEFAULTS[slug];
  return factory.build(key, { model, maxTokens: UTILITY_MAX_TOKENS });
}
