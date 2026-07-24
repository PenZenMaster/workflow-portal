/*
 * Module/Script Name: promptMetadataValidation.test.ts
 * Path: tests/server/services/promptMetadataValidation.test.ts
 *
 * Description:
 * Tests for issue #4 Phase 2 item 6 - deterministic service/geography
 * checks on generated prompt candidates.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-24
 * Last Modified Date: 2026-07-24
 * Comments:
 * - v1.00 issue #4 Phase 2 item 6 initial implementation
 */

import { describe, it, expect } from "vitest";
import {
  checkApprovedGeo,
  checkCoreService,
  validatePromptMetadata,
} from "../../../server/services/promptMetadataValidation";

describe("checkApprovedGeo", () => {
  it("returns null when the geo matches an approved geography exactly", () => {
    expect(checkApprovedGeo("Seattle, WA", ["Seattle, WA"])).toBeNull();
  });

  it("matches case-insensitively and ignores surrounding whitespace", () => {
    expect(checkApprovedGeo(" seattle, wa ", ["Seattle, WA"])).toBeNull();
  });

  it("returns a warning when the geo is not in the approved list", () => {
    expect(checkApprovedGeo("Chicago, IL", ["Seattle, WA"])).toMatch(/Chicago, IL/);
  });

  it("warns when the approved list is empty and a geo is specified", () => {
    expect(checkApprovedGeo("Seattle, WA", [])).not.toBeNull();
  });

  it("returns null for a null geo (not every prompt is geo-scoped)", () => {
    expect(checkApprovedGeo(null, ["Seattle, WA"])).toBeNull();
  });

  it("returns null for an empty/whitespace-only geo", () => {
    expect(checkApprovedGeo("   ", ["Seattle, WA"])).toBeNull();
  });
});

describe("checkCoreService", () => {
  it("returns null when the service matches a configured core service exactly", () => {
    expect(checkCoreService("drain cleaning", ["drain cleaning"])).toBeNull();
  });

  it("matches case-insensitively and ignores surrounding whitespace", () => {
    expect(checkCoreService(" Drain Cleaning ", ["drain cleaning"])).toBeNull();
  });

  it("returns a warning when the service is not in the configured list", () => {
    expect(checkCoreService("commercial plumbing", ["drain cleaning"])).toMatch(/commercial plumbing/);
  });

  it("warns when the configured list is empty and a service is specified", () => {
    expect(checkCoreService("drain cleaning", [])).not.toBeNull();
  });

  it("returns null for a null service", () => {
    expect(checkCoreService(null, ["drain cleaning"])).toBeNull();
  });
});

describe("validatePromptMetadata", () => {
  it("returns no warnings when geo and service both match", () => {
    const warnings = validatePromptMetadata(
      { geo: "Seattle, WA", service: "drain cleaning" },
      { geographies: ["Seattle, WA"], coreServices: ["drain cleaning"] }
    );
    expect(warnings).toEqual([]);
  });

  it("returns no warnings when geo and service are both null", () => {
    const warnings = validatePromptMetadata(
      { geo: null, service: null },
      { geographies: ["Seattle, WA"], coreServices: ["drain cleaning"] }
    );
    expect(warnings).toEqual([]);
  });

  it("returns one warning when only geo mismatches", () => {
    const warnings = validatePromptMetadata(
      { geo: "Chicago, IL", service: "drain cleaning" },
      { geographies: ["Seattle, WA"], coreServices: ["drain cleaning"] }
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/Chicago, IL/);
  });

  it("returns two warnings when both geo and service mismatch", () => {
    const warnings = validatePromptMetadata(
      { geo: "Chicago, IL", service: "commercial plumbing" },
      { geographies: ["Seattle, WA"], coreServices: ["drain cleaning"] }
    );
    expect(warnings).toHaveLength(2);
  });
});
