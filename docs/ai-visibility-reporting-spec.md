# AI Visibility Reporting Module Specification

## Overview

This specification defines an AI visibility reporting module for an agency portal that measures how a client brand appears across AI-generated answers and turns those findings into recurring audit and reporting outputs. The module is designed around prompt-based testing, response parsing, citation analysis, entity detection, sentiment scoring, and competitive benchmarking rather than traditional keyword ranking alone.[cite:10]

The product goal is to let an agency run scheduled AI visibility audits for each client, compare the client against selected competitors, and publish clear trends and recommendations inside the agency portal. The methodology should come before tooling, with consistent prompt sets, repeatable scoring, and time-series reporting as the foundation.[cite:10]

## Objectives

The module should support four core reporting dimensions: AI citation frequency, AI share of voice, sentiment in AI responses, and prompt-based rankings.[cite:10]

It should also support companion business metrics such as AI referral traffic, engagement, and conversion influence, because visibility without downstream impact is incomplete for agency reporting.[cite:10]

Primary outcomes:
- Provide a client-facing AI Visibility Report inside the portal.[cite:10]
- Add a defensible GEO/AEO measurement layer to existing SEO and audit workflows.[cite:10]
- Identify content, authority, and reputation gaps based on prompt-level outcomes and cited sources.[cite:10]
- Enable recurring benchmarking across brands, service lines, geographies, and AI platforms.[cite:10]

## Product Scope

### In scope

- Client setup, brand aliases, domains, business metadata, geography, and competitor management.[cite:10]
- Prompt library management with reusable prompt sets for category, problem, comparison, local, brand, and reputation prompts.[cite:10]
- Prompt execution across supported AI platforms, beginning with Perplexity and expanding to other platforms later.[cite:10]
- Response capture, mention detection, citation extraction, citation position scoring, and sentiment analysis.[cite:10]
- Trend dashboards, audit pages, exports, alerts, and recommendation generation.[cite:10]
- GA4 integration for AI referral traffic channel grouping and performance stitching.[cite:10]

### Out of scope for MVP

- Fully autonomous content creation based on findings.
- Cross-client global benchmarking marketplace.
- Billing automation for consumption-based pricing.
- Real-time crawl infrastructure at enterprise scale.

## Users and Jobs

### Primary users

- Agency strategist: defines prompt sets, reviews trends, and turns results into strategy.[cite:10]
- Account manager: shares reports, annotations, and executive summaries with clients.[cite:10]
- Analyst: validates edge cases, tunes prompts, and investigates anomalies.[cite:10]
- Client stakeholder: views visibility, competitors, and recommendations in a clean report.[cite:10]

### Jobs to be done

- Determine whether a client brand is cited or mentioned in tracked AI answers.[cite:10]
- Measure how often competitors appear instead.[cite:10]
- Understand whether the client is described positively, neutrally, or negatively.[cite:10]
- See which prompts, pages, and source domains drive the strongest AI visibility.[cite:10]
- Turn findings into concrete recommendations for content, entity building, and reputation work.[cite:10]

## Functional Requirements

### 1. Client and entity setup

The system must allow creation of a client record with the following fields:
- Client name
- Primary domain
- Brand aliases and common misspellings
- Products and services
- Target geographies
- Primary competitors
- Excluded entities to reduce false positives
- Report owner and portal permissions

The entity model must support alias-based detection because brands can be mentioned without exact-match citations, and mention rate is a key GEO measurement layer.[cite:10]

### 2. Prompt library

The system must support reusable prompt collections with versioning. A consistent prompt set is required to produce comparable trends over time.[cite:10]

Prompt categories should include:
- Category prompts, for example “best HVAC company in Seattle” or “top personal injury lawyers Miami.”[cite:10]
- Problem prompts, for example “how to fix low website leads for local businesses.”[cite:10]
- Comparison prompts, for example “[competitor] vs [client].”[cite:10]
- Alternative prompts, for example “[competitor] alternatives.”[cite:10]
- Brand prompts, for example “is [brand] good for [use case].”[cite:10]
- Reputation prompts, for example “reviews of [brand]” or “is [brand] trustworthy.”
- Local prompts, for example “best [service] near Bothell” or “[service] in Bellevue.”

