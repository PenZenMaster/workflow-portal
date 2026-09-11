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
 * Phase 1 of the location-page-builder-v2.0 skill integration (2026-09-10):
 * the prompt now ports the skill's page-authoring methodology - geographic
 * knowledge node framing (vs. doorway/city-name-swap pages), a direct-answer
 * block, honest business_model/service_delivery_model framing (no fake
 * office/hidden SAB address), a query-fan-out FAQ (6-10 questions from
 * distinct sub-intents), and hub-page awareness (the model checks for and
 * reports an existing locations hub, but does not edit it) - using only
 * tools already on RANKROCKET_PAGE_BUILDER_TOOLS. Deliberately out of scope
 * for this phase: no new MCP tools, no schema/meta writes, no Wikipedia hero
 * sourcing (placeholder-image behavior is unchanged).
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-09-09
 * Last Modified Date: 2026-09-10
 * Comments:
 * - v1.00 Initial implementation
 * - v1.01 Prompt now reads and reapplies a sibling page's Elementor layout
 * - v1.02 Prompt methodology rewrite (geographic-knowledge-node framing,
 *         direct-answer block, business/delivery-model honesty, query-fan-out
 *         FAQ, hub-page awareness) - Phase 1 of the location-page-builder-v2.0
 *         skill integration
 */

import { z } from "zod";
import { runRankRocketPageBuilderPrompt } from "../../mcp/rankrocketToolRun";
import type { FactoryCell } from "../../jobs/factory";

