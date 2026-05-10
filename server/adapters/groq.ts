import { OpenAICompatibleAdapter } from "./openaiCompatible";

export class GroqAdapter extends OpenAICompatibleAdapter {
  constructor(apiKey: string, opts: { model?: string; timeoutMs?: number; retryDelayMs?: number } = {}) {
    super("groq", apiKey, "https://api.groq.com/openai/v1/chat/completions", "llama-3.3-70b-versatile", opts);
  }
}
