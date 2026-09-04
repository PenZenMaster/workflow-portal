/*
 * Module/Script Name: rankingGrowthPlanCell.ts
 * Path: server/services/factory/rankingGrowthPlanCell.ts
 *
 * Description:
 * Lights-Out SEO Factory production cell for planning.ranking-growth-plan:
 * the pilot cell proving the Factory Cell pattern for the RankRocket SEO
 * Control Layer (docs/lights-out-seo-factory.md, Cell F). Takes a keyword
 * ranking CSV plus optional supporting context, resolves the client's
 * registered RankRocket-MCP site key (client contract as source of truth -
 * no per-run pasted WordPress credentials), and runs the same read-only
 * MCP tool loop the "RankRocket Site Insights" workflow card uses to
 * produce a markdown growth plan.
 *
 * Ported from the "Ranking Audit and Improvement Suite" Workflow Catalog
 * card's prompt (server/seed.ts), minus the WP-credential inputs (replaced
 * by the site-key lookup). v1.01 closes the two gaps the pilot deliberately
 * deferred: live GBP data (server/services/gbp.ts, when the client has a
 * mapped gbpLocationName) and cross-run memory (growthPlanRunStore) so
 * repeat runs skip re-analysis when nothing changed and carry forward
 * prior priority actions instead of re-recommending them.
 *
 * The reusable core (runRankingGrowthPlan) is extracted from the
 * FactoryCell wrapper so server/routes/workflows.ts's in-app "Run" button
 * can call the exact same sequence interactively - same precedent as
 * server/mcp/rankrocketToolRun.ts's extraction from workflowPromptRun.ts.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-18
 * Last Modified Date: 2026-09-03
 * Comments:
 * - v1.00 Pilot Factory Cell (read-only, no write tools involved)
 * - v1.01 Full parity: extracted runRankingGrowthPlan for the in-app "Run"
 *   button, folded in live GBP data, added cross-run memory via
 *   growthPlanRunStore (skip-if-unchanged + carry-forward priority actions)
 */

import { z } from "zod";
import { createHash } from "node:crypto";
import type { FactoryCell } from "../../jobs/factory";
import {
  runRankRocketReadOnlyPrompt,
  isRankRocketMcpConfigured,
} from "../../mcp/rankrocketToolRun";
import { getLocationSnapshot, type GbpLocationSnapshot } from "../gbp";
import type { GrowthPlanPriorityAction } from "@shared/schema";

export const rankingGrowthPlanInputSchema = z.object({
  rankingCsv: z.string().min(1, "rankingCsv is required"),
  targetServiceAreas: z.string().optional(),
  coreServices: z.string().optional(),
  targetCompetitors: z.string().optional(),
  existingLocationPages: z.string().optional(),
  preferredBrandTerminology: z.string().optional(),
  priorSeoChanges: z.string().optional(),
  schemaPolicies: z.string().optional(),
});

export type RankingGrowthPlanInput = z.infer<typeof rankingGrowthPlanInputSchema>;

export interface RankingGrowthPlanClient {
  id: number;
  rankrocketSiteKey: string | null;
  gbpLocationName: string | null;
}

export interface GrowthPlanRunRecord {
  id: number;
  clientId: number;
  inputHash: string;
  markdown: string;
  priorityActions: GrowthPlanPriorityAction[];
  createdAt: number;
}

export interface RunRankingGrowthPlanDeps {
  clientStore: {
    get(id: number): Promise<RankingGrowthPlanClient | undefined>;
  };
  growthPlanRunStore: {
    getPreviousRun(clientId: number): Promise<GrowthPlanRunRecord | undefined>;
    create(data: {
      clientId: number;
      inputHash: string;
      markdown: string;
      priorityActions: GrowthPlanPriorityAction[];
    }): Promise<GrowthPlanRunRecord>;
  };
  // Injected so tests never hit the live GBP API; production wiring passes
  // the real getLocationSnapshot (server/services/gbp.ts).
  fetchGbpSnapshot?: (locationName: string) => Promise<GbpLocationSnapshot>;
}

export interface RunRankingGrowthPlanResult {
  markdown: string;
  sources: Record<string, string>;
  skippedUnchanged: boolean;
}

const OPTIONAL_INPUT_LABELS: Record<
  Exclude<keyof RankingGrowthPlanInput, "rankingCsv">,
  string
> = {
  targetServiceAreas: "target_service_areas",
  coreServices: "core_services",
  targetCompetitors: "target_competitors",
  existingLocationPages: "existing_location_pages",
  preferredBrandTerminology: "preferred_brand_terminology",
  priorSeoChanges: "prior_seo_changes",
  schemaPolicies: "schema_policies",
};

