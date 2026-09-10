/*
 * Module/Script Name: clientDomainMatch.ts
 * Path: server/services/clientDomainMatch.ts
 *
 * Description:
 * Pure domain-matching logic for automatically resolving which client a
 * RankRocket-MCP site registry entry belongs to, by comparing the site's
 * baseUrl against every client's primaryDomain. Built to remove the manual
 * "pick any site key for any client" step that let a real mismatch happen
 * (tristate-hvac assigned to a completely unrelated client) - the match is
 * now made programmatically when a site is created/updated
 * (server/mcp/sitesAdmin.ts), never hand-picked.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-09-09
 * Last Modified Date: 2026-09-09
 * Comments:
 * - v1.00 Initial implementation
 */

import type { Client } from "@shared/schema";

// Normalizes a URL or bare host to a comparable form: strips protocol, a
// leading "www.", any path/query, and lowercases. Deliberately does NOT
// strip other subdomains - "shop.example.com" is treated as genuinely
// different from "example.com", not a fuzzy match.
export function normalizeHost(urlOrHost: string): string {
  let host = urlOrHost.trim().toLowerCase();
  host = host.replace(/^https?:\/\//, "");
  host = host.split(/[/?#]/)[0];
  host = host.replace(/^www\./, "");
  return host;
}

export type ClientDomainMatch =
  | { status: "matched"; client: Client }
  | { status: "no_match" }
  | { status: "ambiguous"; clients: Client[] };

export function matchClientForBaseUrl(baseUrl: string, clients: Client[]): ClientDomainMatch {
  const targetHost = normalizeHost(baseUrl);
  const matches = clients.filter((c) => normalizeHost(c.primaryDomain) === targetHost);
  if (matches.length === 0) return { status: "no_match" };
  if (matches.length > 1) return { status: "ambiguous", clients: matches };
  return { status: "matched", client: matches[0] };
}
