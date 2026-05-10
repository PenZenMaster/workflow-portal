import { OpenAICompatibleAdapter } from "./openaiCompatible";

export class DeepSeekAdapter extends OpenAICompatibleAdapter {
  constructor(apiKey: string, opts: { model?: string; timeoutMs?: number; retryDelayMs?: number } = {}) {
    super("deepseek", apiKey, "https://api.deepseek.com/v1/chat/completions", "deepseek-chat", opts);
  }
}
