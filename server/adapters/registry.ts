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
