# Workflow Portal — System Documentation

## Preface: Purpose of the Agency Portal

The Workflow Portal is a private, internal tool for a digital marketing and SEO agency. It serves two primary functions:

**1. Workflow Catalog**
A searchable library of repeatable agency workflows — SEO audits, schema checks, reporting routines, and content processes. Each workflow stores its prompt, required inputs, and a one-click launch button that pre-fills Perplexity with the prompt so analysts can execute it immediately.

**2. AI Visibility Reporting Module**
A measurement layer that tracks how client brands appear in AI-generated answers across platforms like Perplexity. Rather than relying on traditional keyword rankings alone, this module measures the metrics that matter for Generative Engine Optimization (GEO): citation frequency, mention rate, AI Share of Voice, and visibility scoring. Results are traceable back to individual AI responses, making every metric auditable.

The portal is not client-facing by default. It is used by agency staff (analysts, account managers, strategists) to run audits, review results, and generate reports for clients.

---

## Section 1: Recommended Setup Order

### 1A. Global Application Settings (one-time, done by Super Admin)

Complete these steps before onboarding any client.

**1. Deploy and create the admin account**
On first visit to the portal, the setup screen appears. Create the Super Admin username and password. This is the only account created this way — all additional accounts are created through the Users page.

**2. Set environment variables in cPanel**
In cPanel → Setup Node.js App → Environment Variables:

| Variable | Required | Purpose |
|---|---|---|
| `SESSION_SECRET` | Yes | 32+ char random hex string — secures session cookies |
| `DATA_DB_PATH` | Yes | `../persistent/data.db` — survives deploys |
| `SESSION_DB_PATH` | Yes | `../persistent/sessions.db` — survives deploys |
| `NODE_ENV` | Yes | `production` |
| `PERPLEXITY_API_KEY` | For AI runs | Get from perplexity.ai/settings/api |
| `PERPLEXITY_DAILY_USD_LIMIT` | Recommended | e.g. `10` — caps daily API spend |
| `OPENAI_API_KEY` | Optional | Enables ChatGPT as a query target in Runs |
| `ANTHROPIC_API_KEY` | Optional | Enables Claude as a query target in Runs |
| `GOOGLE_AI_API_KEY` | Optional | Enables Gemini as a query target in Runs (distinct from GA4 OAuth credentials below) |
| `GROQ_API_KEY` | Optional | Enables Llama (via Groq) as a query target in Runs — free tier available |
| `MISTRAL_API_KEY` | Optional | Enables Mistral as a query target in Runs |
| `DEEPSEEK_API_KEY` | Optional | Enables DeepSeek as a query target in Runs |
| `GOOGLE_CLIENT_ID` | For GA4 | OAuth credential from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | For GA4 | OAuth credential from Google Cloud Console |
| `GOOGLE_REDIRECT_URI` | For GA4 | `https://yourportal.com/api/oauth/google/callback` |
| `SMTP_HOST` | For password reset | cPanel email host |
| `SMTP_USER` | For password reset | Sender email address |
| `SMTP_PASS` | For password reset | Email account password |
| `BASE_URL` | For password reset | `https://yourportal.com` |

**3. Create team accounts**
Navigate to **Users** (top navigation, visible to Super Admin only). Create accounts for each team member and assign the appropriate role:

| Role | Can do |
|---|---|
| Super Admin | Everything — user management, scoring config |
| Agency Admin | All client/prompt/run/report work |
| Analyst | Run audits, validate sentiment, annotate |
| Account Manager | View and share reports |
| Client Viewer | Read-only access to approved reports |

**4. Configure GA4 OAuth (if using traffic data)**
- Create an OAuth 2.0 credential at console.cloud.google.com
- Enable **both** of the following APIs in the same Cloud project — they are
  separate APIs and both must be enabled individually, even though a single
  `analytics.readonly` OAuth scope and consent screen covers both:
  - **Google Analytics Data API** (`analyticsdata.googleapis.com`) — used to
    fetch AI traffic numbers on the client Traffic tab
  - **Google Analytics Admin API** (`analyticsadmin.googleapis.com`) — used by
    the GA4 property picker dropdown on the Integrations page
    (`Section 1B Step 4`). If only the Data API is enabled, traffic fetching
    works but the property picker silently falls back to manual entry — see
    the troubleshooting note in Step 4 below.
- Add the redirect URI to Authorized redirect URIs
- Set the three `GOOGLE_*` env vars above

---

### 1B. Client Configuration (per client, done by Agency Admin or Analyst)

Follow this order for each new client. Skipping steps will result in missing data in reports.

**Step 1 — Create the client**
AI Visibility → New Client
- **Client name**: the agency client's company name
- **Primary domain**: their main website domain (e.g. `acmeseo.com`) — used to detect domain citations in AI responses

**Step 2 — Add brands**
Client page → Brands section → Add brand

Add at minimum:
- The client's own brand (kind: `client`, enter canonical name and domain)
- Key competitors to track against (kind: `competitor`)

> **Important:** AI Share of Voice is calculated as the client brand's mentions
> divided by total mentions across ALL brands. If no competitor brands are added,
> every detected mention belongs to the client by definition, and AI Share of Voice
> will read as a meaningless 0% or 100% rather than a real ratio. Add at least one
> competitor brand (with aliases, Step 3) before relying on AI Share of Voice for
> a client.

**Step 3 — Add brand aliases**
Click the `›` arrow next to each brand to expand it, then add aliases.

Aliases are the alternate names the AI response parser will search for. The parser only detects what it is told to look for. Examples:

| Canonical name | Aliases to add |
|---|---|
| Full Metal Jacket SEO | FMJ SEO, Full Metal Jacket, fullmetaljacketseo.com |
| Rival Digital Agency | Rival Digital, Rival Agency, rivaldigital.com |

Add every realistic variation — abbreviations, common misspellings, domain names, names without punctuation.

**Step 4 — Connect GA4 (optional)**
Client page → ⚙ Integrations → Connect Google Analytics
- Sign in with the Google account that has at least Viewer access to this client's GA4 property
- After connecting, the portal automatically lists every GA4 property the connected
  account can access (via the Google Analytics Admin API) — pick the correct one from
  the dropdown
- If the dropdown doesn't load (Admin API not enabled, or the account has no GA4
  properties), use "Enter ID manually" and type the numeric Property ID (found in
  GA4 → Admin → Property Settings → Property ID — this is a plain number, NOT the
  G-XXXXXXXX Measurement ID)

> **Troubleshooting — property dropdown always shows manual entry:**
> Check the server log for `"ga4 properties list failed"`. If the error body
> contains `"status": "PERMISSION_DENIED"` / `"reason": "SERVICE_DISABLED"` for
> `analyticsadmin.googleapis.com`, the Google Analytics Admin API is not
> enabled in the Cloud project backing `GOOGLE_CLIENT_ID` (see Section 1A
> Step 4). Fix:
> 1. Open `https://console.developers.google.com/apis/api/analyticsadmin.googleapis.com/overview?project=<PROJECT_NUMBER>`
>    (the project number is included in the error message).
> 2. Click **Enable** and wait a few minutes for it to propagate.
> 3. Reload the Integrations page, or click "Re-connect Google account" to
>    retry — no portal restart or re-authentication is required.
> This is the picker's designed fallback behavior, not a portal bug.

> **Troubleshooting — Test fails with `403` / `ACCESS_TOKEN_SCOPE_INSUFFICIENT`:**
> The connected Google account granted the sign-in without ticking the
> **"See and download your Google Analytics data"** checkbox on Google's
> granular consent screen, so the stored token has no Analytics scope.
> Fix: go to `https://myaccount.google.com/permissions`, remove the portal's
> access, then click "Connect Google Analytics" again and make sure the
> Analytics checkbox is ticked before pressing Continue.
> Since v1.22.1 the portal rejects such a connection at connect time with the
> message "Google Analytics access was not granted", so this error should only
> appear on connections made before v1.22.1.

**Step 5 — Create a prompt collection**
Client page → Prompt Collections → New collection
- Give it a descriptive name (e.g. "Q2 2026 Local SEO Audit")
- Add prompts (see Section 3 for recommendations)
- Click Activate when ready

**Step 6 — Trigger a run**
Client page → Runs → Trigger Run, or from inside a prompt collection → Run Now
- Select the collection
- Click Start Run
- Processing takes 2–5 minutes for 10 prompts

**Step 7 — Review results**
After the run completes, data appears in Overview, Mentions, Share of Voice, and Sentiment. If you added brands/aliases after a run, open the run and click **Re-parse responses** to re-scan the existing AI responses against the updated brand definitions. A progress banner shows "Re-parsing responses: X/N done" while the re-parse jobs are processing (polled every 3 seconds), then "Re-parse complete" once finished — at which point the Overview/Mentions/Share of Voice/Sentiment sections refresh automatically (added in v1.5.0).

