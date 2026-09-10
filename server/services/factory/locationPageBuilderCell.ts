/*
 * Module/Script Name: locationPageBuilderCell.ts
 * Path: server/services/factory/locationPageBuilderCell.ts
 *
 * Description:
 * In-app conversion of the "Location Page Builder (Rank Rocket + WordPress)"
 * workflow card away from its raw Perplexity-launch prompt, following the
 * same client-scoped pattern as rankingGrowthPlanCell.ts: resolves the
 * client's registered RankRocket-MCP site key (no pasted WP credentials)
 * and drives a Claude + RankRocket-MCP tool loop.
 *
 * Unlike every other in-app run in this app (including the growth-plan
 * card, which is strictly read-only), this is the one workflow where
 * Claude's own tool loop is allowed to write to the live site directly -
 * it calls rankrocket_pages (preview) then rankrocket_pages_write
 * (confirm: true) to create draft WordPress pages, via
 * runRankRocketPageBuilderPrompt's expanded allowlist
 * (RANKROCKET_PAGE_BUILDER_TOOLS, server/mcp/toolBridge.ts). This is safe
 * because the pages it creates are always drafts - never published - and
 * reversible via the plugin's own rollback (trashes the page, not a hard
 * delete).
 *
 * As of rank_rocket_seo_plugin v3.16.0 / rankrocket-mcp v0.13.0, the prompt
 * also has rankrocket_elementor_read available (read-only, in the general
 * RANKROCKET_READONLY_TOOLS set) and instructs the model to read a sibling
 * location page's stored Elementor layout and reapply it (via
 * rankrocket_elementor_write) on the newly created page, so it visually
 * matches the rest of the site instead of rendering as a plain,
 * hero-image-less page. Fixes a gap found live on trevoraspiranti.com:
 * rankrocket_pages_write has no Elementor concept, and there was previously
 * no way to read an existing page's layout to clone even if it did.
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-09-09
 * Last Modified Date: 2026-09-10
 * Comments:
 * - v1.00 Initial implementation
 * - v1.01 Prompt now reads and reapplies a sibling page's Elementor layout
 */

import { z } from "zod";
import { runRankRocketPageBuilderPrompt } from "../../mcp/rankrocketToolRun";

export const locationPageBuilderInputSchema = z.object({
  targetCitiesOrServiceAreas: z.string().min(1, "targetCitiesOrServiceAreas is required"),
  businessName: z.string().optional(),
  primaryServiceUrl: z.string().optional(),
  templatePreferences: z.string().optional(),
});

export type LocationPageBuilderInput = z.infer<typeof locationPageBuilderInputSchema>;

export interface LocationPageBuilderClient {
  id: number;
  rankrocketSiteKey: string | null;
}

export interface RunLocationPageBuilderDeps {
  clientStore: {
    get(id: number): Promise<LocationPageBuilderClient | undefined>;
  };
}

export interface RunLocationPageBuilderResult {
  markdown: string;
}

// Maps a workflow's positional input labels/values (the generic <PASTE>-token
// pattern every Workflow Catalog card uses, required inputs then optional
// ones) back to LocationPageBuilderInput's named fields, by label text. Used
// by the in-app "Run" route (server/routes/workflows.ts) so the workflow
// row's inputs/optionalInputs lists stay the single source of truth for
// which fields it collects - same precedent as rankingGrowthPlanCell.ts's
// mapOptionalInputsFromLabels, extended to cover the one required label too.
const INPUT_LABELS: Record<keyof LocationPageBuilderInput, string> = {
  targetCitiesOrServiceAreas: "Target city or service area(s)",
  businessName: "Business name",
  primaryServiceUrl: "Primary service / money page URL",
  templatePreferences: "Page template / content style preferences",
};

export function mapLocationPageBuilderInputsFromLabels(
  labels: string[],
  values: string[]
): Partial<LocationPageBuilderInput> {
  const labelToKey = new Map(
    (Object.entries(INPUT_LABELS) as Array<[keyof LocationPageBuilderInput, string]>).map(
      ([key, label]) => [label, key]
    )
  );
  const result: Partial<LocationPageBuilderInput> = {};
  labels.forEach((label, i) => {
    const key = labelToKey.get(label);
    const value = values[i];
    if (key && value && value.trim().length > 0) {
      result[key] = value;
    }
  });
  return result;
}

export function buildLocationPageBuilderPrompt(
  siteKey: string,
  input: LocationPageBuilderInput
): string {
  return `Create one new WordPress page per target city/service area for the RankRocket-managed site "${siteKey}".

Business name: ${input.businessName || "(not provided - infer from the site's existing content if needed)"}
Target cities/service areas: ${input.targetCitiesOrServiceAreas}
Primary service / money page URL: ${input.primaryServiceUrl || "(not provided)"}
Page template / content style preferences: ${input.templatePreferences || "(none specified - match the site's existing tone)"}

For each target city/service area:
1. Find an existing sibling location page for this site (e.g. via rankrocket_content_audit's broken_links listing or the site's own sitemap) and call rankrocket_elementor_read on it to see its current Elementor layout - hero section, image reference, structure. If no sibling page exists yet, skip this step and fall back to plain content only.
2. Call rankrocket_pages first to preview the page and review any validation errors/warnings.
3. Once the preview looks correct, call rankrocket_pages_write with confirm: true to actually create it.
4. Generate on-brand, locally-relevant content for that city - do not just template-swap the city name into identical copy.
5. If step 1 found a sibling layout, adapt it for the new page (reuse its hero image and section structure, swap in the new city's content) and call rankrocket_elementor_write with confirm: true and operation: set_data on the page created in step 3, so the new page visually matches the rest of the site instead of rendering as a plain, unstyled page.

Requirements:
- Every page is created as a draft - never request or suggest status: publish, and never publish live without the operator's own explicit review.
- Match the existing site's tone and template where discoverable from other RankRocket tools.
- Return the list of created pages with their id, title, and edit_url for review, and note whether their Elementor layout was matched to a sibling page or left as plain content (no sibling found).`;
}

export async function runLocationPageBuilder(
  clientId: number,
  input: LocationPageBuilderInput,
  deps: RunLocationPageBuilderDeps
): Promise<RunLocationPageBuilderResult> {
  const client = await deps.clientStore.get(clientId);
  if (!client?.rankrocketSiteKey) {
    throw new Error(`No RankRocket site key configured for client ${clientId}`);
  }

  const prompt = buildLocationPageBuilderPrompt(client.rankrocketSiteKey, input);

  // Overrides mirror the growth-plan card's own live-verified headroom
  // (rankingGrowthPlanCell.ts) as a starting point, since this prompt has a
  // similar shape (several tool calls per city plus a final summary) - not
  // yet independently live-verified for this specific prompt; revisit if a
  // real run hits these caps.
  const response = await runRankRocketPageBuilderPrompt(prompt, {
    maxIterations: 20,
    maxTokens: 16000,
    timeoutMs: 120000,
  });

  return { markdown: response.text };
}
