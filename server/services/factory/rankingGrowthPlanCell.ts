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
 * by the site-key lookup) and the GBP/project-knowledge-store inputs
 * (dropped for this pilot - GBP integration is blocked on B-20, and no
 * persistent knowledge store exists anywhere in this codebase yet). The
 * original Workflow Catalog card is left untouched; this is an additive,
 * parallel capability, not a replacement.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-18
 * Last Modified Date: 2026-08-18
 * Comments:
 * - v1.00 Pilot Factory Cell (read-only, no write tools involved)
 */

import { z } from "zod";
import type { FactoryCell } from "../../jobs/factory";
import {
  runRankRocketReadOnlyPrompt,
  isRankRocketMcpConfigured,
} from "../../mcp/rankrocketToolRun";

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

type RankingGrowthPlanInput = z.infer<typeof rankingGrowthPlanInputSchema>;

export interface RankingGrowthPlanCellDeps {
  clientStore: {
    get(
      id: number
    ): Promise<{ id: number; rankrocketSiteKey: string | null } | undefined>;
  };
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

function buildRankingGrowthPlanPrompt(
  siteKey: string,
  input: RankingGrowthPlanInput
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
Requirements:
- Output markdown only, and keep it concise - the top 3-5 highest-impact findings and actions, not an exhaustive report.
- Keyword filter is a UNION (OR), not an intersection: include every row where Tag exactly equals "Root Keyword" OR where # of Searches is a strict numeric value greater than 10000 after cleaning. A row qualifies if it satisfies EITHER condition; it does not need to satisfy both.
- In the "Filtered keyword set" section, report the counts separately: rows matched by Tag, rows matched by search volume, rows matched by both, and the total union.
- No Google Business Profile data or prior-run project memory is available for this run - label any GBP-dependent or history-dependent item as verification-needed rather than guessing or treating it as missing.

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

      const prompt = buildRankingGrowthPlanPrompt(client.rankrocketSiteKey, input);
      // All three overrides are grounded in live verification (2026-08-18),
      // not guesses: the default iteration cap (8, anthropicToolLoop.ts) was
      // exhausted mid tool-use (this prompt legitimately needs several
      // read-only tool calls plus a final synthesis turn); the configured
      // default token budget (4096) was entirely consumed by the model's own
      // "thinking" tokens on this heavier prompt, leaving zero tokens for
      // the actual report; and the configured default per-call timeout
      // (60000ms) was hit generating the larger response that the raised
      // token budget now allows.
      const response = await runRankRocketReadOnlyPrompt(prompt, {
        maxIterations: 20,
        maxTokens: 16000,
        timeoutMs: 120000,
      });

      return {
        markdown: response.text,
        sources: { rankrocketMcp: "ok" },
      };
    },
  };
}
