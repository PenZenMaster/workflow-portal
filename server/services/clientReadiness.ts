/*
 * Module/Script Name: clientReadiness.ts
 * Path: server/services/clientReadiness.ts
 *
 * Description:
 * Computes whether a client is fully configured to produce meaningful AI
 * Visibility data (B-15). Checks for a client brand, at least one competitor
 * brand with aliases, and an active prompt collection with prompts. Used by
 * the readiness badge on the Clients list.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-06-14
 * Last Modified Date: 2026-08-17
 * Comments:
 * - v1.00 Initial implementation (B-15)
 * - v1.01 Add actionableIssues with page-level links for guided fix flow (B-15 v2)
 */

import {
  brandStore,
  aliasStore,
  promptCollectionStore,
  promptStore,
  clientStore,
} from "../storage";
import type { ClientReadiness } from "@shared/schema";

export async function computeReadiness(clientId: number): Promise<ClientReadiness> {
  const brands = await brandStore.listByClient(clientId);
  const clientBrand = brands.find((b) => b.kind === "client");
  const competitorBrands = brands.filter((b) => b.kind === "competitor");

  let competitorBrandsWithAliasCount = 0;
  for (const brand of competitorBrands) {
    const aliases = await aliasStore.listByBrand(brand.id);
    if (aliases.length > 0) competitorBrandsWithAliasCount++;
  }

  const collections = await promptCollectionStore.listByClient(clientId);
  let hasActivePromptCollectionWithPrompts = false;
  for (const collection of collections.filter((c) => c.status === "active")) {
    const prompts = await promptStore.listByCollection(collection.id);
    if (prompts.length > 0) {
      hasActivePromptCollectionWithPrompts = true;
      break;
    }
  }

  const issues: string[] = [];
  const actionableIssues: { message: string; href: string }[] = [];
  const clientHref = `/ai/clients/${clientId}`;
  const promptsHref = `/ai/clients/${clientId}/prompts`;

  if (!clientBrand) {
    const message = "No client brand defined";
    issues.push(message);
    actionableIssues.push({ message, href: clientHref });
  }
  if (competitorBrands.length === 0) {
    const message = "No competitor brands defined - AI Share of Voice will be meaningless";
    issues.push(message);
    actionableIssues.push({ message, href: clientHref });
  } else if (competitorBrandsWithAliasCount === 0) {
    const message =
      "Competitor brands have no aliases configured - canonical names still match, but short-form name variants will be missed";
    issues.push(message);
    actionableIssues.push({ message, href: clientHref });
  }
  if (!hasActivePromptCollectionWithPrompts) {
    const message = "No active prompt collection with prompts";
    issues.push(message);
    actionableIssues.push({ message, href: promptsHref });
  }

  return {
    clientId,
    hasClientBrand: !!clientBrand,
    competitorBrandCount: competitorBrands.length,
    competitorBrandsWithAliasCount,
    hasActivePromptCollectionWithPrompts,
    ready: issues.length === 0,
    issues,
    actionableIssues,
  };
}

export async function computeReadinessForAllClients(): Promise<ClientReadiness[]> {
  const clients = await clientStore.list();
  return Promise.all(clients.map((c) => computeReadiness(c.id)));
}