Each prompt must store:
- Prompt text
- Prompt type
- Funnel stage
- Geo modifier
- Device/context tag if used
- Target platform coverage
- Priority weight
- Status, draft or active
- Version number

### 3. Prompt execution engine

The platform must support scheduled prompt runs by client, prompt collection, date, and AI platform. The manual framework described in current GEO guidance uses 20–30 queries across multiple platforms on a recurring schedule, and that same repeatable structure should inform the automated implementation.[cite:10]

Requirements:
- Queue prompt runs by batch
- Support platform adapters, starting with Perplexity-first implementation
- Store exact query text submitted
- Store locale, geography, time, and run metadata
- Retry failed runs with error logging
- Support recurring schedules, weekly and monthly minimum
- Support ad-hoc reruns after content updates or reputation events

### 4. Response capture and normalization

Each prompt run must store the full answer payload needed for downstream scoring.

Capture fields:
- Raw answer text
- Structured answer blocks if available
- Ordered citations/links
- Citation domains and URLs
- Detected answer summary block
- Timestamp
- Platform name and model variant if available
- Screenshot or rendered snapshot if feasible in later phases

The system should preserve raw responses because citation position and answer framing matter, not just whether a link exists.[cite:10]

### 5. Mention and citation analysis

The parser must detect:
- Direct citations to the client domain
- Mentions of the client brand without citation
- Mentions and citations of competitors
- Citation position, such as first, second, third, and later positions
- Whether the client appears in the opening summary or top recommendation block
- Which internal client URL was cited

Core visibility KPIs should include citation frequency, mention rate, AI share of voice, and citation position because these are the foundational visibility metrics in current GEO measurement frameworks.[cite:10]

### 6. Sentiment analysis

The system must score how the AI response characterizes the client brand in context. Sentiment should not be treated as a simple generic NLP label because the relevant question is how the brand is framed in answer context, including trust, quality, price, reliability, and suitability.

Requirements:
- Brand-level sentiment classification: positive, neutral, negative, mixed
- Confidence score
- Evidence spans, the exact response text behind the classification
- Topic facets, such as trust, quality, price, service, expertise, reputation
- Human review queue for low-confidence or high-stakes accounts

### 7. Prompt-based rankings

The system must convert prompt-level appearance into a weighted ranking model. Current GEO guidance recommends tracking not only whether a brand appears but where it appears in the answer, because first citation and early answer placement carry more value.[cite:10]

Suggested weighting model:
- Mentioned anywhere in answer: 1 point
- Mentioned in opening summary: 2 additional points
- First recommended brand: 3 additional points
- Direct client-domain citation: 2 additional points
- Trusted third-party supporting citation: 1 additional point
- Negative framing flag: separate quality penalty or warning layer

The scoring model should remain configurable by agency admins.

### 8. AI share of voice

AI Share of Voice should be calculated as client mentions divided by all tracked brand mentions across the same prompt universe.[cite:10]

Recommended formula:

\[
\text{AI Share of Voice} = \frac{\text{Client Mentions}}{\text{All Brand Mentions Across Tracked Responses}} \times 100
\]

The module should support share of voice views by:
- Client overall
- Competitor set
- Prompt category
- Geography
- Platform
- Time period

### 9. Source and citation domain analysis

The system should identify which domains the AI platform cites when discussing the client, its category, and its competitors. This adds a strategic layer by revealing where authority is being borrowed from and which third-party sources influence visibility.[cite:10]

Outputs:
- Top cited domains overall
- Top domains citing or referencing the client
- Client-owned vs third-party source mix
- Competitor source overlap
- Missing-domain opportunities

### 10. Traffic and business impact stitching

Current GEO measurement guidance recommends extending visibility metrics into traffic, engagement, and business impact layers rather than stopping at mentions alone.[cite:10]

