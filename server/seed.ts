import { db } from "./storage";
import { workflows } from "@shared/schema";

type SeedRow = {
  name: string;
  category: string;
  description: string;
  inputs: string[];
  tags: string[];
  prompt: string;
  launchUrl: string;
  launchLabel: string;
  pinned: boolean;
};

const SEED: SeedRow[] = [
  {
    name: "SEO Site Audit (full skill)",
    category: "Audit",
    description:
      "Repeatable browser-rendered SEO audit: on-page, technical, local, schema, and off-page recommendations. Prompts for inputs, runs parallel browser scans, and delivers a prioritized fix list applied one at a time with rescan confirmation.",
    inputs: [
      "Website URL",
      "Google Business Profile link",
      "Business type / category",
      "SAB vs exposed address",
      "Service area or restrictions",
      "Site architecture (franchise vs standalone)",
      "Report branding preferences",
    ],
    tags: ["seo", "audit", "browser-rendered", "skill", "v2.6"],
    prompt: `Use the "seo-site-audit" skill.

Website URL: <PASTE>
GBP: <PASTE>
Business type: <PASTE>
SAB or exposed address: <PASTE>
Franchise or standalone: <PASTE>
Report branding: <PASTE>

Run the parallel scans and return a prioritized findings report. Apply fixes one at a time and pause for rescan confirmation between each.`,
    launchUrl: "https://www.perplexity.ai/",
    launchLabel: "Launch in Perplexity",
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
    launchUrl: "https://www.perplexity.ai/",
    launchLabel: "Launch in Perplexity",
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
    launchLabel: "Validate at schema.org",
    pinned: true,
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
    pinned: true,
  },
  {
    name: "Uniform audit report (Easy Dumpster format)",
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
    pinned: true,
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
        tags: JSON.stringify(row.tags),
        prompt: row.prompt,
        launchUrl: row.launchUrl,
        launchLabel: row.launchLabel,
        pinned: row.pinned ? 1 : 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }
}