export const locationPageBuilderInputSchema = z.object({
  targetCitiesOrServiceAreas: z.string().min(1, "targetCitiesOrServiceAreas is required"),
  businessName: z.string().optional(),
  primaryServiceUrl: z.string().optional(),
  businessModel: z.string().optional(),
  serviceDeliveryModel: z.string().optional(),
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
  businessModel: "Business model (storefront / SAB / hybrid)",
  serviceDeliveryModel: "Service delivery model (office / mobile / remote / hybrid)",
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
  const businessModel =
    input.businessModel ||
    "(not provided - infer from the site's existing content; never assume a public office exists)";
  const serviceDeliveryModel =
    input.serviceDeliveryModel ||
    "(not provided - infer from the site's existing content; describe access honestly rather than guessing an office)";

  return `Create one new WordPress page per target city/service area for the RankRocket-managed site "${siteKey}".

Business name: ${input.businessName || "(not provided - infer from the site's existing content if needed)"}
Target cities/service areas: ${input.targetCitiesOrServiceAreas}
Primary service / money page URL: ${input.primaryServiceUrl || "(not provided)"}
Business model (storefront / SAB / hybrid): ${businessModel}
Service delivery model (office / mobile / remote / hybrid): ${serviceDeliveryModel}
Page template / content style preferences: ${input.templatePreferences || "(none specified - match the site's existing tone)"}

Page philosophy: build a geographic knowledge node, not a doorway/city-name-swap page. Every page must connect provider -> service -> location -> a real user question -> a real answer -> a next action. Reject any draft where swapping only the city name would leave the meaning intact, where sections duplicate a sibling city page, or where local color is population/founding-date/tourist-attraction filler. Say less rather than manufacture local uniqueness that real research does not support.

For each target city/service area:
1. Find an existing sibling location page for this site (e.g. via rankrocket_content_audit's broken_links listing or the site's own sitemap) and call rankrocket_elementor_read on it to see its current Elementor layout - hero section, image reference, structure. Also check whether a locations/service-area hub or index page already exists for this site - if one does, plan to reference it in the new page's breadcrumb/nearby-communities content and note it in your final report so it can be linked to the new page, rather than leaving the new page orphaned. If no sibling page exists yet, skip the layout-read step and fall back to plain content only.
2. Call rankrocket_pages first to preview the page and review any validation errors/warnings.
3. Once the preview looks correct, call rankrocket_pages_write with confirm: true to actually create it.
4. Generate on-brand, locally-relevant content for that city, in this order - do not just template-swap the city name into identical copy:
   a. Hero: exactly one H1 as "{Primary Service} in {City}, {State}" (a natural "Serving {City}" variant is fine), plus a 1-2 sentence positioning statement about the user's local service decision - never generic city-trivia copy.
   b. Direct-answer block: one H2 phrased as a likely question (e.g. "Does {Business} provide {Service} in {City}?"), answered in 45-90 words that name the provider, the service, the location, and the access model, and that can stand alone if quoted by a search or AI answer engine.
   c. Service-access block matching the service delivery model above: office (public address plus visit rules), mobile (customer-location service, no fake office), remote (phone/online/video, no dispatch/crew language), or hybrid (accurately describe the real mix). Never invent a public office or address that is not genuinely public for this business, and never use a hidden service-area-business address.
   d. 2-4 local decision-guidance sections built from real, verifiable local factors (eligibility, permits, climate, housing stock, municipal process, financing, common local scenarios) - omit this content rather than pad it with population or founding-date filler.
   e. 4-8 service/product cards, each linking to a real page on the site and explaining local relevance in one sentence.
   f. Local proof only if genuinely available (a client project, testimonial, or case study naming the city); omit or soften this section rather than fabricate proof. A location photo is never proof of local business activity.
   g. A short provider/entity trust block: who provides the service, role, and credentials/licenses where applicable.
   h. Up to 12 verified nearby communities, linking to 2-4 existing nearby location pages if any exist.
   i. A 3-5 step process section that honestly reflects the service delivery model.
   j. A query-fan-out FAQ of 6-10 questions drawn from distinct sub-intents (eligibility, cost factors, timing, local rules, comparisons, access model, neighboring-area applicability, required documents) - not six rewordings of the same keyword. Each answer: 40-120 words, answer-first.
   k. A final CTA matching the real next step for this service delivery model.
5. If step 1 found a sibling layout, adapt it for the new page (reuse its hero image and section structure, swap in the new city's content built in step 4) and call rankrocket_elementor_write with confirm: true and operation: set_data on the page created in step 3, so the new page visually matches the rest of the site instead of rendering as a plain, unstyled page.

Requirements:
- Every page is created as a draft - never request or suggest status: publish, and never publish live without the operator's own explicit review.
- Match the existing site's tone and template where discoverable from other RankRocket tools.
- Never fabricate local proof, a public office/address, or a professional credential.
- Return the list of created pages with their id, title, and edit_url for review, and note: whether their Elementor layout was matched to a sibling page or left as plain content (no sibling found), and whether an existing locations hub page was found that should link to the new page.`;
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

// Async wrapper for the interactive "Run" button's POST /api/workflows/:id/run
// handler (server/routes/workflows.ts). The two-step tool loop this prompt
// now drives (read a sibling page's Elementor layout, then write the new
// page's layout to match - added for the "pages come out unstyled" fix) can
// run past the reverse-proxy request timeout in front of this app when run
// synchronously in the HTTP request itself; routing it through the existing
// Factory Cell / job-runner infrastructure (server/jobs/factory.ts, already
// used by the Lights-Out SEO Factory's other cells) instead makes the run
// itself immune to any single request's timeout - the route only has to
// create the job row and return, and the client polls
// GET /api/factory/jobs/:id for the result.
export const LOCATION_PAGE_BUILDER_JOB_TYPE = "content.location-page-builder";

export function createLocationPageBuilderCell(
  deps: RunLocationPageBuilderDeps
): FactoryCell {
  return {
    jobType: LOCATION_PAGE_BUILDER_JOB_TYPE,
    async run(job) {
      const input = locationPageBuilderInputSchema.parse(job.input);
      const result = await runLocationPageBuilder(job.clientId, input, deps);
      return { markdown: result.markdown };
    },
  };
}
