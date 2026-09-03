import { OpenAICompatibleAdapter } from "./openaiCompatible";

// "mistral-large-latest" was retired by Mistral - it no longer appears in
// GET /v1/models and every chat completion against it 403s with
// tier_not_allowed. mistral-medium-latest (currently mistral-medium-3-5) is
// Mistral's current flagship chat model and is confirmed working.
const DEFAULT_MODEL = "mistral-medium-latest";

export class MistralAdapter extends OpenAICompatibleAdapter {
  constructor(apiKey: string, opts: { model?: string; timeoutMs?: number; retryDelayMs?: number } = {}) {
    super("mistral", apiKey, "https://api.mistral.ai/v1/chat/completions", DEFAULT_MODEL, opts);
  }
}
