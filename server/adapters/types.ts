/*
 * Module/Script Name: types.ts
 * Path: server/adapters/types.ts
 *
 * Description:
 * Shared interfaces for AI platform adapters. All adapters implement
 * PlatformAdapter so new platforms can be added without touching callers.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-09
 * Last Modified Date: 2026-05-09
 * Comments:
 * - v1.00 Sprint 3 initial implementation
 * - v1.01 issue #3 Epic 1 slice 1 (issue #35): capability declarations.
 *   Verified against actual adapter behavior, not the provider's raw API
 *   surface - e.g. citationSupport is false for every platform whose
 *   "citations" are really just extractUrlCitations() regexing URLs out
 *   of response text, even though the underlying provider API might
 *   technically support something more (unused by this codebase today).
 */

// Declares what this app's integration with a platform actually does,
// not a survey of the provider's full raw API surface. citationSupport
// true only for a provider with a native, structured citations field
// this adapter actually reads (currently: Perplexity only) - every other
// platform's "citations" are extractUrlCitations() regexing URLs out of
// free response text, which is not real citation support.
export interface AdapterCapabilities {
  citationSupport: boolean;
  orderedCitationSupport: boolean;
  webSearchGrounding: boolean;
  modelSelection: boolean;
  temperatureControl: boolean;
  locationContext: boolean;
  citationExtractionMethod: "native_structured" | "text_url_regex";
}

// issue #35 slice 3: a distinguishable error type for a timed-out
// provider call, so callers (the prompt-run job handler) can tell "the
// provider took too long" apart from every other failure reason without
// string-matching the error message.
export class AdapterTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdapterTimeoutError";
  }
}

// Distinguishes "the tool loop ran out of iterations while the model still
// wanted to call tools" (no final answer was ever produced) from a normal
// completion that happens to have empty text - so callers never mistake an
// exhausted loop for a genuine empty-but-successful response.
export class AdapterMaxIterationsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdapterMaxIterationsError";
  }
}

export interface CitationRef {
  url: string;
  position: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface RawResponse {
  text: string;
  summaryBlock: string | null;
  citations: CitationRef[];
  // the model this adapter instance was actually configured to call
  // (issue #35 slice 2) - captured independent of modelVariant, which is
  // whatever the provider reports back and silently falls back to this
  // same requested value when a provider omits it from its response.
  requestedModel: string;
  modelVariant: string | null;
  latencyMs: number;
  rawPayload: unknown;
  // null when the provider did not return a usage block
  usage: TokenUsage | null;
  // issue #35 slice 4: the provider's own response/request id, for tracing
  // a specific call back through the provider's own logs or a billing
  // dispute. Null when the provider's response body has no such field
  // (e.g. Gemini's generateContent), not a missed extraction.
  providerRequestId: string | null;
}

export interface RunOptions {
  geo?: string;
  locale?: string;
}

export interface PlatformAdapter {
  readonly id: string;
  readonly capabilities: AdapterCapabilities;
  run(prompt: string, opts?: RunOptions): Promise<RawResponse>;
}
