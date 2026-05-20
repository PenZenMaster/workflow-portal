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
 */

export interface CitationRef {
  url: string;
  position: number;
}

export interface RawResponse {
  text: string;
  summaryBlock: string | null;
  citations: CitationRef[];
  modelVariant: string | null;
  latencyMs: number;
  rawPayload: unknown;
}

export interface RunOptions {
  geo?: string;
  locale?: string;
}

export interface PlatformAdapter {
  readonly id: string;
  run(prompt: string, opts?: RunOptions): Promise<RawResponse>;
}