The module should integrate with analytics and CRM data where available:
- GA4 AI referral sessions
- Engagement rate for AI traffic
- Pages per session for AI traffic
- AI conversion rate
- Branded search lift proxy
- Leads and pipeline influenced by AI-sourced sessions or self-reported attribution

GA4 requirements:
- Custom channel group for AI Search
- Referrer matching for perplexity.ai, chatgpt.com, chat.openai.com, gemini.google.com, copilot.microsoft.com, claude.ai, and similar sources where applicable.[cite:10]
- UTM-aware capture when the platform includes AI-source parameters.[cite:10]

### 11. Reporting and exports

The module must produce both portal-native dashboards and exportable artifacts.

Required outputs:
- Client dashboard view
- Executive summary report
- Analyst detail report
- CSV export for prompts, citations, mentions, and scoring
- PDF report for client delivery
- Branded share link for portal access

Default report sections:
- Visibility summary
- Citation frequency trends
- Mention rate trends
- AI share of voice trends
- Sentiment summary and drivers
- Prompt winners and losers
- Competitor gap analysis
- Top cited URLs and domains
- AI traffic and conversion layer
- Recommended actions

## Non-Functional Requirements

### Performance

- Process scheduled runs reliably at agency scale.
- Support queue-based execution and retries.
- Render client dashboards quickly for the last 30, 90, and 365 days.

### Accuracy

- Alias matching must reduce false negatives.
- Exclusion lists must reduce false positives from ambiguous brand names.
- Sentiment must surface evidence text and confidence to aid QA.

### Auditability

- Every metric must trace back to raw prompt runs and captured responses.
- Scoring changes must be versioned so historic reports remain reproducible.

### Security

- Role-based access at agency, team, and client level.
- Secure storage of API credentials and integration tokens.
- Full logging of report generation and data refresh events.

## Data Model

Recommended core tables:

| Table | Purpose |
|---|---|
| `clients` | Client account and portal settings |
| `brands` | Canonical brand entity records |
| `brand_aliases` | Alternate names, abbreviations, and misspellings |
| `competitors` | Client-specific competitor entities |
| `prompt_collections` | Versioned prompt sets by client or template |
| `prompts` | Individual prompts and metadata |
| `platforms` | Supported AI engines and adapter config |
| `prompt_runs` | Batch and single execution records |
| `responses_raw` | Raw answer payloads and metadata |
| `response_mentions` | Detected entity mentions and positions |
| `response_citations` | Extracted URLs, domains, and positions |
| `response_sentiment` | Brand-level sentiment results with evidence |
| `metric_snapshots_daily` | Daily or run-level aggregates |
| `report_exports` | Generated report metadata and files |
| `annotations` | Analyst notes and client-facing commentary |
| `integrations` | GA4, CRM, Search Console, and future connectors |

### Example schema notes

- `brand_aliases` should support match type, exact, fuzzy, regex, and language variant.
- `response_mentions` should store canonical brand id, matched text, confidence, section position, and recommendation rank.
- `response_citations` should store URL, root domain, owned-vs-third-party flag, and citation order.
- `metric_snapshots_daily` should store both raw counts and normalized percentage metrics.

## Scoring Framework

### Core formulas

**Citation Frequency**

\[
\text{Citation Frequency} = \frac{\text{Prompt Responses Where Client Is Cited}}{\text{Total Prompt Responses}} \times 100
\]

**Mention Rate**

\[
\text{Mention Rate} = \frac{\text{Prompt Responses Where Client Is Mentioned or Cited}}{\text{Total Prompt Responses}} \times 100
\]

**AI Share of Voice**

\[
\text{AI SoV} = \frac{\text{Client Mentions}}{\text{All Brand Mentions}} \times 100
\]

**Prompt Visibility Score**

\[
\text{Prompt Visibility Score} = M + S + R + C + T
\]

Where:
- \(M\) = mention-present score
- \(S\) = summary-block score
- \(R\) = recommendation-rank score
- \(C\) = client-domain citation score
- \(T\) = trusted-third-party support score

### Sentiment scoring

