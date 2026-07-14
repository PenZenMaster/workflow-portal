/*
 * Module/Script Name: sourceDomainStore.ts
 * Path: server/storage/sourceDomainStore.ts
 *
 * Description:
 * Data-access layer for the source_domains registry (YLG visibility
 * spec section 6.3). Domains are globally classified into the six
 * registry source classes; ownership classes are derived from brand
 * domains at parse time and never stored here. seedDefaults inserts
 * unambiguous review platforms and directories without ever
 * overwriting a human reclassification.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-14
 * Last Modified Date: 2026-07-14
 * Comments:
 * - v1.00 YLG defensibility sprint - source registry slice
 */

import { sourceDomains, responseCitations } from "@shared/schema";
import type { RegistrySourceClass, SourceDomain } from "@shared/schema";
import { eq, notInArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

type DrizzleDb = ReturnType<typeof drizzle>;
type Row = typeof sourceDomains.$inferSelect;

// Seed registry: only domains whose class is unambiguous under the spec's
// definitions. Everything else stays unregistered and surfaces in the
// unreviewed queue for the monthly review.
export const SOURCE_DOMAIN_SEEDS: ReadonlyArray<{
  rootDomain: string;
  sourceClass: RegistrySourceClass;
  rationale: string;
}> = [
  { rootDomain: "yelp.com", sourceClass: "review_platform", rationale: "Consumer review platform" },
  { rootDomain: "bbb.org", sourceClass: "review_platform", rationale: "Better Business Bureau profiles" },
  { rootDomain: "angi.com", sourceClass: "review_platform", rationale: "Home-services review platform" },
  { rootDomain: "houzz.com", sourceClass: "review_platform", rationale: "Home design/build review platform" },
  { rootDomain: "thumbtack.com", sourceClass: "review_platform", rationale: "Local-services review platform" },
  { rootDomain: "trustpilot.com", sourceClass: "review_platform", rationale: "Consumer review platform" },
  { rootDomain: "homeadvisor.com", sourceClass: "review_platform", rationale: "Home-services review platform" },
  { rootDomain: "yellowpages.com", sourceClass: "general_directory", rationale: "Broad business directory" },
  { rootDomain: "zoominfo.com", sourceClass: "general_directory", rationale: "Business data directory" },
  { rootDomain: "manta.com", sourceClass: "general_directory", rationale: "Broad business directory" },
  { rootDomain: "dnb.com", sourceClass: "general_directory", rationale: "Dun & Bradstreet business directory" },
  { rootDomain: "mapquest.com", sourceClass: "general_directory", rationale: "Map/business listing directory" },
  { rootDomain: "foursquare.com", sourceClass: "general_directory", rationale: "Location listing directory" },
];

function hydrate(row: Row): SourceDomain {
  return {
    id: row.id,
    rootDomain: row.rootDomain,
    sourceClass: row.sourceClass as RegistrySourceClass,
    rationale: row.rationale,
    classifiedBy: row.classifiedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface SourceDomainUpsertInput {
  sourceClass: RegistrySourceClass;
  rationale: string;
  classifiedBy: string;
}

export interface UnreviewedDomain {
  rootDomain: string;
  citationCount: number;
}

export interface ISourceDomainStore {
  list(filter?: { sourceClass?: RegistrySourceClass }): Promise<SourceDomain[]>;
  getByDomain(rootDomain: string): Promise<SourceDomain | undefined>;
  upsert(rootDomain: string, data: SourceDomainUpsertInput): Promise<SourceDomain>;
  getMapForDomains(rootDomains: string[]): Promise<Map<string, RegistrySourceClass>>;
  listUnreviewed(limit?: number): Promise<UnreviewedDomain[]>;
  seedDefaults(): Promise<void>;
}

export class SourceDomainStore implements ISourceDomainStore {
  constructor(private readonly _db: DrizzleDb) {}

  async list(filter: { sourceClass?: RegistrySourceClass } = {}): Promise<SourceDomain[]> {
    const query = this._db.select().from(sourceDomains);
    const rows = filter.sourceClass
      ? query.where(eq(sourceDomains.sourceClass, filter.sourceClass)).all()
      : query.all();
    return rows
      .map(hydrate)
      .sort((a, b) => a.rootDomain.localeCompare(b.rootDomain));
  }

  async getByDomain(rootDomain: string): Promise<SourceDomain | undefined> {
    const row = this._db
      .select()
      .from(sourceDomains)
      .where(eq(sourceDomains.rootDomain, rootDomain))
      .get();
    return row ? hydrate(row) : undefined;
  }

  async upsert(rootDomain: string, data: SourceDomainUpsertInput): Promise<SourceDomain> {
    const now = Date.now();
    const row = this._db
      .insert(sourceDomains)
      .values({
        rootDomain,
        sourceClass: data.sourceClass,
        rationale: data.rationale,
        classifiedBy: data.classifiedBy,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: sourceDomains.rootDomain,
        set: {
          sourceClass: data.sourceClass,
          rationale: data.rationale,
          classifiedBy: data.classifiedBy,
          updatedAt: now,
        },
      })
      .returning()
      .get();
    return hydrate(row);
  }

  async getMapForDomains(rootDomains: string[]): Promise<Map<string, RegistrySourceClass>> {
    if (rootDomains.length === 0) return new Map();
    const map = new Map<string, RegistrySourceClass>();
    for (const domain of rootDomains) {
      const row = this._db
        .select()
        .from(sourceDomains)
        .where(eq(sourceDomains.rootDomain, domain))
        .get();
      if (row) map.set(row.rootDomain, row.sourceClass as RegistrySourceClass);
    }
    return map;
  }

  async listUnreviewed(limit = 100): Promise<UnreviewedDomain[]> {
    const registered = this._db
      .select({ rootDomain: sourceDomains.rootDomain })
      .from(sourceDomains);
    const rows = this._db
      .select({
        rootDomain: responseCitations.rootDomain,
        citationCount: sql<number>`count(*)`,
      })
      .from(responseCitations)
      .where(notInArray(responseCitations.rootDomain, registered))
      .groupBy(responseCitations.rootDomain)
      .orderBy(sql`count(*) desc`)
      .limit(limit)
      .all();
    return rows.map((r) => ({ rootDomain: r.rootDomain, citationCount: r.citationCount }));
  }

  async seedDefaults(): Promise<void> {
    const now = Date.now();
    for (const seed of SOURCE_DOMAIN_SEEDS) {
      this._db
        .insert(sourceDomains)
        .values({
          rootDomain: seed.rootDomain,
          sourceClass: seed.sourceClass,
          rationale: seed.rationale,
          classifiedBy: "seed",
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .run();
    }
  }
}
