import { OpenAICompatibleAdapter } from "./openaiCompatible";

export class MistralAdapter extends OpenAICompatibleAdapter {
  constructor(apiKey: string, opts: { model?: string; timeoutMs?: number; retryDelayMs?: number } = {}) {
    super("mistral", apiKey, "https://api.mistral.ai/v1/chat/completions", "mistral-large-latest", opts);
  }
}