---

## Section 2: Data Sources and Formulas

Every metric in the portal traces back to raw AI response text stored in the database. Nothing is estimated or sampled.

### 2.1 How Responses Are Collected

When a run is triggered:
1. Each prompt's text is expanded for template tokens (see Section 3.5) and the resulting query string is sent to the Perplexity Sonar API
2. The full response text and ordered citation URLs are stored in `responses_raw`
3. The **parse-response** job scans the response text for brand aliases (exact, fuzzy, and regex matching)
4. Detected mentions are stored in `response_mentions` with position, section, and evidence text
5. Detected citations are stored in `response_citations` with URL, root domain, and ownership
6. The **sentiment-classify** job applies a rule-based lexicon to score each mention
7. The **aggregate-snapshot-daily** job recomputes lifetime cumulative totals (citation count,
   mention count, all-brand mentions, client-brand mentions, visibility score sum, response
   count) from every completed response and stores them in `metric_snapshots_daily` as of
   today's date.
   Overview/trend reports for a given period (30d/90d/365d) derive their totals as the
   **delta** between the latest snapshot at or before the period end and the latest
   snapshot before the period start — not a sum of every snapshot row in the period
   (fixed in v1.4.1; summing previously double-counted clients with snapshot history
   spanning multiple dates).

---

#### Token Usage Capture (added v1.37.0)

