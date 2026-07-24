/*
 * Module/Script Name: budgetGuard.ts
 * Path: server/services/budgetGuard.ts
 *
 * Description:
 * Issue #2 F6 - per-client monthly token spend guard. Nothing previously
 * stopped a misconfigured schedule (e.g. accidentally hourly), a runaway
 * {{competitor}} fan-out, or repeated Retry-failed clicks from spending
 * without limit. checkClientBudget compares a client's month-to-date
 * token usage (reusing responseStore.aggregateTokensByClient from F1)
 * against configurable warn/block thresholds; run-creation call sites
 * consult it before enqueueing jobs.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-07-24
 * Last Modified Date: 2026-07-24
 * Comments:
 * - v1.00 issue #2 F6 initial implementation
 */

export type BudgetStatus = "ok" | "warn" | "block";

export interface BudgetThresholds {
  warn: number | null;
  block: number | null;
}

export interface BudgetCheckResult {
  status: BudgetStatus;
  monthToDateTokens: number | null;
  thresholds: BudgetThresholds;
}

export interface TokenAggregator {
  aggregateTokensByClient(
    clientId: number,
    fromDate: string,
    toDate: string
  ): Promise<{ totalInputTokens: number; totalOutputTokens: number }>;
}

function resolveOne(raw: string | undefined): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Opt-in: an unset or invalid env var disables that threshold entirely,
// preserving today's unlimited behavior until an operator deliberately
// configures a limit.
export function resolveBudgetThresholds(): BudgetThresholds {
  return {
    warn: resolveOne(process.env.BUDGET_MONTHLY_TOKEN_WARN),
    block: resolveOne(process.env.BUDGET_MONTHLY_TOKEN_BLOCK),
  };
}

export function evaluateBudgetStatus(
  monthToDateTokens: number,
  thresholds: BudgetThresholds
): BudgetStatus {
  if (thresholds.block !== null && monthToDateTokens >= thresholds.block) return "block";
  if (thresholds.warn !== null && monthToDateTokens >= thresholds.warn) return "warn";
  return "ok";
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function firstOfMonthIso(date: Date): string {
  return toIsoDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)));
}

export async function checkClientBudget(
  aggregator: TokenAggregator,
  clientId: number,
  now: Date = new Date()
): Promise<BudgetCheckResult> {
  const thresholds = resolveBudgetThresholds();
  if (thresholds.warn === null && thresholds.block === null) {
    return { status: "ok", monthToDateTokens: null, thresholds };
  }

  const usage = await aggregator.aggregateTokensByClient(
    clientId,
    firstOfMonthIso(now),
    toIsoDate(now)
  );
  const monthToDateTokens = usage.totalInputTokens + usage.totalOutputTokens;

  return {
    status: evaluateBudgetStatus(monthToDateTokens, thresholds),
    monthToDateTokens,
    thresholds,
  };
}
