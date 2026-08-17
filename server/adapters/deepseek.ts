import { OpenAICompatibleAdapter } from "./openaiCompatible";

// "deepseek-chat" was hard-retired by DeepSeek 2026-07-24 with no redirect;
// deepseek-v4-flash (non-thinking mode) is its documented replacement
// (see docs/system-documentation.md).
export class DeepSeekAdapter extends OpenAICompatibleAdapter {
  constructor(apiKey: string, opts: { model?: string; timeoutMs?: number; retryDelayMs?: number } = {}) {
    super("deepseek", apiKey, "https://api.deepseek.com/v1/chat/completions", "deepseek-v4-flash", opts);
  }
}