Every adapter extracts the provider's token-usage block (OpenAI-style
`usage.prompt_tokens`/`completion_tokens` for OpenAI, Groq, Mistral,
DeepSeek, and Perplexity; Anthropic `usage.input_tokens`/`output_tokens`;
Gemini `usageMetadata.promptTokenCount`/`candidatesTokenCount`) and the
prompt-run handler persists it to `responses_raw.input_tokens` /
`output_tokens` (issue #2 F1). Null means the provider omitted the block
or the row predates capture — historical rows are backfillable because
the full provider payload is stored in `raw_payload`. RunDetail shows
per-run totals ("Tokens: N in / M out"). Per-client aggregation
(v1.39.0): `GET /api/clients/:id/metrics/token-usage?period=` returns
per-platform response counts and input/output token sums for the period
(analyst roles and up — spend data is internal ops and never client
facing); ClientDetail shows it as the Token Usage section, hidden for
client_viewer sessions. Estimated cost is a later slice of GitHub issue
#2; the budget guard shipped in v1.50.0 (below).

**Timeout handling (v1.49.0, issue #2 F3):** a request that hits the
30s timeout (overridable via `LLM_TIMEOUT_MS`) is no longer retried —
the provider may already have generated (and billed) the full
response, so resending the same prompt could pay for it up to 3x on a
slow-but-successful generation. 429/5xx responses and pre-response
connection errors still retry with backoff as before; only the timeout
path changed.

**Monthly token budget guard (v1.50.0, issue #2 F6):** a per-client
month-to-date token guard (input+output, via the same aggregation as
the Token Usage section above) runs before a run is created — manual
trigger, "Retry failed", and the recurring `schedule-tick` handler all
consult it. Two independent thresholds, each opt-in via env var and
disabled unless set to a positive integer: `BUDGET_MONTHLY_TOKEN_WARN`
logs a warning and lets the run proceed (the manual-trigger response
also carries `budgetStatus: "warn"`); `BUDGET_MONTHLY_TOKEN_BLOCK`
refuses the run with `429 BUDGET_EXCEEDED` (manual endpoints) or, for
`schedule-tick`, skips creating that schedule's run and marks it fired
so the next tick doesn't immediately retry the same over-budget
client. Guards against a misconfigured schedule, a runaway
`{{competitor}}` fan-out, or repeated "Retry failed" clicks spending
without limit.

**Output caps and the utility tier (v1.38.0, issue #2 F2+F4):** every
adapter now sends an output cap — default 1500 tokens, overridable with
the `LLM_MAX_OUTPUT_TOKENS` env var. 1500 bounds runaway generations
without truncating typical answers (lifetime average is ~583 output
tokens; Mistral, the most verbose surface, averages ~1,007). CAUTION:
lowering the cap below typical answer length truncates what the parser
sees (mentions/citations near the end of answers disappear) — treat cap
changes as methodology-comparability events. Internal utility calls
(prompt generation, workflow CSV "Run with AI") no longer use
measurement-surface models: they run on an economy tier
(openai gpt-4o-mini, anthropic claude-haiku-4-5-20251001,
mistral mistral-small-latest; other providers' defaults are already
economy) with a 4096-token cap for long JSON output, overridable per
provider with `UTILITY_MODEL_<SLUG>` env vars. Measurement runs are
unaffected — surface fidelity is methodology, not waste.

#### Canonical-Name Mention Matching (added v1.41.0, PARSER_VERSION 1.1)

Mention detection previously matched only `brand_aliases` rows, so a
brand with no aliases was completely invisible in AI answer text (the
TD-14 failure class; it recurred at scale when 69 competitor brands were
added via the 2026-07-15 registry review with no aliases). As of parser
1.1 every brand's canonical name matches as an implicit exact alias
(deduped case-insensitively against configured aliases). Aliases remain
valuable for short forms and variants ("Salvo" for "Salvo Metal Works")
— the readiness check message now says exactly that. Runs parsed under
parser 1.0 need one re-parse to pick up canonical-name mentions;
manifests record parserVersion, so pre/post-1.1 runs are flagged as
"comparable with warnings" (parser_changed) by the run comparability
check added in v1.42.0.

#### Run Manifests (added v1.40.0)

Every run — manual or scheduled — gets an immutable manifest row
(`measurement_run_manifests`, one per run, written at creation, never
updated) recording exactly what the run was configured to execute:
methodology/panel/scoring/parser/classifier versions, platforms, prompt
and expected-response counts, purpose (`full_panel` for monthly
schedules, `sentinel` for weekly, `ad_hoc` for manual runs), a canonical
config snapshot (prompts + metadata, brands + aliases, sorted for order
independence), and a deterministic SHA-256 `config_hash`. Read via
`GET /api/runs/:id/manifest`. This is issue #3 Epic 2 slice E2a; the
comparability service (fully_comparable / comparable_with_warning /
not_comparable with named reasons) builds on these hashes in slice E2b.
Runs created before v1.40.0 have no manifest (404) — comparisons
involving them are inherently unverifiable.

#### Run Comparability (added v1.42.0)

`GET /api/runs/:id/comparability` compares a run's manifest against the
previous run of the same client + collection that has a manifest
(`?against=<runId>` compares an explicit pair instead) and returns one
of three statuses with itemized reasons. RunDetail shows the verdict as
a colored banner under the run header.

Severity map (locked 2026-07-16): changes to *what was asked or where*
are **blocking** — the runs are `not_comparable` and must not be read
as an uninterrupted trend:

- `methodology_changed` — different methodology version
- `prompts_changed` — prompts added, removed, or reworded
- `platforms_changed` — different platform set
- `replicates_changed` — different replicate count

Honest recomputations and tracking-set edits are **warnings** — the
runs are `comparable_with_warning`; trend movement may partly reflect
the change rather than real visibility shift:

- `parser_changed` / `scoring_changed` / `classifier_changed` — a
  version bump (e.g. parser 1.0 -> 1.1 canonical-name matching)
- `panel_version_changed` — collection version bump
- `brands_changed` / `aliases_changed` — competitor set or alias edits
  (SoV denominators shift when competitors are added or removed)
- `prompt_metadata_changed` — intent/geo/service/branded metadata
  edited with prompt text unchanged

Identical config hashes and replicate counts yield `fully_comparable`.
**Client meaning:** a "Not comparable" banner between two reporting
periods means the measurement itself changed — explain the change
before explaining the numbers. Warnings should be disclosed as
footnotes on trend charts. Runs without a manifest (pre-v1.40.0, or no
earlier run) show no banner: comparability is unknown, not asserted.

#### Measurement Health (added v1.66.0, issue #3 Epic 3 slice 1, tracked on issue #30; extended v1.68.0 slice 3)

`GET /api/runs/:id/measurement-health` rolls up several data-quality
signals for one run into a single status: `healthy`,
`healthy_with_warnings`, `degraded`, or `invalid_for_reporting`.

Inputs and status derivation (locked 2026-08-01):

- **Completion rate** (`completedPrompts / totalPrompts`, from the run's
  own counters) — below 50% is `invalid_for_reporting`.
- **Provider failure rate** (`failedPrompts / totalPrompts`) — above 20%
  is `degraded`; any failures at or below 20% is `healthy_with_warnings`.
- **Platform coverage** — the manifest's configured platforms vs. which
  platforms actually have a completed response; any manifest platform
  with zero completed responses is `healthy_with_warnings`.
- **Run comparability** (reuses `compareManifests` as-is) —
  `not_comparable` is `invalid_for_reporting`; `comparable_with_warning`
  is `healthy_with_warnings`.
- **Prompt-metadata completeness** (added v1.66.0 slice 2, reuses
  `computeCollectionDiagnostics` from issue #4 Phase 3 item J, scoped to
  the run's collection) — any prompt missing `intentType` or
  `brandContext` classification is `healthy_with_warnings`.
- **Brand-alias coverage** (added v1.66.0 slice 2, reuses
  `computeReadiness` from B-15, scoped to the run's client) — competitor
  brands configured with zero aliases is `healthy_with_warnings`.
- **Source-classification completeness** (added v1.68.0 slice 3, new
  `sourceDomainStore.countClassificationCompletenessForRun`, scoped to
  the run's own citations) — any citation left `unknown_or_low_trust`
  (not resolved to `client_owned`/`competitor_owned` by brand ownership,
  and not matched in the `source_domains` registry) is
  `healthy_with_warnings`. Unlike `sourceDomainStore.listUnreviewed`
  (the global monthly-review queue), this aggregation is scoped to one
  run so it can feed a per-run health signal.

Prompt-metadata completeness, brand-alias coverage, and source-
classification completeness are all setup/data-quality signals, not
measurement failures — they can only ever produce a warning, never
`degraded` or `invalid_for_reporting`, matching the warn-don't-block
precedent used throughout this app (issue #4's diagnostics, source
classification, etc.).

Precedence when multiple conditions apply: `invalid_for_reporting` >
`degraded` > `healthy_with_warnings` > `healthy`. Unlike
`/comparability`, this endpoint never 404s on a missing manifest or
baseline — a run with no manifest still gets a health status from
completion/failure rate alone (platform coverage and comparability are
simply omitted, not treated as errors), since a health check needs to
work on exactly the runs most likely to have something wrong with them,
including legacy pre-manifest runs.

**Deferred, not scored** (`{ measurable: false }` in the response):
replicate completion and model consistency. Neither has the underlying
instrumentation yet — no run in this codebase actually executes more
than one replicate per prompt despite the schema supporting it, and no
manifest records a "requested model" to compare against the actual
model a provider returned. Both are separate future initiatives, not
Epic 3 scope (see issue #30).

**Client meaning:** a `degraded` or `invalid_for_reporting` run's
numbers should be treated with caution or excluded from trend reading
entirely — the underlying data collection had a real problem (high
failure rate, low completion, or a config change that breaks
comparability), not just normal measurement noise.

#### Prompt Generation Provenance (added v1.43.0)

Every "Generate with AI" event writes an immutable
`prompt_generation_runs` record: adapter slug and model variant that
produced the candidates, active methodology version, a context snapshot
(client facts, brands, competitors, services, exclusions, requested
count — never credentials), the raw LLM output, and full validation
diagnostics (valid/invalid counts, per-item rejection reasons,
warnings). Prompts saved from the review panel carry a
`generation_run_id` link; manually added prompts have none. In the
collection UI, generated prompts show an "AI generated" badge whose
tooltip names the adapter, model, methodology version, and date.
Analysts can list a collection's runs via
`GET /api/prompt-collections/:id/generation-runs` and fetch full detail
(including raw output) via `GET /api/generation-runs/:id` (analyst+).
**Client meaning:** every AI-suggested panel question is auditable back
to exactly what model proposed it, from what inputs, under which
methodology — no prompt enters measurement from an unrecorded source.
This is issue #3 Epic 2 slice E2c (YLG prompt-gen spec Phase 4);
per-candidate analyst edit/decision audit lands with issue #4.

### 2.2 Metric Definitions and Formulas

**Period metric data source (changed v1.43.1, TD-24):** the Overview and
Share of Voice endpoints compute period totals (citation frequency,
mention rate, AI SoV, average visibility score) **live from the raw
response/mention/citation tables**, windowed on response capture time.
They previously used deltas between cumulative daily snapshots, which
assumed history only grows — re-parses and competitor pruning delete and
recreate mention rows, shrinking cumulative totals and producing
impossible ratios (observed: AI SoV 106% for Salvo Metal Works on
2026-07-16 after the parser 1.1 re-parse). Daily snapshots remain the
source for the Trend timeseries, where each point is a self-consistent
cumulative ratio. **Client meaning:** overview ratios now always reflect
exactly the responses captured in the selected period, under the current
parser/registry state — they are internally consistent by construction
and change retroactively when a re-parse improves detection (disclose
alongside the run-comparability warnings above).

**Methodology versioning (added v1.31.0):** every daily metric snapshot row
(`metric_snapshots_daily.methodology_version`) records the YLG methodology
version that was active when it was aggregated. Historical snapshots keep
the version they were calculated under, so a future scoring change never
silently rewrites old reports. The active methodology lives in the
`prompt_methodologies` table and is seeded automatically on startup;
`promptMethodologyStore.activateVersion(version)` (added v1.48.0) switches
which row is active, retiring the previous one — a version's own
`quotas`/`validationRules` are never edited in place once seeded (a quota
change is always a new version, so historical rows stay exact).

**Methodology v2.0 (active as of v1.48.0, issue #4 Phase 1 slice 6 —
completes the re-lock opened in slice 1):** 30-prompt panel, 24
non-branded / 6 branded (same panel size and split as v1.0), 3 replicates
on non-branded, monthly full run + weekly 8-prompt sentinel — but
`intentQuotas` now covers all 9 canonical intent types including
`educational` (v1.0 only quota'd 6 of its 8 intents: provider_recommendation
7, service_specific 5, problem_solution 4, geographic_discovery 4,
educational 4, trust_validation 2, comparison 2, brand_validation 1,
alternative 1 — sums to the full 30-prompt panel). v1.0 is retired but its
exact original quotas remain queryable via
`promptMethodologyStore.getByVersion("1.0")` for historical snapshots.
Quota *enforcement* (validating a generated panel against these numbers,
retrying or blocking on mismatch — issue #4 Section D) is not yet built;
this slice only formalizes the version record and its target numbers.

#### Citation Frequency
> What share of AI responses directly cite the client's website?

```
Citation Frequency = (Responses where client domain is cited / Total responses) × 100
```

A response counts as "cited" when a URL whose root domain matches the client's primary domain appears in the Perplexity citations list.

**Data sources:** `response_citations` rows where `owned_by_brand_id` = the client's brand
(joined from `responses_raw` for the client's `prompt_runs`), divided by total `responses_raw`
rows with `status = 'complete'`. Period totals come from `metric_snapshots_daily.citation_count`
/ `.prompt_response_count` (see Section 2.1, step 7).

**What it means to the client:** AI engines are recommending the client's own website as a
source — this drives direct AI-referral traffic (see Section 2.4) and signals the engine
trusts the client's domain as authoritative for the topic.

**How to improve it:** See "High mention rate, low citation frequency" and general
citation-building guidance in Section 3.4 — pursue authoritative third-party citations,
structured data/schema markup, and consistent NAP data so the engine has more reasons to
link directly to the client's site.

#### Mention Rate
> What share of AI responses mention or cite the client brand at all?

```
Mention Rate = (Responses where client is mentioned or cited / Total responses) × 100
```

A response counts as "mentioned" when any alias matches in the response text, OR the client domain is cited.

**Data sources:** distinct `responses_raw` rows that have a `response_mentions` row with
`brand_id` = the client's brand, OR a `response_citations` row with `owned_by_brand_id` =
the client's brand, divided by total `responses_raw` rows with `status = 'complete'`.
Period totals come from `metric_snapshots_daily.mention_count` / `.prompt_response_count`.
The Mentions list below the Overview shows the raw `response_mentions` evidence rows for
this client (joined via `responses_raw` -> `prompt_runs`, fixed in v1.4.2). Because the
rate formula above also counts citation-only responses, **Mention Rate can be non-zero
even when the Mentions list is empty** — that means the brand was cited but its name was
never matched in the response text (see TD-14).

**What it means to the client:** This is the broadest visibility signal — whether the
client comes up at all when someone asks an AI a relevant question, by name or by link.
A client can have a high Mention Rate but a much lower Citation Frequency if the AI talks
about them without linking to their site.

**How to improve it:** See "Low mention rate overall" in Section 3.4 — create
category-definition content and comparison pages, and pursue third-party coverage on
authoritative domains so the brand name itself becomes part of the AI's answer.

#### AI Share of Voice
> What fraction of all tracked brand mentions belong to the client?

```
AI SoV = (Client brand mentions / All tracked brand mentions) × 100
```

"All tracked brand mentions" includes mentions of the client AND all configured competitors across the same prompt set.

**Data sources:** `response_mentions` rows where `brand_id` = the client's brand, divided by
all `response_mentions` rows for any brand (`kind = 'client'` or `'competitor'`) configured
on the client record. Period totals come from `metric_snapshots_daily.client_brand_mentions`
/ `.all_brand_mentions` — both are raw `response_mentions` row counts, so the ratio cannot
exceed 100% (fixed in v1.6.0; previously the numerator used `mention_count`, a
response-count that could include citation-only responses with zero mention rows,
allowing AI SoV to exceed 100%).

**What it means to the client:** This is a relative, competitive metric — even if the
client's own Mention Rate is steady, AI SoV can fall if competitors are gaining ground in
the same answers. It answers "out of all the brands AI could have mentioned here, how
often was it us?"

**How to improve it:** See "Competitor citation advantage" in Section 3.4 — identify which
domains are citing competitors and pursue mentions or guest content on those same domains;
add or refresh comparison/alternative-style content that names the client alongside
competitors.

#### Avg Visibility Score
> How prominently does the client appear when they are mentioned?

Each response receives a Prompt Visibility Score using the M+S+R+C+T formula:

| Component | Points | Condition |
|---|---|---|
| M — Mention present | 1 | Brand mentioned anywhere in the response |
| S — Summary block | +2 | Brand mentioned in the opening paragraph |
| R — First recommended | +3 | Brand is item #1 in a ranked list |
| C — Client citation | +2 | Client domain directly cited |
| T — Trusted third-party | +1 | A trusted third-party source supports the topic |

```
Avg Visibility Score = Sum of all visibility scores / Number of responses
```

Maximum possible score per response: 9 points (all five components present).

**Data sources:** per-response scores are computed by `computeVisibilityScore()`
(`server/services/scoring.ts`) from that response's `response_mentions` and
`response_citations` rows at parse time. Period totals come from
`metric_snapshots_daily.visibility_score_sum` / `.prompt_response_count`.

**What it means to the client:** Mention Rate and Citation Frequency tell you *whether*
the client shows up; Avg Visibility Score tells you *how well* — whether they're buried in
a list, named first, discussed in the summary, or backed by trusted sources.

**How to improve it:** See "High visibility score but low conversion via GA4" in Section
3.4 for the traffic side. To raise the score itself, target whichever M+S+R+C+T components
are weakest — e.g. if citations (C) are missing, focus on citation-building; if the brand
is never first-ranked (R), focus on category-definition content that positions the client
as the leading/default choice.

---

#### Recommendation Classification (added v1.33.0)
> How strongly does the AI response present the brand as a choice?

Every parsed response stores one classification per mentioned brand in
`response_recommendations`, on a 7-status scale (visibility spec 6.2):
`not_mentioned` (no row stored), `incidental_mention`, `listed_option`,
`recommended`, `strongly_recommended`, `first_choice`, and
`negative_or_excluded`.

**Data sources:** deterministic rules over the parsed mentions — numbered-list
rank (rank 1 = first_choice, other ranks = listed_option), list-section
membership, and keyword patterns in the evidence excerpt ("highly
recommend" = strongly_recommended, "recommend" = recommended, "avoid" /
"not recommended" / complaint language = negative_or_excluded, which takes
precedence over all positive signals). Each row records rank, confidence,
the winning evidence excerpt, and `classifier_version` (currently
`rules-1.0`) so results are reproducible. Rows are deleted and recreated
on re-parse. An analyst override (`human_status`) is retained alongside
the machine result, never replacing it.

**What it means to the client:** being mentioned is not the same as being
recommended. This classification feeds the upcoming Recommendation Rate
and Recommendation Share of Voice metrics — the preferred competitive
KPIs — which count only `listed_option` or stronger.

**Human overrides (v1.36.0):** analysts (analyst role and up) can
correct a classification from the Run detail page — each complete
response has a collapsible Recommendations panel listing every brand's
machine status, rank, and evidence, with a status dropdown that records
an override via `PATCH /api/response-recommendations/:id`
(`GET /api/responses/:id/recommendations` backs the panel). The machine
status is always retained alongside the override (FR-11); metrics use
the override (`COALESCE(human_status, status)`), so corrections flow
into the non-branded recommendation rate and Recommendation SoV on the
next aggregate. Overrides survive re-parses only if the response is not
re-parsed (re-parsing deletes and recreates recommendation rows) —
re-parse a run only when parser/brand changes require it.

**Fixes:** v1.33.2 (TD-20) — numbered-list rank detection previously
required the list number to sit directly before the brand name with only
whitespace between, so the dominant LLM format `1. **Brand**` (and bolded
numbers like `**1.**`) never produced a rank. `first_choice` was
effectively unreachable on real responses, and the visibility score's
first-recommended component (R) never fired. Rank detection now tolerates
markdown emphasis markers around the list number; a digit after the dot
(e.g. "4.5") is still not treated as a rank. Runs parsed before v1.33.2
need a re-parse for corrected ranks, recommendation statuses, and
visibility scores.

#### Non-Branded Panel Metrics (added v1.35.0)
> How visible is the client when the prompt never names them?

`GET /api/clients/:id/metrics/non-branded?period=30d|90d|365d` computes
three metrics live from the raw tables (daily snapshots carry no
branded/non-branded split), scoped to complete responses whose prompt has
`brand_context = 'unbranded'` (v1.47.1; see "brand-context fix" below).

- **Non-branded mention rate** — % of non-branded responses mentioning a
  client brand. The defensible visibility number: the AI surfaced the
  client without being asked about them.
- **Non-branded recommendation rate** — % of non-branded responses whose
  effective recommendation status for a client brand is recommended-and-up
  (`recommended`, `strongly_recommended`, `first_choice` — see
  `RECOMMENDED_STATUSES`). `listed_option` deliberately does not count:
  being one name in a list is not a recommendation.
- **Recommendation SoV** — client recommendation rows / all-brand
  recommendation rows at recommended-and-up, within non-branded responses.
  Branded prompts are excluded because they trivially surface the client.

"Effective status" means the analyst's human override wins over the
machine classification when present (`COALESCE(human_status, status)`),
so corrections flow into reported numbers (FR-11).

**Brand-context fix (v1.47.1, issue #4 Phase 1 slice 5):** this endpoint
previously scoped on `brand_in_prompt = 0`, which only tracks whether the
*client's own* brand appears — a prompt naming only a competitor was
indistinguishable from a genuinely unbranded discovery prompt and
contaminated these numbers (issue #4 Problem #2). It now scopes on
`brand_context = 'unbranded'` (see the "Methodology v2.0 taxonomy
expansion" and "Deterministic brand-context classifier" entries above),
which excludes competitor-seeded prompts. The response envelope's
`unvalidatedResponses` field is retired: `brand_context` is derived
deterministically and total (the backfill classifies every prompt, no
NULL case going forward), so there is no longer a coverage gap to
report separately. Prompts not yet covered by a backfill run simply have
`brand_context IS NULL` and are excluded from the denominator like any
other non-unbranded prompt — run the backfill
(`POST /api/admin/brand-context/backfill`) after this version deploys.

**Client meaning:** "When people ask AI tools for a
[service] in [area] without naming anyone, you appear in X% of answers
and are actively recommended in Y%; of all recommendations handed out,
you get Z%."

#### Source Classification (added v1.34.0)
> Who is the AI citing, and how much does that citation count for?

Every citation stored during parsing is stamped with one of the 8 source
classes from visibility spec section 6.3: `client_owned`,
`competitor_owned`, `industry_authority`, `local_authority`,
`review_platform`, `publisher_editorial`, `general_directory`, and
`unknown_or_low_trust`.

**Data sources:** classification precedence is (1) brand ownership — a
citation whose root domain matches a tracked client/competitor brand's
primary domain is `client_owned`/`competitor_owned`; (2) the
`source_domains` registry — a global table mapping root domains to the
six non-ownership classes, each row carrying a required rationale and
who classified it (`seed` or `user:<id>`); (3) default
`unknown_or_low_trust` for anything unregistered. The registry is seeded
on startup with unambiguous review platforms (Yelp, BBB, Angi, Houzz,
Thumbtack, Trustpilot, HomeAdvisor) and general directories
(YellowPages, ZoomInfo, Manta, D&B, MapQuest, Foursquare); seeding never
overwrites a human reclassification. `isTrustedThirdParty` (the
visibility score's T component) is now derived from the class: true only
for `industry_authority`, `local_authority`, and `publisher_editorial` —
review platforms are reputation evidence reported separately, per spec.

**Registry management (admin roles):** `GET /api/source-domains`
(optionally `?class=`), `PUT /api/source-domains/:domain` (class +
rationale), and `GET /api/source-domains/unreviewed` — cited domains not
yet in the registry, most-cited first, which powers the spec's monthly
review of newly observed domains. Only `unknown_or_low_trust` citations
count toward the queue (v1.34.2): domains fully resolved by ownership
(client or competitor sites) never appear, and a domain that is owned in
one client's runs but unresolved in another's shows only its unresolved
citation count. Social platforms (YouTube, Facebook, Reddit, Instagram,
LinkedIn) were registered as `unknown_or_low_trust` with rationales in
the 2026-07-15 registry review, so they no longer appear in the queue
while keeping their untrusted class.

**What it means to the client:** an AI answer that cites the client's
own site proves the site is being read; an answer that cites a trusted
independent source naming the client is corroboration the client cannot
buy. This classification separates the two, and stops competitor sites
and low-trust scraped content from inflating trust metrics.

**Note:** citations parsed before v1.34.0 hold the default
`unknown_or_low_trust` until their runs are re-parsed.

**Fixes:** v1.34.1 (TD-21) — brand ownership matching (which drives both
`ownedByBrandId` and the `client_owned`/`competitor_owned` classes)
previously failed for brands whose primary domain was saved as a full
URL (e.g. `https://www.example.com/`) instead of a bare domain: the
parser prefixed a second scheme and the comparison never matched. Both
formats now work. Brands with URL-formatted domains need their runs
re-parsed for corrected ownership attribution.

#### Platform-Level Reporting (Epic 5, issue #29)

`GET /api/clients/:id/metrics/by-platform?period=30d|90d|365d` (slice 1) breaks the
four core live metrics (Mention Rate, Citation Frequency, AI SoV, Average
Visibility Score) out per platform, using the same live raw-table
aggregation as `GET .../metrics/overview` (TD-24) grouped by
`responses_raw.platform_id` instead of pooled. A platform with zero
completed responses in the requested period is omitted from the
`platforms` array entirely rather than reported as a 0% score — absence
of a sample is not evidence of poor performance.

The response also includes a `combined` object with **two rollup
methods**, always labeled via `defaultRollup`:

- **`responseWeighted`** — every platform's raw counts pooled back
  together, then run through the same formulas as `/metrics/overview`.
  This is mathematically identical to what `/metrics/overview` returns
  for the same client and period (verified by test) — a high-volume
  platform dominates the combined number in proportion to its response
  count. Intended for technical/debugging use where volume-weighting is
  expected.
- **`platformBalanced`** (the default) — the unweighted arithmetic mean
  of each included platform's own metric value, so a platform run 10
  times a month can't be drowned out by one run 200 times. Intended for
  executive reporting, where each platform's brand-visibility behavior
  should count equally regardless of how often it happens to be queried.

**What it means to the client:** different AI platforms can disagree
sharply on brand visibility (e.g. strong on Perplexity, weak on Claude);
a single pooled number can hide that. This endpoint makes per-platform
performance and sample size visible side by side, and makes explicit
which of the two legitimate ways of combining them was used for any
given number shown in a report.

**Known gap (deferred to a later Epic 5 slice, tracked on issue #29):**
this endpoint does not yet distinguish "platform doesn't support
citations at all" from "platform supports citations but wasn't cited" —
that requires the per-provider capability declarations proposed in issue
#3 Epic 1, which don't exist yet. Until then, a platform lacking citation
support will show a low Citation Frequency rather than "not applicable."

**Slice 2:** `GET /api/clients/:id/metrics/non-branded/by-platform`
applies the identical per-platform + dual-rollup pattern to the
non-branded panel metrics (Section 2.2's Mention Rate/Recommendation
Rate/Recommendation SoV over `brand_context = 'unbranded'` responses
only) instead of the four core live metrics — same `platforms` /
`combined.{responseWeighted,platformBalanced}` / `defaultRollup` shape,
same zero-response-platform exclusion rule, same
`responseWeighted`-matches-the-pooled-endpoint invariant (here, against
`GET .../metrics/non-branded`).

**Slice 3 (definitions locked 2026-07-31):** three genuinely new metrics,
added to both `GET .../metrics/non-branded` and its by-platform
counterpart, over the client brand only:

- **Strong Recommendation Rate** = `(strongly_recommended + first_choice
  effective-status responses) / nonBrandedResponses × 100` — a strict
  subset of the existing Recommendation Rate (which also counts plain
  `recommended`), so `strongRecommendationRate <= recommendationRate`
  always holds for the same period.
- **First Choice Rate** = `first_choice effective-status responses /
  nonBrandedResponses × 100`.
- **Rank distribution** (`rankDistribution`) - how the client ranks when
  it does appear in a numbered list, sourced from
  `response_recommendations.rank` (the classifier's already-computed
  min-position value, not re-derived from raw mention rows):
  - Denominator for `rank1Frequency`/`top3Frequency`/`unrankedFrequency`
    is `mentionedCount` (= the existing `mentionedNonBranded` count - all
    non-branded responses where the client brand was mentioned at all,
    since a `response_recommendations` row only exists for a brand that
    was actually mentioned - see Section 2.5).
  - `avgRank`/`medianRank` are computed only over the ranked subset
    (non-null `rank` values) - both are `null` when the client was never
    in a numbered list during the period, rather than a misleading 0.
  - On the by-platform route, `platformBalanced`'s `avgRank`/`medianRank`
    average only over platforms that had at least one ranked response
    (a platform with zero ranked mentions contributes no opinion on "how
    does the client rank when listed" rather than dragging the average
    toward a value it never earned).

**What it means to the client:** Recommendation Rate alone can't
distinguish "usually just listed as an option" from "usually the clear
top pick" - Strong Recommendation Rate and First Choice Rate make that
distinction explicit, and the rank distribution shows whether the client
tends to lead numbered lists or trail behind competitors when it does
appear in one.

**Slice 4 (definitions locked 2026-07-31):** three citation-based
metrics, added to `GET .../metrics/overview` and its by-platform
counterpart (not the non-branded family - citation trust/ownership isn't
scoped to unbranded prompts the way recommendation metrics are):

- **Trusted Third-Party Support Rate** = `responses with >= 1 trusted
  citation / totalResponses × 100` - response-level, same shape as every
  other `*Rate` metric and the same trust definition already used by the
  visibility score's T component (`industry_authority`/
  `local_authority`/`publisher_editorial` - see the Citation
  Classification section above).
- **Client-Owned Citation Rate** = `client-owned citations / total
  citations across all responses × 100` - a citation-level share, not a
  response-level rate. Deliberately distinct from the existing Citation
  Frequency (which already means "responses where the client domain is
  cited / total responses"): this instead answers "of every citation
  these responses returned, what fraction point back to the client's own
  site" - mirrors how AI SoV already relates to Mention Rate.
- **Competitor-Owned Citation Rate** = `competitor-owned citations /
  total citations × 100`, same citation-level share, scoped to any
  configured competitor brand.

**What it means to the client:** Citation Frequency tells you whether
the client was cited at all; these three tell you what kind of source
ecosystem is showing up alongside that citation - is the AI leaning on
trustworthy third parties, mostly linking back to the client's own site,
or frequently pointing at competitors instead.

### 2.3 Sentiment Classification

The sentiment classifier is rule-based (no AI model — fully auditable).

**Positive markers** (sample): best, trusted, leading, top, excellent, great, recommended, award-winning, professional, expert, reliable, outstanding

**Negative markers** (sample): poor, bad, expensive, overpriced, slow, disappointing, not ideal, avoid, unreliable, mediocre, worst, terrible

**Classification logic:**
- Both positive and negative markers present → **Mixed**
- Only positive → **Positive**, score = positive hits / total markers
- Only negative → **Negative**, score = -(negative hits / total markers)
- No markers → **Neutral**, confidence = 0.3

**Confidence scoring:**
```
Confidence = min(0.3 + (marker hits × 0.15), 1.0)
```

Items with confidence below 60% appear in the **Sentiment Review Queue** for manual verification.

**Facets detected:** trust, quality, price, expertise, speed, support

---

### 2.4 GA4 Traffic Data

The Traffic page fetches data live from the Google Analytics 4 Data API using the connected OAuth account. It is not cached — every page load queries GA4 directly.

**AI Search channel definition** — sessions are classified as AI-sourced when the `sessionSource` dimension matches any of:

| Platform | Referrer domain |
|---|---|
| Perplexity | perplexity.ai |
| ChatGPT | chatgpt.com |
| OpenAI Chat | chat.openai.com |
| Google Gemini | gemini.google.com |
| Microsoft Copilot | copilot.microsoft.com |
| Claude | claude.ai |

Metrics displayed: sessions, engagement rate, pages per session, conversion rate, referrer breakdown.

---

### 2.5 Recommendations Engine

The Recommendations page applies four rule-based checks to the collected data:

| Rule | Severity | Fires when |
|---|---|---|
| Missing on category | High | Client has zero mentions across all responses |
| Mentioned without citation | Medium | Client mentioned but domain never cited |
| Negative framing | High | More than 40% of sentiment scores are negative or mixed |
| Competitor authority advantage | Medium | Competitors have more citations than the client |

Each recommendation includes evidence (the data that triggered it) and a suggested action.

---

## Section 3: Prompt Collection Recommendations

### 3.1 Principles

- Write prompts exactly as a real user would type them — do not include your client's name unless it is a brand prompt
- The AI response is measured for whether it mentions your client unprompted
- Aim for 15–25 prompts per collection for meaningful trend data
- Organize prompts by category so you can filter results by type

### 3.2 Prompt Categories

**YLG intent taxonomy (added v1.31.0):** alongside the legacy category,
every prompt can now carry measurement metadata: an `intent_type` from the
canonical 8-type YLG taxonomy (`provider_recommendation`,
`service_specific`, `geographic_discovery`, `problem_solution`,
`comparison`, `trust_validation`, `brand_validation`, `alternative`), a
`brand_in_prompt` flag separating non-branded discovery from branded
validation, plus `service`, `prompt_family`, `commercial_value`, and
`measurement_purpose`. The `geo` field doubles as the YLG "location"
attribute. Existing prompts were backfilled from their category
(informational/commercial -> provider_recommendation, comparative ->
comparison, local -> geographic_discovery, problem_aware ->
problem_solution, alternative -> alternative); `brand_in_prompt` is left
unset until validated. The legacy categories below remain supported while
the UI migrates to intent types.

**Methodology v2.0 taxonomy expansion (schema only, v1.44.0):** issue #4
Phase 1 slice 1 adds a 9th intent type, `educational` (maps to legacy
category `informational`, same as `trust_validation`/`brand_validation`),
and a new `brand_context` field
(`unbranded`/`client_branded`/`competitor_branded`/`client_and_competitor`)
that will replace the boolean `brand_in_prompt` model. `brand_in_prompt`
only tracks whether the *client's own* brand appears, so a prompt naming
only a competitor is currently (incorrectly) counted as non-branded in
`aggregateNonBranded` — `brand_context` fixes that by giving
`unbranded` its own value, excluding competitor-seeded prompts. This slice
is schema/store plumbing only: the column exists and round-trips, but
nothing derives it yet (always `null` until a later slice adds
production backfill), the generator does not yet emit `educational`
prompts or brand context, and `aggregateNonBranded` still filters on
`brand_in_prompt`.

**Deterministic brand-context classifier (v1.45.0):**
`server/services/brandContext.ts` (`deriveBrandContext`,
`BRAND_CONTEXT_CLASSIFIER_VERSION = "rules-1.0"`) derives a prompt's
`brand_context` from its text plus the client's brand/competitor roster,
reusing `parser.ts`'s `matchesAlias` so mention detection and brand-context
derivation can never disagree about whether a brand appears in the same
text. Pure function, not yet wired into the `prompts` table's default write
path (manual prompt creation) — that's Phase 3 (Section I).

**Brand-context backfill (v1.46.0):** `POST /api/admin/brand-context/backfill`
(`super_admin`/`agency_admin` only) runs `backfillBrandContext`
(`server/services/brandContextBackfill.ts`), which re-derives every
prompt's `brand_context` client-by-client using `deriveBrandContext` and
each client's own brand/competitor roster — one client's brands never
leak into another's classification. Always recomputes (safe to re-run;
not gated on the column being unset), so it also fixes drift after a
brand/alias edit. This is an admin API route rather than a one-off
script because deploy packaging only ships `dist/`, `migrations/`, and
`package.json` — `script/` isn't included and `tsx` is a devDependency
unavailable in the production `npm install` (the same class of gap
fixed in v1.43.3's husky prepare-script bug), so a standalone script
would not be runnable on the server. Trigger once after deploying this
version to backfill the ~130 existing production prompts.

This is a
locked-methodology definition change, formalized as methodology v2.0 as
of v1.48.0 (see "Methodology versioning" and "Methodology v2.0" above).

**Generate with AI (updated v1.32.0):** generation now uses the 8-type
intent taxonomy and the client's core services and exclusions, treats all
client data as untrusted reference material, and can never target a
collection belonging to another client. Invalid candidates are reported
with reasons instead of silently disappearing, normalized exact
duplicates (within the batch and against the collection's existing
prompts) are rejected, and the review panel shows valid/rejected counts,
warnings (including "fewer than 80% of requested prompts were valid"),
each candidate's intent type, branded state, service, and location, and
the model's rationale. Saved candidates carry their measurement metadata
into the prompts table.

**Generate with AI: 9-type taxonomy + deterministic brand context
(v1.47.0):** the generation prompt now asks for the `educational` intent
alongside the original 8, and every candidate's `brandContext` (and the
derived `brandInPrompt` compatibility field) is computed by
`deriveBrandContext` from the candidate's actual text plus the client's
brand/competitor names — the LLM's own `brandInPrompt` claim in its JSON
response is still requested (kept for schema shape/prompting stability)
but is no longer trusted for the persisted value (issue #4 Problem #2:
previously a prompt naming only a competitor and a genuinely unbranded
discovery prompt both collapsed into `brandInPrompt=false`, indistinguishable
in metrics). `GeneratedPromptCandidate` gained a `brandContext` field;
`PromptCollectionDetail.tsx`'s existing candidate-to-payload mapping
(`toPayload`, a `...rest` spread) picks it up automatically with no UI
change, so saved AI-generated prompts get a real `brandContext` from this
version on. Known limitation: derivation at generation time uses
canonical brand/competitor names only, not configured aliases (the
generator's `GenerationContext` doesn't carry alias rows) — full
alias-awareness exists in the backfill/classifier
(`server/services/brandContext.ts`) for scraped response text.

**Generate with AI: deterministic geo/service checks (v1.51.0, issue #4
Phase 2 item 6):** the LLM is asked to only reference the client's
approved geographies and core services, but nothing verified that
server-side (issue #4 Problem #4). Each candidate's `location`/`service`
is now checked against the client's configured `geographies`/
`coreServices` lists (`server/services/promptMetadataValidation.ts`,
case-insensitive exact match) and populates a new `warnings: string[]`
field — this **flags, does not reject**, since a mismatch may be a
legitimately new geography/service the client list hasn't caught up
with yet. The review panel shows each candidate's warnings next to its
rationale; `warnings` is display-only provenance and is stripped before
the bulk-import payload, same as `rationale`. Empty candidate geo/service
never warns (not every prompt is scoped); an empty configured list
legitimately warns on any candidate that specifies a value.

**Generate with AI: semantic near-duplicate rejection (v1.52.0, issue #4
Phase 2 item 7):** normalized exact matching only catches punctuation/
case/whitespace variants of the same wording. A second-stage check
(`server/services/nearDuplicate.ts`, token/Jaccard similarity, default
threshold 0.75) now also rejects differently-worded prompts asking the
same measurement question (e.g. "Who are the best plumbers in Seattle?"
vs "Which plumbers in Seattle are the best?"), checked against both
existing collection prompts and the in-batch pool - same `invalid`-array
treatment as exact duplicates, with the similarity percentage in the
reason. First-pass heuristic per issue #4's own framing ("may use
token/Jaccard similarity"): plain lowercased tokens with a small
stopword list, no stemming, so related word forms (e.g. "roofers" vs
"roofing") are not merged and won't always be caught - a known,
documented limitation, not a bug.

**Generate with AI: duplicate measurement-cell rejection (v1.53.0, issue
#4 Phase 2 item 7, second half):** two prompts can dodge both the exact
and near-duplicate text checks yet still measure the exact same thing -
the same `intentType + service + geography + brandContext` combination
is the same measurement question regardless of phrasing
(`server/services/measurementCell.ts`, case-insensitive exact field
match). Checked against the in-batch pool unconditionally (candidates
already carry their own metadata, no extra data needed) and, opt-in,
against the collection's existing prompts via `existingPromptCells` -
the route (`server/routes/prompts.ts`) excludes unclassified existing
prompts (null `intentType`/`brandContext`) from that list, since an
"unclassified" cell isn't a real measurement question to collide with.
Same `invalid`-array rejection treatment as the other duplicate checks.

**Metadata revalidation on save (v1.54.0, issue #4 Phase 2 item 8):** an
analyst can edit a candidate's text in the review panel (or type a
manual prompt), but `intentType`/`service`/`geo` have no deterministic
re-derivation from freeform text - only `brandContext`/`brandInPrompt`
does (the same `deriveBrandContext` used at generation time). Both
prompt-save endpoints (`POST /api/prompt-collections/:id/prompts` and
`.../prompts/bulk`) now recompute `brandContext`/`brandInPrompt` from
the actually-submitted `text` and **always override** whatever the
client sent - closes the bug for edited AI candidates and manual entries
alike, not just the narrow generation-time case. For the fields that
can't be auto-fixed, the review panel tracks each candidate's
as-generated text and shows a warning once it's edited ("Text edited -
intent/service/geo classification may no longer match") - informational
only, does not block save.

**Panel types (v1.55.0, issue #4 Phase 3 item 9, slice 1):** a collection's
`panel_type` (`prompt_collections.panel_type`, default `balanced_baseline`,
editable from the Prompt Collections list page, shown read-only on the
collection detail page) selects which server-owned intent/brand-context
distribution `Generate with AI` targets, replacing the single implicit
80/20-ish mix every collection used before this version:

| Panel type | Composition | Brand constraint |
|---|---|---|
| `balanced_baseline` | Today's default 9-intent mix (same ratios as `METHODOLOGY_V2_QUOTAS`) | 80% unbranded / 20% branded (soft target) |
| `discovery` | problem_solution/provider_recommendation/service_specific/geographic_discovery/educational/trust_validation | Unbranded only - client and competitor names prohibited |
| `entity_audit` | brand_validation/trust_validation/provider_recommendation | Client-branded only |
| `competitive` | comparison/alternative/brand_validation | Competitor-branded only |
| `topic_authority` | educational/problem_solution/trust_validation | Unbranded only |
| `local_commercial` | geographic_discovery/service_specific/provider_recommendation/problem_solution | 80% unbranded / 20% branded (soft target) |

Distributions are stored as **ratios**, not fixed prompt totals
(`server/services/panelTypeQuotas.ts`, `PANEL_TYPE_QUOTAS`) - `resolvePanelTypeQuotas(panelType, count)`
resolves them against whatever count the analyst actually requests via
`Generate with AI` (largest-remainder rounding, so per-intent counts
always sum exactly to `count`). This deliberately differs from
`prompt_methodologies`, which stores a fixed `panelSize`: panel type is
generation *composition*, methodology version is measurement
*definition* - orthogonal concepts (see "Methodology versioning" above),
and tying panel-type quotas to a fixed size would silently mismatch any
requested count other than that one number.

`buildGenerationPrompt` now states the resolved exact per-intent counts
to the LLM instead of "distributed across these 9 intent types" alone,
and for the three hard-constraint panel types (`discovery`,
`entity_audit`, `competitive`, `topic_authority` is unbranded but not
listed as a *naming* constraint the same way) adds an explicit
per-prompt instruction (e.g. "Every prompt must not name the client, any
competitor, or any other specific business by name"). `balanced_baseline`
and `local_commercial` keep the original soft "about 80%/20%" guidance
since their brand mix is a target, not a per-prompt rule.

**Panel-type quota enforcement (v1.56.0, issue #4 Phase 3 item 9, slice
2):** closes issue #4 Section D, which was scoped as Phase 1 item 5 but
never actually delivered - Phase 1 slice 6 (v1.48.0) only versioned the
quota *record*, `promptGenerator.ts` never validated a generation's
output against it. Two enforcement layers now run inside
`parseGeneratedPrompts`:

1. **Hard brand-constraint rejection** - for `discovery`/`entity_audit`/
   `competitive`/`topic_authority` (any constraint other than
   `baseline_mix`), a candidate whose derived `brandContext` doesn't
   satisfy the panel's constraint is **rejected** (added to `invalid`,
   not just warned) - e.g. a client-branded candidate under a `discovery`
   panel. `baseline_mix` (`balanced_baseline`/`local_commercial`) never
   rejects on brand context alone since it's a soft target.
2. **One automatic retry for missing quota cells** - after the first
   response is parsed, `computeQuotaShortfall` (`server/services/
   panelTypeQuotas.ts`) compares the accepted candidates' intent
   distribution against the collection's resolved quotas. If any cell is
   short, `generatePrompts` issues exactly one more adapter call via
   `buildRetryGenerationPrompt` (client context + brand constraint
   restated, but the distribution instruction lists only the missing
   intent cells and their exact remaining counts), passing round 1's
   accepted candidates as additional `existingPromptTexts`/
   `existingPromptCells` so the retry can't duplicate them. Results from
   both rounds are merged and the final `quotaShortfall` is recomputed
   against the *original* resolved quotas (the retry's own internal
   shortfall, resolved against a different count, is discarded - only
   its candidates/invalid/warnings are kept). No further retries after
   that: a persistent shortfall is returned as `GenerationResult.
   quotaShortfall` for the caller to surface, not retried indefinitely.

`GenerationResult` gained `quotaShortfall: Partial<Record<PromptIntentType,
number>>` (empty object = fully satisfied). Nothing yet **blocks** save or
activation on a non-empty shortfall - that's Phase 3 item 12 (slice 5,
methodology summary + activation gates); slice 2 only computes and
surfaces it. Also fixed in this slice: `generatePrompts` was never
actually passing the collection's `panelType` through to
`parseGeneratedPrompts` (a wiring gap left over from slice 1), so quota
resolution would have silently always used `balanced_baseline`
regardless of the collection's real panel type.

**Canonical intent primary in the UI (v1.57.0, issue #4 Phase 3 item H):**
the review panel (`Generate with AI` candidates) and the existing-prompt
edit form both used to make legacy `category` the primary editable field,
with `intentType` shown as a read-only badge - backwards from where the
richer measurement metadata actually lives. Both now make `intentType`
the primary editable `<select>`; legacy category is a derived, non-
editable "Legacy: X" label computed from whichever intent is currently
selected via a new shared lookup, `INTENT_TO_LEGACY_CATEGORY` (moved from
`promptGenerator.ts` into `shared/schema.ts` so client and server can
never derive it differently). `brandContext` is now shown (as a badge,
using the app's established "Non-branded"/"Client-branded"/"Competitor-
branded"/"Client + competitor" labels) in both places, but stays read-
only - it's deterministically recomputed from text at save time
regardless of what's displayed (v1.54.0), so letting an analyst hand-edit
it would only ever be silently overwritten. `service`, `geo`, and
`funnelStage` become editable in both the review panel and the edit form
(previously read-only text in the review panel and not exposed at all in
the edit form); the edit form also gained a `priority` control (reusing
the existing, previously-unsurfaced `priorityWeight` column). Manual
prompt creation is intentionally out of scope here - upgrading that form
to the same canonical fields is issue #4 Phase 3 item I (slice 4).

**Manual prompt creation upgrade (v1.58.0, issue #4 Phase 3 item I):** the
"Add prompt" form used to capture only text/category/geo - the only path
into `prompts` that didn't produce a measurement-ready record. It now
captures the same canonical fields as the review panel and edit form:
`intentType` (primary, replacing `category`), `service`, `geo`,
`funnelStage`, and `priority` (`priorityWeight`). `brandContext` is not
collected here either - like every other write path since v1.54.0, it's
always derived server-side from the submitted text.

`category` itself is no longer required input anywhere: `insertPromptSchema.category`
gained a default (`"informational"`), and a new `withDerivedCategory`
helper (`server/routes/prompts.ts`) overrides it with
`INTENT_TO_LEGACY_CATEGORY[intentType]` whenever `intentType` is present
- applied at all three prompt-write endpoints (`POST .../prompts`,
`POST .../prompts/bulk`, `PATCH /api/prompts/:id`), the same "never trust
the client for a derived field" precedent `brandContext` already
established. Callers that don't supply `intentType` (older clients, or a
still-unclassified prompt) keep sending `category` directly - fully
backward compatible.

**TD-26 CLOSED:** `PATCH /api/prompts/:id` now recomputes `brandContext`/
`brandInPrompt` from the edited `text` too, via the same
`resolveBrandInputs` + `deriveBrandContext` wiring the two prompt-
*creation* endpoints already had since v1.54.0. The handler first loads
the existing prompt (new `PromptStore.get`) to resolve its
`collectionId` for brand lookup, then always overrides any
client-supplied `brandContext`/`brandInPrompt` from the actual submitted
text - never trusting the client, same precedent as the creation
endpoints. Editing an existing prompt's text via the pencil icon can no
longer leave a stale `brandContext` behind.

**Methodology summary + activation gate (v1.59.0, issue #4 Phase 3 item
J) - Phase 3 CLOSES with this slice.** A collection's persisted prompts
had no pre-activation review beyond "at least one prompt exists" (the
`Activate` button was only ever disabled on an empty collection).
`computeCollectionDiagnostics` (`server/services/collectionDiagnostics.ts`,
pure function) now summarizes the whole stored set:

- `promptCount`, `intentDistribution`/`brandContextDistribution` (null
  values bucketed as `"unclassified"` - legacy data or prompts saved
  before intent/brand classification existed), `funnelStageDistribution`
- `geoCoverage`/`serviceCoverage` - distinct non-null values configured
- `duplicateGroups` - normalized-exact-duplicate prompt texts, grouped
  (reuses `normalizePromptText`, retroactively applied across the whole
  collection rather than just one generation batch)
- `nearDuplicatePairs` - every pair not already an exact duplicate whose
  Jaccard similarity clears the same 0.75 threshold used at generation
  time (`server/services/nearDuplicate.ts`)
- `quotaShortfall` - `resolvePanelTypeQuotas(panelType, promptCount)` then
  `computeQuotaShortfall` against classified prompts only (same slice-2
  resolver, now applied to a whole collection instead of one generation
  batch) - **the only diagnostic that blocks activation**, a decision
  locked with the user 2026-07-29. Every other diagnostic here (coverage,
  duplicates, near-duplicates) is informational only, shown on the new
  `GET /api/prompt-collections/:id/diagnostics` endpoint and the
  "Methodology summary" panel on the collection detail page, but does not
  block `POST /api/prompt-collections/:id/activate` (409 `QUOTA_NOT_MET`
  when `quotaShortfall` is non-empty).

**Known gap, not addressed by this slice:** "changed prompts requiring
revalidation" (one of the diagnostics the issue's Section J proposal
lists) is not computable from the current schema - nothing persists an
AI-generated prompt's original as-generated text once saved (only the
in-session review-panel `Candidate.originalText`, discarded on save), so
there's no server-side signal to detect "this saved prompt's text was
edited from its generated original." Would need either a persisted
snapshot column or a broader provenance-diffing mechanism; out of scope
here, not tracked as a numbered tech debt item since it was never built
rather than having regressed.

**Normalization refactor (same slice):** `normalizePromptText` moved
from `promptGenerator.ts` to `nearDuplicate.ts` (both text-normalization/
duplicate-detection concerns) so `collectionDiagnostics.ts` doesn't have
to import `promptGenerator.ts` - several existing test files mock that
module wholesale (to avoid invoking real LLM adapters), which was
silently dropping unrelated pure-function exports like
`normalizePromptText` for any other code importing from the same module
path during those tests.

**Phrasing / context-richness scoring (v1.60.0, issue #27).** The three
other audit dimensions from `docs/Feature-Request-AI-Prompt-Audit.md`
(intent diversity, branded/unbranded bias, geographic granularity) were
already covered by `intentType`, `brandContext`, `geo`, and the
methodology-summary diagnostics above; this closes the fourth: whether a
prompt reads like a natural, persona-rich question a real user would ask
("I'm planning a 200-person outdoor wedding in San Francisco. How many
portable restrooms do I need?") versus a bare keyword phrase pasted into
a list ("Portable restroom rental in San Francisco"). AI answer engines
respond to natural language and situational context, not keywords - a
collection padded with keyword-style prompts produces less
representative measurement data.

`scorePhrasingRichness` (`server/services/phrasingRichness.ts`, pure
function, no LLM cost - a deterministic-heuristics vs. LLM-as-judge
design decision locked with the user 2026-07-30) classifies each
prompt's text as `context_rich` or `keyword_style` by counting three
signals and requiring at least 2 of 3:

1. Word count >= 8
2. Question-form or first-person phrasing - contains `?`, opens with a
   question word (who/what/when/where/why/how/which/can/does/do/is/are),
   or contains a first-person marker (`I'm`, `I am`, `I need`, `my `,
   `we're`, `we need`)
3. A contextual qualifier - budget/cost/price, event-type words
   (wedding/event/party), quantity phrasing (`how many`, `N-person`,
   `N guests`), or a timeframe word (today/tomorrow/weekend/deadline/
   date/asap/urgent)

`computeCollectionDiagnostics` aggregates this per prompt into
`phrasingDistribution: Partial<Record<"context_rich" | "keyword_style",
number>>`, shown as one more line on the "Methodology summary" panel.
Informational only, same warn-don't-block precedent as every other
diagnostic here besides `quotaShortfall` - does not affect activation.

The portal supports seven prompt categories. Use each to cover different stages of the buyer journey.

**Category prompts** — broad discovery queries
- `"best SEO agency in Seattle"`
- `"top digital marketing company for small businesses"`
- `"leading local SEO firms in the Pacific Northwest"`

**Problem prompts** — pain-point searches
- `"how to improve Google Maps ranking for a local business"`
- `"why is my website not showing up in local search"`
- `"what does an SEO audit include"`

**Comparison prompts** — side-by-side queries (include competitor names)
- `"[Competitor] vs [Client] for local SEO"`
- `"best alternatives to [Competitor] for agency SEO"`

**Alternative prompts** — users seeking options beyond a known brand
- `"[Competitor] alternatives for small business SEO"`
- `"agencies like [Competitor] in Seattle"`

**Brand prompts** — direct brand queries (include client name)
- `"is [Client Name] good for restaurant SEO"`
- `"[Client Name] pricing and services"`
- `"who are [Client Name]'s main clients"`

**Reputation prompts** — trust and review searches (include client name)
- `"[Client Name] reviews"`
- `"is [Client Name] trustworthy"`
- `"[Client Name] case studies"`

**Local prompts** — geography-specific (use the geo field in the portal)
- `"best SEO agency near Bothell WA"`
- `"local SEO services in Bellevue"`
- `"digital marketing companies in Kirkland"`

### 3.3 Run Cadence

| Cadence | When to use |
|---|---|
| Monthly | Standard ongoing tracking for most clients |
| Weekly | After a major content push, PR event, or site relaunch |
| Ad-hoc | After a reputation event, competitor launch, or algorithm update |

### 3.4 Interpreting Results

**High mention rate, low citation frequency:**
The AI mentions your client by name but does not link to the website. Priority: strengthen entity signals — more authoritative third-party citations, schema markup, consistent NAP data.

**Low mention rate overall:**
The client is not appearing in AI answers at all. Priority: create category-definition content and comparison pages; pursue third-party coverage on authoritative domains.

**Negative framing:**
The AI describes the client negatively (pricing, reliability, reviews). Priority: audit reputation inputs — review platforms, outdated pages, negative press that AI platforms may be training on.

### 3.5 Prompt Template Tokens

Prompt text can include the following tokens. They are substituted at run time
(both manual "Run Now" and scheduled runs) — the stored prompt text keeps the
literal token, only the query sent to the AI platform is expanded.

| Token | Resolves to |
|---|---|
| `{{brand}}` | The client's primary brand name (the brand record with kind "client"; falls back to the client's name if none is configured) |
| `{{competitor}}` | Each configured competitor brand's canonical name. A prompt containing `{{competitor}}` **fans out into one response per competitor** — e.g. with 3 competitors configured, one prompt becomes 3 responses, each querying a different competitor name. If no competitors are configured, the token resolves to an empty string and the prompt still runs once. |
| `{{city}}` / `{{geo}}` | The prompt's own Geography field if set, otherwise the client's first configured geography. Resolves to an empty string if neither is set. Both tokens resolve to the same value. |

**Example:**
A prompt `"Alternatives to {{competitor}} for local SEO"` with competitors
"Globex Plumbing" and "Initech Plumbing" configured produces two responses:
- `"Alternatives to Globex Plumbing for local SEO"`
- `"Alternatives to Initech Plumbing for local SEO"`

This is the recommended way to write **Comparison** and **Alternative** prompts
(Section 3.2) without needing to manually duplicate prompts per competitor.

**Competitor citation advantage:**
Competitors are cited more often than the client. Priority: identify which domains cite competitors and pursue mentions or guest content there.

**High visibility score but low conversion via GA4:**
The client appears prominently in AI answers but AI traffic does not convert. Priority: review landing page experience for AI-sourced visitors; consider UTM tracking and dedicated landing pages.

---

## Section 4: Workflow Catalog

The original portal feature. The workflow catalog stores repeatable agency processes as prompt templates with:
- Required input fields (e.g. Website URL, GBP link)
- A configured launch URL (Perplexity by default)
- Category tags for filtering
- Pin support for high-frequency workflows

Workflows are created and managed by Agency Admins. They are visible to all authenticated users. Use the search bar to filter by name, description, input, or tag.

---

*Workflow Portal — Internal Agency Documentation*
*Rank Rocket Co © 2026 — All Rights Reserved*
