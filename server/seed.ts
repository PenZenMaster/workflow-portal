import { db } from "./storage";
import { workflows } from "@shared/schema";

type SeedRow = {
  name: string;
  category: string;
  description: string;
  inputs: string[];
  optionalInputs?: string[];
  tags: string[];
  prompt: string;
  launchUrl: string;
  launchLabel: string;
  pinned: boolean;
  acceptsFileUpload?: boolean;
  aiAdapterSlug?: string | null;
  rankrocketMcpEnabled?: boolean;
};

const SEED: SeedRow[] = [
  {
    name: "SEO Audit via Rank Rocket SEO Plugin",
    category: "Audit",
    description:
      "Repeatable browser-rendered SEO audit: on-page, technical, local, schema, and off-page recommendations. Prompts for inputs, runs parallel browser scans, and delivers a prioritized fix list applied one at a time with rescan confirmation.",
    inputs: [
      "Website URL",
      "WP Username",
      "WP App Password",
      "GBP URL - Maps Share Link or None",
      "Business Type - GBP Primary Category or Business Type",
      "Location/Market - Service Area",
      "SAB or Exposed Address",
      "GBP Restrictions - Are there any restrictions on touching the GBP? (e.g., recently verified, cooling off period, name set by Google)",
      "CMS — (WordPress, Squarespace, Wix, custom, etc.)",
      "SEO Plugin — (RankRocket SEO, RankMath, Yoast, HFCM, All-in-One SEO, none, etc.)",
      "Site Architecture - Standalone site (handles its own bookings/leads), Franchise/Parent-Child site (regional site that hands bookings off to a central parent domain), Multi-Location Site (one site covering multiple service areas with separate location pages)",
      "Report Branding - AMS, Rank Rocket, Other",
    ],
    tags: ["seo", "audit", "browser-rendered", "skill", "v2.6"],
    prompt: `Use the "seo-site-audit" skill.

Website URL: <PASTE>
GBP: <PASTE>
Business type: <PASTE>
SAB or exposed address: <PASTE>
GBP Restrictions: <PASTE>
CMS: <PASTE>
SEO Plugin: <PASTE>
Site Architecture: <PASTE>
Report branding: <PASTE>

WordPress credentials (WP sites only — do NOT paste the App Password here):
  WP Username: <PASTE username only>
  WP App Password: enter in the secure credential form when prompted
    (or reuse the saved vault entry for this hostname if one exists)

Run the parallel scans and return a prioritized findings report. Apply fixes one at a time and pause for rescan confirmation between each.`,
    launchUrl: "https://www.perplexity.ai/computer",
    launchLabel: "Start Audit",
    pinned: true,
  },
  {
    name: "Re-audit existing client site",
    category: "Audit",
    description:
      "Lightweight re-run of the SEO audit skill against a previously audited site. Confirms prior fixes, surfaces regressions, and adds any new findings since the last pass.",
    inputs: [
      "Website URL",
      "Date / link of last audit",
      "Any fixes deployed since last audit",
    ],
    tags: ["seo", "re-audit", "regression"],
    prompt: `Use the "seo-site-audit" skill.

This is a re-audit for <URL>.
Last audit: <DATE / link>
Fixes deployed since: <LIST>

Verify prior fixes, flag regressions, and add new findings.`,
    launchUrl: "https://www.perplexity.ai/computer",
    launchLabel: "Start Audit",
    pinned: false,
  },
  {
    name: "Franchise vs standalone disambiguation",
    category: "Audit",
    description:
      "Quick pre-audit check to confirm whether a target URL is a franchise location page or a standalone site. Adjusts schema, NAP, and link strategy accordingly.",
    inputs: ["Website URL", "Parent brand domain (if any)", "GBP link"],
    tags: ["pre-audit", "franchise", "intake"],
    prompt: `Determine whether <URL> is a franchise location site or a standalone site.

Check: parent brand domain links, shared schema, shared phone/address, footer attribution, GBP linkage.
Return: classification + recommended audit adjustments (schema scope, NAP source of truth, link strategy).`,
    launchUrl: "",
    launchLabel: "",
    pinned: false,
  },

  {
    name: "LocalBusiness JSON-LD generator",
    category: "Schema",
    description:
      "Generate a valid LocalBusiness JSON-LD block (with sameAs, geo, openingHours, areaServed) tuned to SAB vs exposed-address businesses. Includes an HFCM/Elementor footer-injection note.",
    inputs: [
      "Business name",
      "Address or service area",
      "Phone (E.164)",
      "GBP CID URL",
      "Social profile URLs",
      "Hours",
      "Primary services",
    ],
    tags: ["schema", "json-ld", "localbusiness", "hfcm"],
    prompt: `Generate LocalBusiness JSON-LD for:

Name: <NAME>
SAB or address: <PASTE>
Phone: <E.164>
GBP CID: <URL>
sameAs: <LIST>
Hours: <PASTE>
Services: <LIST>

Use @type appropriate to the trade. Include geo (or areaServed for SAB), openingHoursSpecification, and aggregateRating only if real data exists. Return paste-ready <script type="application/ld+json"> block.`,
    launchUrl: "https://validator.schema.org/",
    launchLabel: "Create Schema",
    pinned: false,
  },
  {
    name: "FAQPage schema from on-page FAQ",
    category: "Schema",
    description:
      "Convert an on-page FAQ section into FAQPage JSON-LD. Preferred over GBP Q&A seeding for ownership and durability.",
    inputs: ["Page URL", "Q/A pairs (or paste of FAQ section)"],
    tags: ["schema", "faqpage", "on-page"],
    prompt: `Convert the FAQ section below into FAQPage JSON-LD.

Page URL: <URL>
FAQ:
<PASTE Q/A pairs>

Return paste-ready <script type="application/ld+json"> with @type FAQPage and one Question per pair. Match question wording exactly to on-page text.`,
    launchUrl: "https://validator.schema.org/",
    launchLabel: "Validate at schema.org",
    pinned: false,
  },
  {
    name: "Service / Product schema bundle",
    category: "Schema",
    description:
      "Build Service or Product schema with BreadcrumbList, Offer, and aggregateRating wiring. Flags fields that require real review data before adding ratings.",
    inputs: [
      "Page URL",
      "Service or product name",
      "Description",
      "Price or price range",
      "Provider business name",
      "Areas served",
    ],
    tags: ["schema", "service", "product", "breadcrumb"],
    prompt: `Generate Service (or Product) + BreadcrumbList JSON-LD for:

Page URL: <URL>
Name: <PASTE>
Description: <PASTE>
Price: <PASTE>
Provider: <BUSINESS NAME>
Areas served: <LIST>

Do NOT include aggregateRating unless real review counts are provided.`,
    launchUrl: "https://search.google.com/test/rich-results",
    launchLabel: "Rich Results Test",
    pinned: false,
  },
  {
    name: "Schema visibility check (footer leak audit)",
    category: "Schema",
    description:
      "Verify that JSON-LD is in the DOM but not visually rendered. Catches the common HFCM footer-leak where raw schema appears as visible text.",
    inputs: ["Page URL", "Plugin used to inject schema (HFCM, Rank Math, etc.)"],
    tags: ["schema", "qa", "hfcm", "footer-leak"],
    prompt: `Check <URL> for visible schema text in the rendered footer.

Steps:
1. Fetch the rendered HTML.
2. Confirm <script type="application/ld+json"> exists in <head> or <body>.
3. Confirm the JSON content does NOT appear as visible text anywhere on the page.
4. If visible, identify the injection mechanism (HFCM, theme footer, Elementor block) and recommend the fix.`,
    launchUrl: "",
    launchLabel: "",
    pinned: false,
  },

  {
    name: "Rank Tracker delta analysis",
    category: "Reporting",
    description:
      "Analyze SEO Power Suite Rank Tracker exports. Returns counts by movement bucket (up / down / flat / new / lost), top movers, and a markdown summary suitable for client meetings.",
    inputs: [
      "Rank Tracker CSV or XLSX export",
      "Reporting period",
      "Target keywords or pages of interest (optional)",
    ],
    tags: ["reporting", "rank-tracker", "seo-power-suite"],
    prompt: `Analyze the attached Rank Tracker export.

Return:
- Counts: improved, declined, unchanged, newly ranking, lost.
- Top 10 movers up and down with keyword, page, before, after, delta.
- Any keywords entering or leaving page 1.
- A short markdown summary for a client meeting agenda.

Output as a downloadable markdown file.`,
    launchUrl: "",
    launchLabel: "",
    pinned: false,
  },
  {
    name: "Uniform Audit Report",
    category: "Reporting",
    description:
      "Render audit findings using the standardized agency report format established with the Easy Dumpster Jacksonville and United Structural Systems audits. Consistent sectioning, severity badges, and prioritized fixes.",
    inputs: [
      "Audit findings (markdown or paste)",
      "Client name",
      "Site URL",
      "Audit date",
      "Logo / brand color (optional)",
    ],
    tags: ["reporting", "pdf", "branding", "uniform"],
    prompt: `Render the attached findings into a uniform audit report PDF.

Use the established format:
- Cover with client name, URL, date, agency mark.
- Executive summary (3-5 bullets).
- Severity-tagged findings grouped by On-Page / Technical / Local / Schema / Off-Page.
- Each finding: issue, evidence, recommendation, effort, impact.
- Prioritized fix list at the end.

Match the spacing and typography of prior reports.`,
    launchUrl: "",
    launchLabel: "",
    pinned: true,
  },
  {
    name: "Blog content meeting agenda",
    category: "Reporting",
    description:
      "Generate a blog-only meeting agenda from ranking data: which posts are gaining, which need refresh, and which topic gaps to fill next.",
    inputs: [
      "Rank Tracker export (blog URLs only)",
      "GA4 or GSC export for blog (optional)",
      "Target audience / persona",
    ],
    tags: ["reporting", "content", "agenda"],
    prompt: `Build a blog-content meeting agenda from the attached ranking data.

Sections:
1. Wins to celebrate (posts gaining traffic / positions).
2. Refresh candidates (decayed or stuck on page 2).
3. New topic gaps (queries with impressions but no matching post).
4. Recommended next 3 posts with target query, intent, and outline angle.

Limit to blog content only. Return as a single downloadable markdown file.`,
    launchUrl: "",
    launchLabel: "",
    pinned: false,
  },

  {
    name: "GBP suspension-risk check (price changes)",
    category: "Verification",
    description:
      "Pre-flight check before changing prices, hours, or category on a Google Business Profile. Surfaces current Google guidance on suspension triggers and recommends a safe sequence.",
    inputs: ["GBP link", "Proposed change(s)", "Last edit date if known"],
    tags: ["verification", "gbp", "risk"],
    prompt: `Research the latest Google guidance on GBP suspension triggers, focused on:
- Price changes
- Category edits
- Service area edits
- Name / address edits

Then evaluate the proposed change and recommend whether to: proceed, stage in steps, or wait. Cite the most recent Google sources.`,
    launchUrl: "https://support.google.com/business/",
    launchLabel: "GBP Help Center",
    pinned: false,
  },
  {
    name: "Footer link-leak verification",
    category: "Verification",
    description:
      "Scan a rendered page for unintended outbound links in the footer (developer credits, plugin attributions, theme links). Returns a kill-list with file/component locations.",
    inputs: ["Page URL", "WordPress theme name (if known)"],
    tags: ["verification", "footer", "link-leak"],
    prompt: `Fetch the rendered HTML of <URL>.

Identify all outbound links inside the <footer>. For each:
- Anchor text
- Target URL
- Likely source (theme, plugin, manual edit)
- Recommended removal location (file path or theme builder block)

Return as a kill-list table.`,
    launchUrl: "",
    launchLabel: "",
    pinned: false,
  },
  {
    name: "Map embed source verification",
    category: "Verification",
    description:
      "Confirm a Google Map embed is sourced from the correct GBP listing and not a hard-coded coordinate or wrong location. Includes Elementor / theme builder location hints.",
    inputs: ["Page URL", "Expected GBP CID URL"],
    tags: ["verification", "map", "gbp"],
    prompt: `Verify the map embed on <URL> is sourced from <CID URL>.

Check the iframe src parameters, any cached pb= string, and confirm the rendered map matches the expected business. If mismatched, locate the embed source (theme footer, Elementor block, page widget) and provide a fix.`,
    launchUrl: "",
    launchLabel: "",
    pinned: false,
  },

  {
    name: "RankRocket plugin patch flow",
    category: "Automation",
    description:
      "Standard flow for shipping a patch to the RankRocket SEO Control Layer plugin (formerly rankmath-rest-bridge). Covers version bump, REST endpoint smoke test, activation check, and changelog entry.",
    inputs: [
      "Current version",
      "Target version",
      "Patch summary",
      "Affected endpoints",
    ],
    tags: ["automation", "rankrocket", "wordpress", "plugin"],
    prompt: `Patch RankRocket from <CURRENT> to <TARGET>.

1. Bump version in plugin header and constant.
2. Apply patch: <SUMMARY>.
3. Smoke-test affected endpoints: <LIST>.
4. Confirm activation on the dev site.
5. Update CHANGELOG.md with the version, date, and bullet list of changes.
6. Commit with message: "RankRocket vX.Y.Z: <summary>".`,
    launchUrl: "https://github.com/PenZenMaster/rankmath-rest-bridge/",
    launchLabel: "Open repo",
    pinned: false,
  },
  {
    name: "VS Code WordPress dev SOP",
    category: "Automation",
    description:
      "SOP for configuring VS Code for WordPress development aligned with WordPress.org coding standards. Includes addendum on code-level security checks (sanitization, escaping, nonces, capability checks).",
    inputs: ["Workspace path", "Plugin or theme being edited"],
    tags: ["sop", "vscode", "wordpress", "security"],
    prompt: `Apply the VS Code WordPress development SOP to <WORKSPACE>.

Configure: PHP CS with WordPress-Core ruleset, Intelephense, ESLint for block editor, EditorConfig.

Then run the code-level security checklist on <PLUGIN/THEME>:
- Input sanitization (sanitize_text_field, etc.)
- Output escaping (esc_html, esc_attr, esc_url, wp_kses_post)
- Nonces on every form / AJAX action
- current_user_can() capability checks before privileged actions
- Prepared statements for $wpdb queries

Return a pass/fail table per check with file:line references.`,
    launchUrl: "",
    launchLabel: "",
    pinned: false,
  },
  {
    name: "Schema injection cleanup (HFCM → theme)",
    category: "Automation",
    description:
      "Migrate schema injection off the HFCM plugin and into the theme header / functions.php to eliminate footer leaks and reduce plugin surface area.",
    inputs: [
      "Site URL",
      "Current HFCM snippet IDs",
      "Theme (parent or child)",
    ],
    tags: ["automation", "wordpress", "schema", "hfcm"],
    prompt: `Migrate schema injection on <URL> from HFCM to the theme.

Steps:
1. Export each HFCM snippet as raw HTML.
2. Add a wp_head action in the child theme's functions.php that prints the JSON-LD only on the matching template (front_page, single, page, is_singular).
3. Disable the HFCM snippets (don't delete yet).
4. Confirm rendered HTML still contains the JSON-LD and no longer shows visible schema text in the footer.
5. Once verified, remove HFCM if it has no other use.`,
    launchUrl: "",
    launchLabel: "",
    pinned: false,
  },

  {
    name: "Local entity / cloud stack builder",
    category: "Local SEO",
    description:
      "Plan a local entity stack (Google Sites, Drive assets, YACSS-style cloud stack) anchored to the GBP CID. Outputs a build order, anchor variation, and indexing plan.",
    inputs: [
      "Business name",
      "GBP CID URL",
      "Primary city + service",
      "Money-page URL",
      "Existing assets to incorporate",
    ],
    tags: ["local-seo", "entity-stack", "cloud-stack", "yacss"],
    prompt: `Plan a local entity stack for <BUSINESS>.

Anchors:
- GBP CID: <URL>
- Money page: <URL>
- Primary city + service: <PASTE>

Return:
1. Build order (Google Sites > Drive folder > YACSS cloud stack > tier-2 props).
2. Anchor text variation table (branded / naked / partial / generic mix with %).
3. Indexing plan and pacing.
4. Tracking sheet columns.`,
    launchUrl: "",
    launchLabel: "",
    pinned: false,
  },
  {
    name: "GBP + GSC + GA4 architecture export",
    category: "Local SEO",
    description:
      "Export the AEO/GEO architecture diagram and data-flow notes for GBP, Google Search Console, and GA4 as a single deliverable. Useful for onboarding new clients or handing off to a dev.",
    inputs: ["Client name", "Property URLs (GSC + GA4)", "GBP link"],
    tags: ["local-seo", "architecture", "aeo", "geo"],
    prompt: `Export the AEO/GEO architecture for <CLIENT>.

Include:
- GBP signals and how they feed AEO/GEO.
- GSC property setup (domain vs URL prefix, sitemaps, regex filters used).
- GA4 events and conversions tied to SEO.
- Data-flow diagram (mermaid is fine).

Return as a single downloadable file.`,
    launchUrl: "",
    launchLabel: "",
    pinned: false,
  },

  {
    name: "Page content brief from intent",
    category: "Content",
    description:
      "Generate a content brief for a target query: intent classification, SERP analysis summary, recommended H-structure, entities to mention, and on-page FAQ candidates.",
    inputs: [
      "Target query",
      "Target URL (existing or new)",
      "Audience / persona",
      "Geographic focus (if local)",
    ],
    tags: ["content", "brief", "intent", "serp"],
    prompt: `Build a content brief for the target query: <QUERY>.

Return:
1. Intent classification (informational / commercial / transactional / navigational / mixed).
2. SERP feature inventory (PAA, local pack, video, AI overview).
3. Recommended H1/H2/H3 outline.
4. Required entities and supporting concepts.
5. 5-7 on-page FAQ candidates with FAQPage-friendly wording.
6. Internal link targets from the existing site.`,
    launchUrl: "",
    launchLabel: "",
    pinned: false,
  },

  {
    name: "Location Page Builder (Rank Rocket + WordPress)",
    category: "Local SEO",
    description:
      'Builds and publishes SEO-optimized location landing pages via the Rank Rocket SEO plugin\'s WordPress REST API. Uses the "location-page-builder" skill to generate on-brand, locally-relevant page content per target city or service area, then publishes drafts through Rank Rocket\'s REST endpoints for review before going live.',
    inputs: [
      "WordPress site URL",
      "RankMath REST Bridge Base URL - your site's REST API namespace URL, e.g. https://yoursite.com/wp-json/rankrocket-seo/v1 (older plugin versions use /wp-json/rankmath-bridge/v1)",
      "Business name",
      "Target city or service area(s)",
      "Primary service / money page URL",
      "Page template / content style preferences",
      "WP Username",
      "WP App Password",
    ],
    tags: ["local-seo", "rankrocket", "wordpress", "skill", "location-pages", "rest-api"],
    prompt: `Use the "location-page-builder" skill.

WordPress site URL: <PASTE>
RankMath REST Bridge Base URL: <PASTE>
Business name: <PASTE>
Target city or service area(s): <PASTE>
Primary service / money page URL: <PASTE>
Page template / content style preferences: <PASTE>

WordPress credentials (do NOT paste the App Password here):
  WP Username: <PASTE username only>
  WP App Password: enter in the secure credential form when prompted
    (or reuse the saved vault entry for this hostname if one exists)

Generate one SEO-optimized location page per target city/service area, matching the existing site's tone and template. Publish each page as a draft via the Rank Rocket plugin's WordPress REST API endpoints - do not publish live without explicit confirmation. Return the list of created draft page URLs/IDs for review.`,
    launchUrl: "https://www.perplexity.ai/",
    launchLabel: "Launch in Perplexity",
    pinned: true,
  },

  {
    name: "Ranking Audit and Improvement Suite",
    category: "Audit",
    description:
      "Create a markdown SEO and local SEO growth plan from a keyword ranking CSV, website URL, WordPress credentials, Rank Math REST Bridge access, and a Google Business Profile share link or structured GBP snapshot. Built to reuse scan, remediation, and reporting patterns from an existing SEO audit system while restoring reliable GBP-aware planning. Filters the union (OR) of keywords with exact Tag = Root Keyword and keywords with strict numeric search volume greater than 10000 after cleaning. Drafts implementation assets including title tags, meta descriptions, H1S, H2S, FAQ ideas, schema recommendations, internal links, GBP services, GBP post topics, and review themes. Uses a persistent project knowledge store and avoids duplicate scans.",
    inputs: [
      "Ranking CSV (attach the file in Perplexity)",
      "Website URL",
      "GBP share link or snapshot",
      "WP Username",
      "WP App Password",
      "RankMath REST Bridge Base URL",
      "Project Knowledge Store",
    ],
    tags: ["audit"],
    prompt: `Run the seo-rank-and-gbp-growth-planner skill.

Before starting, confirm understanding of the assignment in 3-6 bullets and list any missing required inputs.

Inputs:
- ranking_csv: <PASTE>
- website_url: <PASTE>
- gbp_input: <PASTE>
- wp_username: <PASTE>
- wp_app_password: <PASTE>
- rankmath_rest_bridge_base_url: <PASTE>
- project_knowledge_store: <PASTE>

Optional supporting inputs:
- target_service_areas: <PASTE>
- core_services: <PASTE>
- target_competitors: <PASTE>
- existing_location_pages: <PASTE>
- preferred_brand_terminology: <PASTE>
- prior_seo_changes: <PASTE>
- schema_policies: <PASTE>

Requirements:
- Output markdown only.
- Keyword filter is a UNION (OR), not an intersection: include every row where Tag exactly equals "Root Keyword" OR where # of Searches is a strict numeric value greater than 10000 after cleaning. A row qualifies if it satisfies EITHER condition; it does not need to satisfy both.
- In the "Filtered keyword set" section, report the counts separately: rows matched by Tag, rows matched by search volume, rows matched by both, and the total union.
- Draft implementation assets, not just recommendations.
- Reuse prior project knowledge before rescanning anything.
- Do not repeat the same scan multiple times.
- If GBP data is incomplete, label those items as verification-needed or reduced-confidence rather than missing.

Analysis goals:
- Improve Google Rank.
- Improve Google.com Mobile Rank.
- Improve Google.com Maps Rank.
- Prioritize actions by impact, effort, and cross-keyword reuse value.
- Map keyword clusters to the best existing page, new page, or GBP action.

Required output structure:
# Keyword Ranking Growth Plan
## Scope
## Filtered keyword set
## Findings
### Organic
### Mobile
### Maps
## Priority actions
## Draft implementation assets
## Verification needed or blockers
## Project memory updates
## Final validation checklist`,
    launchUrl: "https://www.perplexity.ai/computer",
    launchLabel: "Start Audit",
    pinned: false,
  },

  {
    name: "RankRocket Site Insights",
    category: "Audit",
    description:
      "Ask questions about a RankRocket-managed WordPress site's SEO status, content, and configuration - answered by Claude using live, read-only RankRocket MCP tools instead of manually pasting credentials into an external AI chat. Can surface: plugin/WordPress/RankMath status and capabilities; heading hierarchy, broken links, image alt-text coverage, schema markup, and llms.txt diffs; stored SEO meta for a post or term; redirect rules; text snippets; performance/cache dequeue and defer rules; and Elementor page layout data. This workflow can only read data; it never attempts a write/mutating action.",
    inputs: [
      "RankRocket MCP site key (e.g. tristate-hvac, trevoraspiranti - see your RankRocket MCP site registry)",
      'What do you want to know about this site? (e.g. "is the plugin active and what\'s alt-text coverage?", "any broken links?", "what SEO meta is set for post 42?", "list current redirects", "what perf/cache rules are configured?")',
    ],
    tags: ["rankrocket", "mcp", "read-only", "wordpress"],
    prompt: `Answer the operator's question about the RankRocket-managed WordPress site below using the available RankRocket tools (site status/capabilities, content audits, SEO meta, redirects, snippets, perf/cache settings, images, Elementor layout preview). These tools are strictly read-only in this workflow - never attempt or suggest a write/mutating action.

Site key: <PASTE>
Question: <PASTE>

Call whichever RankRocket tools are relevant using the site key above. Cite the specific data the tools return rather than guessing, and say plainly if a tool returns nothing useful for the question.`,
    launchUrl: "",
    launchLabel: "",
    pinned: false,
    rankrocketMcpEnabled: true,
  },
];

export function seedIfEmpty() {
  const existing = db.select().from(workflows).all();
  if (existing.length > 0) return;
  const now = Date.now();
  for (const row of SEED) {
    db.insert(workflows)
      .values({
        name: row.name,
        category: row.category,
        description: row.description,
        inputs: JSON.stringify(row.inputs),
        optionalInputs: JSON.stringify(row.optionalInputs ?? []),
        tags: JSON.stringify(row.tags),
        prompt: row.prompt,
        launchUrl: row.launchUrl,
        launchLabel: row.launchLabel,
        pinned: row.pinned ? 1 : 0,
        acceptsFileUpload: row.acceptsFileUpload ? 1 : 0,
        aiAdapterSlug: row.aiAdapterSlug ?? null,
        rankrocketMcpEnabled: row.rankrocketMcpEnabled ? 1 : 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }
}