// Maps a workflow's positional optional-input labels/values (the generic
// <PASTE>-token pattern every Workflow Catalog card uses) back to
// RankingGrowthPlanInput's named optional fields, by label text. Used by
// the in-app "Run" route (server/routes/workflows.ts) so the growthPlanEnabled
// workflow row's optionalInputs list stays the single source of truth for
// which optional fields it collects.
export function mapOptionalInputsFromLabels(
  optionalLabels: string[],
  values: string[]
): Partial<Omit<RankingGrowthPlanInput, "rankingCsv">> {
  const labelToKey = new Map(
    (
      Object.entries(OPTIONAL_INPUT_LABELS) as Array<
        [Exclude<keyof RankingGrowthPlanInput, "rankingCsv">, string]
      >
    ).map(([key, label]) => [label, key])
  );
  const result: Partial<Omit<RankingGrowthPlanInput, "rankingCsv">> = {};
  optionalLabels.forEach((label, i) => {
    const key = labelToKey.get(label);
    const value = values[i];
    if (key && value && value.trim().length > 0) {
      result[key] = value;
    }
  });
  return result;
}

function computeInputHash(
  input: RankingGrowthPlanInput,
  gbpSnapshot: GbpLocationSnapshot | null
): string {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(input));
  hash.update(JSON.stringify(gbpSnapshot));
  return hash.digest("hex");
}

function formatGbpSection(
  gbpSnapshot: GbpLocationSnapshot | null,
  hasGbpMapping: boolean
): string {
  if (!hasGbpMapping) {
    return "No Google Business Profile is mapped for this client - label any GBP-dependent item as verification-needed rather than guessing or treating it as missing.";
  }
  if (!gbpSnapshot) {
    return "This client has a mapped Google Business Profile, but the live snapshot could not be fetched this run - label GBP-dependent items as verification-needed.";
  }
  return `Live Google Business Profile snapshot for this client:\n${JSON.stringify(gbpSnapshot, null, 2)}`;
}

function formatPriorActionsSection(
  previousRun: GrowthPlanRunRecord | undefined
): string {
  if (!previousRun || previousRun.priorityActions.length === 0) return "";
  const lines = previousRun.priorityActions
    .map((a) => `- [${a.status}] ${a.text}`)
    .join("\n");
  return `\nPreviously recommended actions (from the last analysis on ${new Date(previousRun.createdAt).toISOString().slice(0, 10)}) - re-evaluate each against the current data and mark it "done" (clearly implemented now), "still open" (not yet addressed), or "superseded" (no longer relevant); add any newly-identified actions too:\n${lines}\n`;
}

export function buildRankingGrowthPlanPrompt(
  siteKey: string,
  input: RankingGrowthPlanInput,
  opts: {
    gbpSnapshot: GbpLocationSnapshot | null;
    hasGbpMapping: boolean;
    previousRun?: GrowthPlanRunRecord;
  }
): string {
  const optionalLines = (
    Object.entries(OPTIONAL_INPUT_LABELS) as Array<
      [Exclude<keyof RankingGrowthPlanInput, "rankingCsv">, string]
    >
  )
    .filter(([key]) => input[key])
    .map(([key, label]) => `- ${label}: ${input[key]}`)
    .join("\n");

  return `Produce a concise keyword ranking growth plan for the RankRocket-managed WordPress site "${siteKey}".

Call at most 2-3 of the most relevant RankRocket read-only tools (status/capabilities, content audit signals, SEO meta, redirects, snippets, perf/cache settings) against site "${siteKey}" - enough to ground findings in the site's actual current state, not an exhaustive audit. Cite specific data the tools return rather than guessing. These tools are strictly read-only; never attempt or suggest a write/mutating action.

Ranking CSV:
${input.rankingCsv}
${optionalLines ? `\nOptional supporting inputs:\n${optionalLines}\n` : ""}
Google Business Profile:
${formatGbpSection(opts.gbpSnapshot, opts.hasGbpMapping)}
${formatPriorActionsSection(opts.previousRun)}
Requirements:
- Output markdown only, and keep it concise - the top 3-5 highest-impact findings and actions, not an exhaustive report.
- Keyword filter is a UNION (OR), not an intersection: include every row where Tag exactly equals "Root Keyword" OR where # of Searches is a strict numeric value greater than 10000 after cleaning. A row qualifies if it satisfies EITHER condition; it does not need to satisfy both.
- In the "Filtered keyword set" section, report the counts separately: rows matched by Tag, rows matched by search volume, rows matched by both, and the total union.
- In the "Priority actions" section, write each action as a single markdown list item ("- ...") so it can be tracked run over run.

Analysis goals:
- Improve Google Rank and Google.com Mobile Rank.
- Prioritize actions by impact, effort, and cross-keyword reuse value.
- Map keyword clusters to the best existing page or new page.

Required output structure:
# Keyword Ranking Growth Plan
## Scope
## Filtered keyword set
## Findings
## Priority actions
## Verification needed or blockers`;
}

