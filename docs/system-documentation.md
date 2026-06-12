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
- Enable the Google Analytics Data API in the same project
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
- After connecting, enter the numeric Property ID (found in GA4 → Admin → Property Settings → Property ID — this is a plain number, NOT the G-XXXXXXXX Measurement ID)

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
After the run completes, data appears in Overview, Mentions, Share of Voice, and Sentiment. If you added brands/aliases after a run, open the run and click **Re-parse responses** to re-scan the existing AI responses against the updated brand definitions.

---

## Section 2: Data Sources and Formulas

Every metric in the portal traces back to raw AI response text stored in the database. Nothing is estimated or sampled.

### 2.1 How Responses Are Collected

When a run is triggered:
1. Each prompt is sent to the Perplexity Sonar API verbatim — no client context is injected
2. The full response text and ordered citation URLs are stored in `responses_raw`
3. The **parse-response** job scans the response text for brand aliases (exact, fuzzy, and regex matching)
4. Detected mentions are stored in `response_mentions` with position, section, and evidence text
5. Detected citations are stored in `response_citations` with URL, root domain, and ownership
6. The **sentiment-classify** job applies a rule-based lexicon to score each mention
7. The **aggregate-snapshot-daily** job recomputes lifetime cumulative totals (citation count,
   mention count, all-brand mentions, visibility score sum, response count) from every
   completed response and stores them in `metric_snapshots_daily` as of today's date.
   Overview/trend reports for a given period (30d/90d/365d) derive their totals as the
   **delta** between the latest snapshot at or before the period end and the latest
   snapshot before the period start — not a sum of every snapshot row in the period
   (fixed in v1.4.1; summing previously double-counted clients with snapshot history
   spanning multiple dates).

---

### 2.2 Metric Definitions and Formulas

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
on the client record. Period totals come from `metric_snapshots_daily.mention_count` /
`.all_brand_mentions`.

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
