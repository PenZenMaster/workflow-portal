/*
 * Module/Script Name: sourceDomains.ts
 * Path: server/routes/sourceDomains.ts
 *
 * Description:
 * REST API for the source-domain registry (YLG visibility spec section
 * 6.3): list/filter the registry, upsert a domain classification with a
 * required rationale, and the unreviewed-domains queue that powers the
 * monthly review of newly observed citation domains. Admin roles only.
 * Ownership classes (client_owned/competitor_owned) are derived from
 * brand domains at parse time and are rejected here.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-14
 * Last Modified Date: 2026-07-14
 * Comments:
 * - v1.00 YLG defensibility sprint - source registry slice
 */

import type { Express } from "express";
import { sourceDomainStore } from "../storage";
import { REGISTRY_SOURCE_CLASSES, upsertSourceDomainSchema } from "@shared/schema";
import type { RegistrySourceClass } from "@shared/schema";
import { requireRole } from "../auth";
import { ok } from "../response";
import { AppError } from "../errors";

const ADMIN_ROLES = ["super_admin", "agency_admin"] as const;

// Lowercased root domain: at least one dot, alphanumeric/hyphen labels.
const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export function registerSourceDomainRoutes(app: Express): void {
  app.get(
    "/api/source-domains",
    requireRole(...ADMIN_ROLES),
    async (req, res) => {
      const filter: { sourceClass?: RegistrySourceClass } = {};
      if (req.query.class !== undefined) {
        const cls = String(req.query.class);
        if (!(REGISTRY_SOURCE_CLASSES as readonly string[]).includes(cls)) {
          throw new AppError(400, "Invalid source class", "INVALID_SOURCE_CLASS");
        }
        filter.sourceClass = cls as RegistrySourceClass;
      }
      const domains = await sourceDomainStore.list(filter);
      ok(res, domains);
    }
  );

  // Registered before any parameterized sibling would matter; kept above
  // the PUT for readability.
  app.get(
    "/api/source-domains/unreviewed",
    requireRole(...ADMIN_ROLES),
    async (_req, res) => {
      const domains = await sourceDomainStore.listUnreviewed();
      ok(res, domains);
    }
  );

  app.put(
    "/api/source-domains/:domain",
    requireRole(...ADMIN_ROLES),
    async (req, res) => {
      const rootDomain = String(req.params.domain).toLowerCase();
      if (!DOMAIN_PATTERN.test(rootDomain)) {
        throw new AppError(400, "Invalid domain", "INVALID_DOMAIN");
      }
      const parsed = upsertSourceDomainSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "Invalid input", "INVALID_INPUT");
      }
      const user = req.session.user!;
      const row = await sourceDomainStore.upsert(rootDomain, {
        sourceClass: parsed.data.sourceClass,
        rationale: parsed.data.rationale,
        classifiedBy: `user:${user.id}`,
      });
      ok(res, row);
    }
  );
}
