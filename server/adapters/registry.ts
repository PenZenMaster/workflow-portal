/*
 * Module/Script Name: registry.ts
 * Path: server/adapters/registry.ts
 *
 * Description:
 * Maps platform slugs to adapter instances. Add new adapters here as
 * additional AI platforms are supported.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-09
 * Last Modified Date: 2026-05-09
 * Comments:
 * - v1.00 Sprint 3 — Perplexity only
 */

import type { PlatformAdapter } from "./types";
import { PerplexityAdapter } from "./perplexity";

function buildAdapters(): Map<string, PlatformAdapter> {
  const map = new Map<string, PlatformAdapter>();
  const key = process.env.PERPLEXITY_API_KEY ?? "";
  if (key) {
    map.set("perplexity", new PerplexityAdapter(key));
  }
  return map;
}

const _adapters = buildAdapters();

export function getAdapter(slug: string): PlatformAdapter | undefined {
  return _adapters.get(slug);
}
