import { OpenAICompatibleAdapter } from "./openaiCompatible";

export class OpenAIAdapter extends OpenAICompatibleAdapter {
  constructor(apiKey: string, opts: { model?: string; timeoutMs?: number; retryDelayMs?: number } = {}) {
    super("openai", apiKey, "https://api.openai.com/v1/chat/completions", "gpt-4o", opts);
  }
}
