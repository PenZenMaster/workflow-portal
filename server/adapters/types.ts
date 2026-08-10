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
  modelVariant: string | null;
  latencyMs: number;
  rawPayload: unknown;
  // null when the provider did not return a usage block
  usage: TokenUsage | null;
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
