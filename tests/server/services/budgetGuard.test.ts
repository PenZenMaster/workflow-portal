/*
 * Module/Script Name: budgetGuard.test.ts
 * Path: tests/server/services/budgetGuard.test.ts
 *
 * Description:
 * Tests for issue #2 F6 - per-client monthly token spend guard.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-24
 * Last Modified Date: 2026-07-24
 * Comments:
 * - v1.00 issue #2 F6 initial implementation
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  resolveBudgetThresholds,
  evaluateBudgetStatus,
  firstOfMonthIso,
  checkClientBudget,
} from "../../../server/services/budgetGuard";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveBudgetThresholds", () => {
  it("defaults to disabled (both null) when no env vars are set", () => {
    expect(resolveBudgetThresholds()).toEqual({ warn: null, block: null });
  });

  it("honors BUDGET_MONTHLY_TOKEN_WARN", () => {
    vi.stubEnv("BUDGET_MONTHLY_TOKEN_WARN", "100000");
    expect(resolveBudgetThresholds().warn).toBe(100_000);
  });

  it("honors BUDGET_MONTHLY_TOKEN_BLOCK", () => {
    vi.stubEnv("BUDGET_MONTHLY_TOKEN_BLOCK", "200000");
    expect(resolveBudgetThresholds().block).toBe(200_000);
  });

  it("treats a non-numeric or non-positive value as disabled", () => {
    vi.stubEnv("BUDGET_MONTHLY_TOKEN_WARN", "not-a-number");
    vi.stubEnv("BUDGET_MONTHLY_TOKEN_BLOCK", "-5");
    expect(resolveBudgetThresholds()).toEqual({ warn: null, block: null });
  });
});

describe("evaluateBudgetStatus", () => {
  const thresholds = { warn: 100, block: 200 };

  it("returns ok below both thresholds", () => {
    expect(evaluateBudgetStatus(50, thresholds)).toBe("ok");
  });

  it("returns warn at or above the warn threshold but below block", () => {
    expect(evaluateBudgetStatus(100, thresholds)).toBe("warn");
    expect(evaluateBudgetStatus(150, thresholds)).toBe("warn");
  });

  it("returns block at or above the block threshold, even though warn is also crossed", () => {
    expect(evaluateBudgetStatus(200, thresholds)).toBe("block");
    expect(evaluateBudgetStatus(500, thresholds)).toBe("block");
  });

  it("returns ok when thresholds are disabled regardless of usage", () => {
    expect(evaluateBudgetStatus(999_999, { warn: null, block: null })).toBe("ok");
  });
});

describe("firstOfMonthIso", () => {
  it("returns the first day of the given date's UTC month", () => {
    expect(firstOfMonthIso(new Date("2026-07-24T16:09:00.000Z"))).toBe("2026-07-01");
  });
});

describe("checkClientBudget", () => {
  function makeAggregator(totalInputTokens: number, totalOutputTokens: number) {
    return { aggregateTokensByClient: vi.fn().mockResolvedValue({ totalInputTokens, totalOutputTokens }) };
  }

  it("returns ok and skips the aggregation query entirely when no thresholds are configured", async () => {
    const aggregator = makeAggregator(999_999, 999_999);
    const result = await checkClientBudget(aggregator, 10);
    expect(result).toEqual({
      status: "ok",
      monthToDateTokens: null,
      thresholds: { warn: null, block: null },
    });
    expect(aggregator.aggregateTokensByClient).not.toHaveBeenCalled();
  });

  it("queries month-to-date usage from the first of the current month through today", async () => {
    vi.stubEnv("BUDGET_MONTHLY_TOKEN_BLOCK", "1000");
    const aggregator = makeAggregator(10, 20);
    await checkClientBudget(aggregator, 10, new Date("2026-07-24T16:09:00.000Z"));
    expect(aggregator.aggregateTokensByClient).toHaveBeenCalledWith(10, "2026-07-01", "2026-07-24");
  });

  it("sums input and output tokens and returns block status once at/over the block threshold", async () => {
    vi.stubEnv("BUDGET_MONTHLY_TOKEN_BLOCK", "1000");
    const aggregator = makeAggregator(600, 400);
    const result = await checkClientBudget(aggregator, 10, new Date("2026-07-24T16:09:00.000Z"));
    expect(result.monthToDateTokens).toBe(1000);
    expect(result.status).toBe("block");
  });

  it("returns warn status when usage is under the block threshold but at/over warn", async () => {
    vi.stubEnv("BUDGET_MONTHLY_TOKEN_WARN", "500");
    vi.stubEnv("BUDGET_MONTHLY_TOKEN_BLOCK", "1000");
    const aggregator = makeAggregator(300, 300);
    const result = await checkClientBudget(aggregator, 10, new Date("2026-07-24T16:09:00.000Z"));
    expect(result.monthToDateTokens).toBe(600);
    expect(result.status).toBe("warn");
  });
});