Sentiment should use a hybrid approach:
- Rule layer for explicit phrases like “best,” “trusted,” “poor reviews,” “expensive,” or “not ideal.”
- Model-assisted classification for contextual framing.
- Human review threshold for low-confidence cases.

Recommended sentiment outputs:
- `sentiment_label`
- `sentiment_score` from -1 to +1
- `confidence_score` from 0 to 1
- `evidence_excerpt`
- `facet_labels` such as trust, quality, speed, expertise, price, support

## Workflow Design

### Monthly workflow

1. Strategist selects client and prompt collection.
2. Scheduler runs the prompt set across configured AI platforms.
3. Parser extracts raw responses, mentions, citations, and positions.
4. Sentiment engine scores client and competitor framing.
5. Metrics engine writes aggregate snapshots.
6. Reporting layer generates dashboard updates and exports.
7. Analyst reviews anomalies and publishes commentary.

A recurring monthly audit cadence aligns with current manual GEO tracking guidance and creates stable trend lines without excessive operational overhead.[cite:10]

### Ad-hoc workflow

Use ad-hoc reruns after:
- Launch of a new service page
- Major content refresh
- PR or reputation event
- Review spike or legal issue
- Competitor launch or acquisition

## UI and UX Specification

This module should be designed as a portal-native analytics web application.

### Navigation

Primary navigation:
- Overview
- Prompt Sets
- Runs
- Mentions
- Share of Voice
- Sentiment
- Sources
- Traffic Impact
- Reports
- Settings

### Overview dashboard

Show:
- Citation Frequency
- Mention Rate
- AI Share of Voice
- Positive Sentiment Rate
- Top competitor vs client delta
- AI referral sessions
- Top gaining and losing prompt clusters

### Prompt detail screen

For each prompt, display:
- Prompt text
- Platform and run date
- Client appearance status
- Competitors mentioned
- Citation order
- Raw answer excerpt
- Sentiment summary
- Cited URLs and domains
- Analyst note field

### Report view

The default client report should have two layers:
- Executive mode for account managers and stakeholders
- Analyst mode for methodology, evidence, and prompt-level detail

## Recommendations Engine

The reporting layer should generate prioritized recommendations based on detected gaps.

Examples:
- Missing on category prompts -> create category definition and comparison content.
- Mentioned without citation -> strengthen entity consistency, source references, and structured answer blocks.[cite:10]
- Negative framing -> review reputation inputs, testimonials, review management, and outdated pages.
- Low SoV in one geography -> build local service pages and supporting citations.
- Competitor sourced from stronger third-party references -> pursue authoritative mentions and data-backed content.

## Integrations

### MVP integrations

- Perplexity-focused prompt execution path
- GA4 for AI Search channel measurement
- Search Console for branded search lift proxy
- Internal portal auth and client management

### Phase 2 integrations

- ChatGPT-compatible prompt testing where permitted
- Gemini and Copilot adapters
- CRM systems for lead and pipeline stitching
- Email or Slack alerts for major deltas

## Roles and Permissions

Required roles:
- Super admin: platform settings, scoring rules, integrations, templates
- Agency admin: client access, prompt libraries, report publishing
- Analyst: run audits, validate results, annotate findings
- Account manager: share and present reports
- Client viewer: read-only access to approved reports

## MVP Definition

The MVP should focus on delivering a credible client report quickly.

### MVP feature list

- Client setup and competitor setup
- Prompt collection templates and custom prompts
- Perplexity-first prompt execution
- Raw response storage
- Client and competitor mention detection
- Citation extraction and ordering
- Basic sentiment labeling with evidence excerpts
- Citation Frequency, Mention Rate, AI Share of Voice, and Prompt Visibility Score
- Trend charts for 30 and 90 days
- Executive report export
- Analyst notes and recommendation blocks
- GA4 AI channel integration

### MVP success criteria

- Agency can onboard a client and generate a first report in under 30 minutes after prompt setup.
- Reports clearly show whether the client is cited, mentioned, absent, or negatively framed.[cite:10]
- Analysts can trace every score back to a raw response.
- Account managers can present the output as part of a broader SEO or audit deliverable.

## Phase Roadmap

