/*
 * Module/Script Name: sourceClassifier.ts
 * Path: server/services/sourceClassifier.ts
 *
 * Description:
 * Pure citation source classifier (YLG visibility spec section 6.3).
 * Precedence: brand ownership (client, then competitor) beats the
 * source-domain registry, which beats the unknown_or_low_trust default.
 * Also maps source classes to the trusted-third-party flag that feeds
 * the visibility score's T component.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-14
 * Last Modified Date: 2026-07-14
 * Comments:
 * - v1.00 YLG defensibility sprint - source registry slice
 */

import { TRUSTED_SOURCE_CLASSES } from "@shared/schema";
import type { RegistrySourceClass, SourceClass } from "@shared/schema";

export type CitationOwnerKind = "client" | "competitor" | null;

export function classifyCitationSource(
  ownerKind: CitationOwnerKind,
  rootDomain: string,
  registry: ReadonlyMap<string, RegistrySourceClass>
): SourceClass {
  if (ownerKind === "client") return "client_owned";
  if (ownerKind === "competitor") return "competitor_owned";
  return registry.get(rootDomain) ?? "unknown_or_low_trust";
}

export function isTrustedSourceClass(sourceClass: SourceClass): boolean {
  return (TRUSTED_SOURCE_CLASSES as readonly string[]).includes(sourceClass);
}
