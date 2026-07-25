/*
 * Module/Script Name: measurementCell.test.ts
 * Path: tests/server/services/measurementCell.test.ts
 *
 * Description:
 * Tests for issue #4 Phase 2 item 7 (second half) - duplicate
 * measurement-cell detection (intentType + service + geography +
 * brandContext).
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-24
 * Last Modified Date: 2026-07-24
 * Comments:
 * - v1.00 issue #4 Phase 2 item 7 (measurement cell half) initial
 *   implementation
 */

import { describe, it, expect } from "vitest";
import { measurementCellKey } from "../../../server/services/measurementCell";

describe("measurementCellKey", () => {
  it("produces the same key for identical cells", () => {
    const cell = {
      intentType: "provider_recommendation" as const,
      service: "drain cleaning",
      geo: "Seattle, WA",
      brandContext: "unbranded" as const,
    };
    expect(measurementCellKey(cell)).toBe(measurementCellKey({ ...cell }));
  });

  it("is case-insensitive and whitespace-trimmed on service/geo", () => {
    const a = { intentType: "provider_recommendation" as const, service: "Drain Cleaning", geo: " Seattle, WA ", brandContext: "unbranded" as const };
    const b = { intentType: "provider_recommendation" as const, service: "drain cleaning", geo: "Seattle, WA", brandContext: "unbranded" as const };
    expect(measurementCellKey(a)).toBe(measurementCellKey(b));
  });

  it("differs when intentType differs", () => {
    const base = { service: "drain cleaning", geo: "Seattle, WA", brandContext: "unbranded" as const };
    expect(measurementCellKey({ ...base, intentType: "provider_recommendation" })).not.toBe(
      measurementCellKey({ ...base, intentType: "service_specific" })
    );
  });

  it("differs when service differs", () => {
    const base = { intentType: "provider_recommendation" as const, geo: "Seattle, WA", brandContext: "unbranded" as const };
    expect(measurementCellKey({ ...base, service: "drain cleaning" })).not.toBe(
      measurementCellKey({ ...base, service: "water heater installation" })
    );
  });

  it("differs when geo differs", () => {
    const base = { intentType: "provider_recommendation" as const, service: "drain cleaning", brandContext: "unbranded" as const };
    expect(measurementCellKey({ ...base, geo: "Seattle, WA" })).not.toBe(
      measurementCellKey({ ...base, geo: "Chicago, IL" })
    );
  });

  it("differs when brandContext differs", () => {
    const base = { intentType: "provider_recommendation" as const, service: "drain cleaning", geo: "Seattle, WA" };
    expect(measurementCellKey({ ...base, brandContext: "unbranded" })).not.toBe(
      measurementCellKey({ ...base, brandContext: "client_branded" })
    );
  });

  it("treats null service/geo consistently, distinct from a set value", () => {
    const base = { intentType: "provider_recommendation" as const, brandContext: "unbranded" as const };
    expect(measurementCellKey({ ...base, service: null, geo: null })).toBe(
      measurementCellKey({ ...base, service: null, geo: null })
    );
    expect(measurementCellKey({ ...base, service: null, geo: null })).not.toBe(
      measurementCellKey({ ...base, service: "drain cleaning", geo: null })
    );
  });
});