| Phase | Focus | Deliverables |
|---|---|---|
| Phase 1 | Foundational reporting | Perplexity runs, core metrics, portal dashboard, exports |
| Phase 2 | Competitive depth | Multi-platform support, source analysis, alerts, better sentiment |
| Phase 3 | Business intelligence | CRM attribution, pipeline impact, benchmarks, prescriptive automations |
| Phase 4 | Enterprise scale | Higher-frequency runs, workflow automation, global benchmarking |

## Technical Architecture

Recommended architecture:
- Frontend: portal-native dashboard module
- Backend API: client, prompt, run, report, and integration services
- Worker queue: scheduled prompt execution and parsing
- Analysis service: entity resolution, scoring, sentiment, and aggregation
- Data store: relational DB for structured records, object storage for raw artifacts
- Reporting service: PDF, CSV, and share-link generation

### Service boundaries

- `prompt-service`: manages prompt templates, collections, and schedules
- `runner-service`: executes prompt jobs and stores raw responses
- `parser-service`: extracts mentions, citations, and positions
- `scoring-service`: computes KPIs and trend snapshots
- `report-service`: renders dashboards and exports
- `integration-service`: handles GA4, GSC, CRM, and auth connectors

## QA and Validation

### Data QA

- Verify brand alias precision and recall on sample responses.
- Compare manual audit results to automated scoring on a calibration set.[cite:10]
- Flag ambiguous mentions for analyst review.
- Test geography-sensitive prompts separately.

### Reporting QA

- Ensure every chart ties to a metric definition in the UI.
- Ensure exported numbers match on-screen dashboard values.
- Validate date-range handling and platform filters.

### Operational QA

- Retry handling for failed runs
- Duplicate prompt prevention
- Scoring version control
- Integration failure alerts

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Platform response variability | Trend noise | Use larger prompt sets, scheduled cadence, rolling averages |
| Brand ambiguity | False positives | Alias controls, exclusion lists, analyst review queue |
| Sentiment misclassification | Misleading reports | Evidence excerpts, confidence scoring, manual override |
| Attribution gaps | Underreported business impact | GA4 channel setup plus self-reported attribution fields.[cite:10] |
| Overweighting one platform | Incomplete picture | Start Perplexity-first, then expand platform mix in Phase 2 |

## Implementation Plan

### Sprint 1

- Finalize metric definitions
- Build data model
- Create client, competitor, and prompt admin screens
- Implement prompt collection versioning

### Sprint 2

- Build run scheduler and queue
- Implement Perplexity-first prompt execution path
- Store raw responses and metadata

### Sprint 3

- Build mention and citation extraction
- Add scoring engine for citation, mention, and SoV metrics
- Create dashboard overview

### Sprint 4

- Add sentiment layer and evidence excerpts
- Build prompt detail screen and analyst annotations
- Add exportable report output

### Sprint 5

- Add GA4 integration and traffic layer
- Add recommendations engine
- QA calibration against manual audit set

## Suggested Report Template

### Executive section

- AI visibility this period
- Change from previous period
- Biggest wins
- Biggest losses
- Competitor delta
- Recommended next actions

### Analyst section

- Prompt set coverage
- Platform coverage
- Core metric definitions
- Top prompts by visibility score
- Top negative-framing prompts
- Citation domain analysis
- Traffic and conversion layer
- Methodology notes

## Future Enhancements

- Cross-model comparison benchmarking
- Prompt cluster performance forecasting
- Topic gap detection from competitor advantage patterns
- Automated refresh recommendations for decaying cited pages
- Reputation early-warning system based on negative prompt sentiment spikes
- White-labeled client portals and scheduled email delivery

## Decision Summary

This module is feasible, strategically valuable, and well-suited to an agency portal because current GEO measurement best practice already relies on repeatable prompt testing, citation tracking, mention rate, share of voice, and downstream analytics stitching.[cite:10]

The recommended launch path is a Perplexity-first MVP focused on core visibility metrics and polished client reporting, followed by multi-platform expansion and deeper business-impact integration.[cite:10]
