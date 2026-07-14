/*
 * Module/Script Name: sourceClassifier.test.ts
 * Path: tests/server/services/sourceClassifier.test.ts
 *
 * Description:
 * Source classifier tests (YLG visibility spec section 6.3): ownership
 * precedence over registry entries, registry lookup, unknown default,
 * and the trusted-class mapping that drives isTrustedThirdParty.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-14
 * Last Modified Date: 2026-07-14
 * Comments:
 * - v1.00 YLG defensibility sprint - source registry slice
 */

import { describe, it, expect } from "vitest";
import {
  classifyCitationSource,
  isTrustedSourceClass,
} from "../../../server/services/sourceClassifier";
import type { RegistrySourceClass, SourceClass } from "@shared/schema";

const REGISTRY: ReadonlyMap<string, RegistrySourceClass> = new Map([
  ["yelp.com", "review_platform"],
  ["yellowpages.com", "general_directory"],
  ["chicagotribune.com", "publisher_editorial"],
]);

describe("classifyCitationSource", () => {
  it("classifies a client-brand-owned domain as client_owned, beating a registry entry", () => {
    // Even if the client's own domain somehow lands in the registry,
    // ownership wins.
    const registry = new Map<string, RegistrySourceClass>([
      ["acme.com", "general_directory"],
    ]);
    expect(classifyCitationSource("client", "acme.com", registry)).toBe("client_owned");
  });

  it("classifies a competitor-brand-owned domain as competitor_owned, beating a registry entry", () => {
    const registry = new Map<string, RegistrySourceClass>([
      ["rival.com", "review_platform"],
    ]);
    expect(classifyCitationSource("competitor", "rival.com", registry)).toBe("competitor_owned");
  });

  it("classifies a registry-matched domain with its registry class", () => {
    expect(classifyCitationSource(null, "yelp.com", REGISTRY)).toBe("review_platform");
    expect(classifyCitationSource(null, "yellowpages.com", REGISTRY)).toBe("general_directory");
    expect(classifyCitationSource(null, "chicagotribune.com", REGISTRY)).toBe("publisher_editorial");
  });

  it("classifies an unowned, unregistered domain as unknown_or_low_trust", () => {
    expect(classifyCitationSource(null, "randomblog.net", REGISTRY)).toBe("unknown_or_low_trust");
  });
});

describe("isTrustedSourceClass", () => {
  it("returns true only for industry_authority, local_authority, and publisher_editorial", () => {
    const expected: Record<SourceClass, boolean> = {
      client_owned: false,
      competitor_owned: false,
      industry_authority: true,
      local_authority: true,
      review_platform: false,
      publisher_editorial: true,
      general_directory: false,
      unknown_or_low_trust: false,
    };
    for (const [sourceClass, trusted] of Object.entries(expected)) {
      expect(isTrustedSourceClass(sourceClass as SourceClass), sourceClass).toBe(trusted);
    }
  });
});
