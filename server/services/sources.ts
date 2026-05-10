/*
 * Module/Script Name: sources.ts
 * Path: server/services/sources.ts
 *
 * Description:
 * Analyses citation data to surface top cited domains, owned vs third-party
 * split, and competitor source overlap. All computations are pure functions
 * over existing citation rows — no DB access.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-05-10
 * Last Modified Date: 2026-05-10
 * Comments:
 * - v1.00 Sprint 6 initial implementation
 */

import type { ResponseCitation } from "@shared/schema";

export interface DomainCount {
  rootDomain: string;
  count: number;
  isOwnedByClient: boolean;
}

export interface SourceAnalysis {
  domainCounts: DomainCount[];
  ownedCount: number;
  thirdPartyCount: number;
  ownedPercent: number;
  topDomains: DomainCount[];
}

export function analyzeSources(
  citations: ResponseCitation[],
  clientBrandId: number,
  topN = 10
): SourceAnalysis {
  if (citations.length === 0) {
    return { domainCounts: [], ownedCount: 0, thirdPartyCount: 0, ownedPercent: 0, topDomains: [] };
  }

  // Aggregate counts per domain
  const domainMap = new Map<string, DomainCount>();
  for (const c of citations) {
    const existing = domainMap.get(c.rootDomain);
    if (existing) {
      existing.count++;
    } else {
      domainMap.set(c.rootDomain, {
        rootDomain: c.rootDomain,
        count: 1,
        isOwnedByClient: c.ownedByBrandId === clientBrandId,
      });
    }
  }

  const domainCounts = Array.from(domainMap.values()).sort(
    (a, b) => b.count - a.count
  );

  const ownedCount = citations.filter((c) => c.ownedByBrandId === clientBrandId).length;
  const thirdPartyCount = citations.length - ownedCount;
  const ownedPercent =
    citations.length > 0 ? (ownedCount / citations.length) * 100 : 0;

  return {
    domainCounts,
    ownedCount,
    thirdPartyCount,
    ownedPercent: Math.round(ownedPercent * 100) / 100,
    topDomains: domainCounts.slice(0, topN),
  };
}

export function getTopDomains(citations: ResponseCitation[], limit: number): DomainCount[] {
  const map = new Map<string, number>();
  for (const c of citations) {
    map.set(c.rootDomain, (map.get(c.rootDomain) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([rootDomain, count]) => ({ rootDomain, count, isOwnedByClient: false }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