// Parses "## Priority actions" list items ("- text") out of the model's
// markdown response into trackable records for the next run's memory.
// Anything the model didn't explicitly mark done/superseded starts "open".
export function parsePriorityActions(markdown: string): GrowthPlanPriorityAction[] {
  const allLines = markdown.split("\n");
  const headingIndex = allLines.findIndex((line) =>
    /^##\s*Priority actions\s*$/.test(line.trim())
  );
  if (headingIndex === -1) return [];
  const sectionLines: string[] = [];
  for (let i = headingIndex + 1; i < allLines.length; i++) {
    if (/^##\s/.test(allLines[i])) break;
    sectionLines.push(allLines[i]);
  }

  const actions: GrowthPlanPriorityAction[] = [];
  for (const line of sectionLines) {
    const itemMatch = line.match(/^\s*[-*]\s+(.*\S)\s*$/);
    if (!itemMatch) continue;
    let text = itemMatch[1];
    let status: GrowthPlanPriorityAction["status"] = "open";
    const statusMatch = text.match(/^\[(done|superseded|still open|open)\]\s*/i);
    if (statusMatch) {
      const raw = statusMatch[1].toLowerCase();
      status = raw === "still open" || raw === "open" ? "open" : (raw as "done" | "superseded");
      text = text.slice(statusMatch[0].length);
    }
    actions.push({ text, status });
  }
  return actions;
}

export async function runRankingGrowthPlan(
  clientId: number,
  input: RankingGrowthPlanInput,
  deps: RunRankingGrowthPlanDeps
): Promise<RunRankingGrowthPlanResult> {
  const client = await deps.clientStore.get(clientId);
  if (!client?.rankrocketSiteKey) {
    throw new Error(`No RankRocket site key configured for client ${clientId}`);
  }

  const hasGbpMapping = Boolean(client.gbpLocationName);
  let gbpSnapshot: GbpLocationSnapshot | null = null;
  if (client.gbpLocationName) {
    const fetchSnapshot = deps.fetchGbpSnapshot ?? getLocationSnapshot;
    gbpSnapshot = await fetchSnapshot(client.gbpLocationName);
  }

  const inputHash = computeInputHash(input, gbpSnapshot);
  const previousRun = await deps.growthPlanRunStore.getPreviousRun(clientId);

  if (previousRun && previousRun.inputHash === inputHash) {
    return {
      markdown: `_No changes since ${new Date(previousRun.createdAt).toISOString().slice(0, 10)} - returning the prior analysis._\n\n${previousRun.markdown}`,
      sources: { rankrocketMcp: "ok", cache: "unchanged" },
      skippedUnchanged: true,
    };
  }

  const prompt = buildRankingGrowthPlanPrompt(client.rankrocketSiteKey, input, {
    gbpSnapshot,
    hasGbpMapping,
    previousRun,
  });

  // All three overrides are grounded in live verification (2026-08-18), not
  // guesses: the default iteration cap (8, anthropicToolLoop.ts) was
  // exhausted mid tool-use (this prompt legitimately needs several
  // read-only tool calls plus a final synthesis turn); the configured
  // default token budget (4096) was entirely consumed by the model's own
  // "thinking" tokens on this heavier prompt, leaving zero tokens for the
  // actual report; and the configured default per-call timeout (60000ms)
  // was hit generating the larger response that the raised token budget
  // now allows.
  const response = await runRankRocketReadOnlyPrompt(prompt, {
    maxIterations: 20,
    maxTokens: 16000,
    timeoutMs: 120000,
  });

  const priorityActions = parsePriorityActions(response.text);
  await deps.growthPlanRunStore.create({
    clientId,
    inputHash,
    markdown: response.text,
    priorityActions,
  });

  return {
    markdown: response.text,
    sources: { rankrocketMcp: "ok" },
    skippedUnchanged: false,
  };
}

export interface RankingGrowthPlanCellDeps {
  clientStore: RunRankingGrowthPlanDeps["clientStore"];
  growthPlanRunStore: RunRankingGrowthPlanDeps["growthPlanRunStore"];
  fetchGbpSnapshot?: RunRankingGrowthPlanDeps["fetchGbpSnapshot"];
}

export function createRankingGrowthPlanCell(
  deps: RankingGrowthPlanCellDeps
): FactoryCell {
  return {
    jobType: "planning.ranking-growth-plan",
    async run(job) {
      const parsed = rankingGrowthPlanInputSchema.safeParse(job.input);
      if (!parsed.success) {
        throw new Error(
          "Invalid ranking growth plan input: rankingCsv is required"
        );
      }
      const input = parsed.data;

      const client = await deps.clientStore.get(job.clientId);
      if (!client?.rankrocketSiteKey) {
        throw new Error(
          `No RankRocket site key configured for client ${job.clientId}`
        );
      }

      if (job.dryRun) {
        return {
          dryRun: true,
          checks: {
            rankrocketSiteKey: "ok",
            mcpConfig: isRankRocketMcpConfigured() ? "ok" : "missing",
          },
        };
      }

      const result = await runRankingGrowthPlan(job.clientId, input, deps);
      return { markdown: result.markdown, sources: result.sources };
    },
  };
}
