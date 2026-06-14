## Resume From

Last session: 2026-06-14
Last commit: 1d1131c docs(status): record v1.8.0 commit hash for resume point
Branch: main | Version: v1.11.1 | 540 tests passing
Production: v1.4.0 - v1.6.1 deployed to pre-production, QA passed. v1.6.0 verified
live: Salvo Metal Works AI Share of Voice now reads 88.5% (previously 153%) after
re-parsing runs 6-8 and the aggregate-snapshot-daily job completing. TD-14 fix
confirmed live. v1.6.1 (TD-15 + sentimentStore cross-client leak fix) deployed and
QA passed. v1.7.0 (platform CRUD API) verified live and QA passed against
pre-production (GET /api/platforms returns the 7 seeded platforms with
enabled/config fields). v1.8.0 (AI Platforms admin page) deployed to
pre-production and verified — /admin/platforms confirmed working. v1.9.0 (B-16
GA4 property picker) deployed to pre-production and verified — TD-16 recurred
on this deploy's restart (stale lsnode worker, killed manually) but resolved
once the fresh worker took over; "No adapter configured" errors gone. v1.10.0
(Retry failed button on RunDetail) implemented this session — not yet deployed.
v1.11.0 (nav/layout refactor: Clients link on Home, Back to Workflows
positioning fix on ai/clients) deployed to pre-production. v1.11.1 (fix:
Retry failed didn't resume run polling and double-counted failedPrompts)
deployed to pre-production and verified — "Retry failed" behaves as expected
(page auto-updates after the retry completes, no manual refresh needed).

A 5-platform run (Perplexity, ChatGPT, Claude, Gemini, Groq/Llama) was tested
on pre-production: all passed except Gemini (429 rate limit, expected — see
v1.10.0 context). Note: the Groq ("Llama via Groq") adapter is implemented and
seeded, but the user's Groq API access is still pending GA approval (requested,
not yet granted) — Groq-based runs cannot be fully exercised until that access
comes through.

QA on v1.11.1 found the B-16 GA4 property dropdown still shows the manual-entry
form instead of the picker. Diagnosed via pre-production stderr.log
("ga4 properties list failed", integrationId 5): the GA4 Admin API
(analyticsadmin.googleapis.com) returns 403 SERVICE_DISABLED — it is a
separate API from the GA4 Data API and is not yet enabled in the Google Cloud
project (551074775331) backing the OAuth client. This is the documented
graceful-degradation path working as designed, not a code bug. One-time fix
(user/Cloud Console side): enable it at
https://console.developers.google.com/apis/api/analyticsadmin.googleapis.com/overview?project=551074775331,
wait a few minutes, then reload the Integrations page (or click "Re-connect
Google account") to confirm the dropdown populates.

v1.3.0 deploy follow-ups (brand_aliases backfill, Salvo runs 6 & 7 re-parse, /admin/jobs
health check) — all completed during v1.3.0 QA.

Pick up from:
1. v1.11.1 QA complete — no further action needed for the Retry failed fix.
2. Once Groq API access is granted, set GROQ_API_KEY in the pre-production
   .env and re-run a multi-platform collection to confirm the Groq/Llama
   adapter works end-to-end (it is already implemented and seeded as
   "Llama via Groq" — server/adapters/groq.ts).
3. Enable the Google Analytics Admin API in Google Cloud project 551074775331
   (see above) so the B-16 GA4 property dropdown can populate, then re-test
   on the Integrations page. No code change needed.
4. B-11 Phase 2 follow-ups (deferred): "add custom platform" form (POST
   /api/platforms via UI), and extend Integrations.tsx to show connection status for
   all 5 target LLMs (currently only Perplexity is shown there).
5. Continue internal review of the consolidated AI Visibility client page
   (Overview/Mentions/SoV/Sentiment/Sources/Recommendations/Traffic now inline
   on ClientDetail) before exposing pre-production to clients.
6. See Tech Debt Register and Backlog below for next priorities.

---

## Post-Sprint Work This Session (v1.11.1)

- Fix: "Retry failed" left the Run Detail page stuck with no updates.
  - Root cause: `POST /api/runs/:id/retry-failed` set the retried response(s)
    back to "queued" and enqueued a prompt-run job, but left `run.status`
    unchanged (e.g. "failed"/"partial", both terminal). RunDetail's
    `refetchInterval` only polls while `run.status` is non-terminal, so the
    page never refetched and the user saw no update even after the retry
    completed. It also never decremented `run.failedPrompts`, so a second
    failure on retry would double-count it.
  - server/storage/runStore.ts: added `decrementFailed()` (floored at 0).
  - server/routes/runs.ts: `retry-failed` now calls `decrementFailed()` for
    each retried response and sets `run.status` to "running" when any
    responses were retried, so the existing 5s poll resumes until the job
    runner finalises the run again.
  - New/updated tests: tests/server/storage/runs.test.ts (decrementFailed,
    floor at 0), tests/server/runs.routes.test.ts (retry-failed decrements
    counters and sets status to "running"; no-op when nothing to retry).
  - 540 tests passing (4 new).

## Post-Sprint Work This Session (v1.11.0)

- Refactor: consistent "Back to Workflows" placement + new "Clients" nav link.
  - client/src/pages/ai/ClientsList.tsx: moved the "Back to Workflows" link out
    of the heading row (it was next to the "New Client" button) into its own
    left-aligned row above the "Clients" heading, matching the pattern used on
    admin/platforms, admin/users, and admin/jobs.
  - client/src/pages/Home.tsx: added a "Clients" link (Building2 icon) to the
    top-nav icon row, pointing to /ai/clients, alongside the existing AI
    Visibility / Users / Jobs / AI Platforms links.
  - New tests: client/src/pages/ai/ClientsList.test.tsx (Back to Workflows
    renders above and outside the heading row) and client/src/pages/Home.test.tsx
    (Clients link renders with href=/ai/clients).
  - 536 tests passing (2 new).

## Post-Sprint Work This Session (v1.10.0)

- Feature: "Retry failed" button on the Run Detail page.
  - client/src/pages/ai/RunDetail.tsx: added a `retryFailedMutation` wired to
    the existing `POST /api/runs/:id/retry-failed` endpoint (previously
    backend-only, with no UI). Shown next to "Re-parse responses" whenever the
    run is terminal and `run.failedPrompts > 0`. On success, invalidates the
    run query and toasts the retried count.
  - client/src/pages/ai/RunDetail.test.tsx (new): 2 tests — button renders and
    fires the retry endpoint when failedPrompts > 0; button absent when there
    are no failed responses.
  - 534 tests passing (2 new).
  - Context: surfaced while debugging a Gemini 429 (rate limit) on a single
    prompt run after the v1.9.0 deploy — the adapter retries 429s 3x with
    backoff, but if all 3 fail, the prompt-run job marks the response "failed"
    without itself failing, so there was no automatic or manual retry path in
    the UI. This is a one-off rate-limit issue (Gemini free-tier ~15 RPM), not
    a regression.

## Post-Sprint Work This Session (v1.9.0)

- Feature (B-16): GA4 Property ID picker during OAuth connect.
  - server/services/ga4.ts: added `listAccountProperties()` — calls the Google
    Analytics Admin API (`accountSummaries`, covered by the existing
    `analytics.readonly` scope) and flattens the result into
    `{ propertyId, displayName, accountName }[]`, with pagination support and
    automatic access-token refresh via the existing `getOrRefreshAccessToken`.
  - server/routes/integrations.ts: added
    `GET /api/clients/:id/integrations/:integrationId/ga4/properties`
    (ADMIN_ROLES) — returns `{ properties }` on success, or
    `{ properties: [], error }` (HTTP 200) if the Admin API call fails, so the
    client can degrade gracefully to manual entry.
  - client/src/pages/ai/Integrations.tsx: after OAuth connects, the property
    list loads automatically (query enabled once `connectedEmail` is set).
    Renders a dropdown of properties (grouped by account) when the list is
    non-empty; selecting an option saves immediately via the existing
    `PATCH /api/integrations/:id/property`. An "Enter ID manually" toggle (and
    automatic fallback on empty/error) preserves the original free-text input.
  - docs/system-documentation.md: documented the new dropdown flow in the GA4
    connect steps (Section 1B) and added a one-time Cloud Console step (enable
    the Google Analytics Admin API) to Section 1A.
  - Tests: 5 new service tests (tests/server/services/ga4.test.ts), 6 new route
    tests (tests/server/integrations.routes.test.ts), 3 new client tests
    (client/src/pages/ai/Integrations.test.tsx) — 532 tests passing total.
  - Manual QA steps (run on pre-production after deploy):
    1. Client > Integrations > Connect Google Analytics, complete OAuth.
    2. Confirm the property dropdown auto-populates; pick one; confirm it saves
       (toast + value shown).
    3. Confirm "Enter ID manually" toggles to the text box and still saves.
    4. Click "Test" on the GA4 integration to confirm the saved property
       fetches traffic.
    5. Negative: if the Cloud Console project doesn't yet have the Analytics
       Admin API enabled, confirm the UI falls back to manual entry with the
       "Couldn't load your GA4 properties automatically" note.

## Post-Sprint Work This Session (v1.8.0)

- Feature (B-11 Phase 2 core): "AI Platforms" admin page.
  - client/src/pages/admin/Platforms.tsx (new): lists all platforms from
    GET /api/platforms with displayName/slug, a Connected/Not-configured badge
    derived from `useAuth().status.config.configuredPlatforms`, an enabled
    Switch wired to `PATCH /api/platforms/:id`, and a delete button wired to
    `DELETE /api/platforms/:id` (errors, including 409 PLATFORM_IN_USE, surface
    via toast).
  - client/src/App.tsx: registered route `/admin/platforms`.
  - client/src/pages/Home.tsx: added "AI Platforms" nav link, visible to
    super_admin and agency_admin (matches backend ADMIN_ROLES).
  - client/src/pages/admin/Platforms.test.tsx (new): 3 tests covering list
    rendering with connection badges, enabled-toggle PATCH, and delete DELETE.
  - 518 tests passing (3 new).
  - Deferred: "add custom platform" form and Integrations.tsx connection-status
    badges for all 5 LLMs (see B-11 in Backlog).

## Post-Sprint Work This Session (v1.7.0)

- Feature (B-11 Phase 1): backend CRUD for LLM platform metadata.
  - shared/schema.ts: added `insertPlatformSchema` (slug regex
    `^[a-z0-9-]+$`, displayName, optional config) and `updatePlatformSchema`
    (displayName/enabled/config all optional).
  - server/storage/platformStore.ts: added `getBySlug`, `create`, `update`,
    `delete`, `countResponses` to `IPlatformStore`/`PlatformStore`.
  - server/routes/prompts.ts: added `POST /api/platforms` (400 validation, 409
    DUPLICATE_SLUG, 201), `PATCH /api/platforms/:id` (404 PLATFORM_NOT_FOUND, 200),
    `DELETE /api/platforms/:id` (404, 409 PLATFORM_IN_USE when countResponses > 0,
    204) — all gated to ADMIN_ROLES.
  - tests/server/_helpers/buildAuthApp.ts: added the same AppError-aware error
    handler used in server/index.ts so route tests can assert on `res.body.code`.
  - tests/server/storage/prompts.test.ts: 11 new PlatformStore tests (29/29 passing).
  - tests/server/prompts.routes.test.ts: 12 new route tests for POST/PATCH/DELETE
    /api/platforms (36/36 passing).
  - 515 tests passing (25 new). API keys remain in .env/cPanel env vars — this CRUD
    only manages platform metadata (slug/displayName/enabled/config).
  - Phase 2 (frontend) not started — see B-11 in Backlog.

## Post-Sprint Work This Session (v1.6.1)

- Fix (TD-15 + related): `citationStore.listByClient()` and
  `sentimentStore.listByClient()` / `sentimentStore.getReviewQueue()` all returned
  their entire underlying table (`response_citations` / `response_sentiment`)
  regardless of the `clientId` argument — identical cross-client data leak pattern to
  the `mentionStore.listByClient()` bug fixed in v1.4.2. This affected the Citation
  Sources, Sentiment, and Recommendations sections on ClientDetail (every client saw
  every other client's citations and sentiment rows).
  - server/storage/citationStore.ts: listByClient now joins
    response_citations -> responses_raw -> prompt_runs and filters by
    prompt_runs.client_id (same pattern as mentionStore).
  - server/storage/sentimentStore.ts: listByClient and getReviewQueue both gain the
    same join + client_id filter; getReviewQueue also still filters by confidence
    threshold and no override.
  - tests/server/storage/metrics.test.ts: new CitationStore "listByClient returns
    only citations belonging to that client's runs" test.
  - tests/server/storage/sentiments.test.ts: rewrote fixtures to seed real
    run/response rows (required for the new join); added "listByClient returns only
    sentiment belonging to that client's runs" and updated "getReviewQueue" test for
    multi-client isolation.
  - 490 tests passing (2 new).
  - Not yet deployed.

## Post-Sprint Work This Session (v1.6.0)

- Fix: AI Share of Voice could exceed 100% (reported as 153% for Salvo Metal Works).
  Root cause: `computeAISoV(mentionCount, allBrandMentions)` divided two incompatible
  units — `mentionCount` counts *responses* where the client brand was mentioned OR
  cited (including citation-only responses with zero `response_mentions` rows), while
  `allBrandMentions` counts raw `response_mentions` *rows* across all brands. Mixing a
  response-count numerator with a row-count denominator allowed the ratio to exceed
  100%.
  - shared/schema.ts: added `clientBrandMentions` column to `metricSnapshotsDaily` +
    `MetricSnapshotDaily` type. Migration 0010_cute_malice.sql.
  - server/storage.ts: SCHEMA_SQL (in-memory test DB) gains `client_brand_mentions`.
  - server/storage/metricStore.ts: hydrate(), AggregateResult, upsert(), and
    aggregateForPeriod() all carry `clientBrandMentions` / `totalClientBrandMentions`.
  - server/jobs/handlers.ts (aggregate-snapshot-daily): now also tallies
    `clientBrandMentions` — the raw `response_mentions` row count where
    `brandId === clientBrand.id` — across all completed responses.
  - server/routes/metrics.ts: Overview, trend (`aiSoV` case), and `/sov` all derive
    AI SoV from `totalClientBrandMentions` / `clientBrandMentions` instead of
    `totalMentions` / `mentionCount`. Both numerator and denominator are now raw
    mention-row counts, so AI SoV cannot exceed 100%.
  - docs/system-documentation.md Section 2.2 AI SoV "Data sources" updated to describe
    the corrected formula.
  - tests/server/storage/metrics.test.ts + tests/server/metrics.routes.test.ts: 3 new
    tests (TDD — confirmed failing before implementation). 488 tests passing.
  - Not yet deployed.

## Post-Sprint Work This Session (v1.5.0)

- Feature: Re-parse progress/completion feedback on RunDetail
  (client/src/pages/ai/RunDetail.tsx). Previously, clicking "Re-parse responses"
  only showed a toast — there was no way to tell whether the async parse-response
  jobs were still running or had finished.
  - server/storage/jobStore.ts: new `listByKindAndResponseIds(kind, responseIds,
    sinceTs)` — finds jobs of a given kind whose JSON payload.responseId is in the
    given set, created at/after sinceTs.
  - server/routes/runs.ts: new `GET /api/runs/:id/reparse-status?since=<ts>`
    (EDITOR_ROLES) — returns `{ total, queued, running, done, failed, cancelled }`
    counts of parse-response jobs for the run's responses since `since`.
  - client/src/pages/ai/reparseStatus.ts (new): pure helpers
    `isReparseComplete()` / `reparseProgressLabel()`.
  - RunDetail.tsx: on re-parse trigger, records `since = Date.now()` and polls
    reparse-status every 3s; shows a "Re-parsing responses: X/N done" banner,
    then "Re-parse complete" and auto-invalidates this client's AI Visibility
    queries (Overview/Mentions/SoV/Sentiment) so sections refresh without a
    manual reload.
  - tests/server/storage/jobStore.test.ts, tests/server/runs.routes.test.ts,
    client/src/pages/ai/reparseStatus.test.ts: 8 new tests (TDD — confirmed
    failing before implementation). 485 tests passing.
  - docs/system-documentation.md Section 1B Step 7 updated to describe the new
    progress banner.
  - Not yet deployed.

### TD-14 root cause (confirmed via read-only prod.data.db copy)

`brand_aliases` for Salvo Metal Works' own brand (brand_id=4, client_id=4) is
**empty** in production — not even the canonical name "Salvo Metal Works" is
registered as a searchable alias. This is why run 6 has 8/10 responses with a
client-owned citation but 0/10 with a brand mention (all_brand_mentions=0):
the parser had nothing to match against.

Run 7 currently shows 8 mention rows for brand_id=4 despite the alias table
being empty *now* — meaning an alias existed at the time run 7 was
parsed/re-parsed and was later removed. The v1.2.8 alias auto-seed + backfill
was applied to a local copy of prod.data.db during that session but appears to
never have reached live production (or was subsequently lost).

Fix in progress (data-only, via portal UI per system-documentation.md Section
1B Step 3): add alias "Salvo Metal Works" (exact) to brand_id=4, then use
Re-parse responses on runs 6, 7, and 8.

Separately noted: live Overview reports 3 runs (6-8) / ~60 responses for
Salvo, but the downloaded prod.data.db snapshot only contained runs 6-7 (20
responses) — likely the download predates run 8's completion. Re-verify
counts after the alias fix + re-parse.

## Post-Sprint Work This Session (v1.4.2)

- Fixed `mentionStore.listByClient()` (server/storage/mentionStore.ts), found during
  AI Visibility QA on Salvo Metal Works (clientId=4): Overview showed Mention Rate =
  78.3% (driven by citation-only responses, hasCitation OR hasMention) while the
  Mentions section showed "No mentions detected yet" — the route returned the ENTIRE
  response_mentions table unfiltered (the `clientId` parameter was unused/prefixed
  `_clientId` since Sprint 4). Now joins response_mentions -> responses_raw ->
  prompt_runs and filters by `prompt_runs.client_id`.
  - tests/server/storage/metrics.test.ts: new test confirms mentions from another
    client's runs are excluded. 477 tests passing (1 new).
  - Noted but NOT fixed in this change: `citationStore.listByClient()` has the
    identical unfiltered-table pattern (server/storage/citationStore.ts:58-63) —
    tracked as TD-15.
  - Not yet deployed.

## Post-Sprint Work This Session (v1.4.1)

- Fixed metric_snapshots_daily overview aggregation bug found during AI Visibility
  QA on Salvo Metal Works (clientId=4): Overview showed Citation Frequency and
  Mention Rate both as 78.3%, inflated by double-counting. `aggregate-snapshot-daily`
  (server/jobs/handlers.ts) recomputes lifetime cumulative totals on every run and
  stores them in the snapshot row for "today" — so each row holds an all-time total
  as of its date, not a daily delta. `metricStore.aggregateForPeriod` was SUM()-ing
  every snapshot row in the requested date range, re-adding totals already subsumed
  by later rows.
  - server/storage/metricStore.ts: aggregateForPeriod now returns the delta between
    the latest snapshot at/before toDate and the latest snapshot strictly before
    fromDate (0 if no baseline exists), instead of summing all rows in range.
  - server/jobs/handlers.ts: corrected misleading "Aggregate today's completed
    responses" comment to describe the actual cumulative-recompute behavior.
  - tests/server/storage/metrics.test.ts: updated existing aggregation test to the
    new delta semantics; added 2 new tests covering the cumulative double-count
    scenario and baseline subtraction. 476 tests passing (2 new).
  - Not yet deployed.

## Post-Sprint Work This Session (v1.4.0)

- v1.4.0 (AI Visibility Page Consolidation): merged the 7 separate report routes
  (Overview, Mentions, Share of Voice, Sentiment, Sources, Recommendations, Traffic)
  into inline sections on ClientDetail (client/src/pages/ai/sections/*) for a
  single-page view. Reports, Prompt Collections, Runs, and Integrations remain as
  top nav buttons. Removed the now-redundant standalone page routes from App.tsx.
  Added ClientDetail.test.tsx smoke test (TDD: written first, confirmed failing,
  then implementation made it pass). 474 tests passing (3 new).
  Deployed to pre-production and passed internal QA — not yet exposed to clients.

## Post-Sprint Work Previous Session (v1.2.8 – v1.3.0)

- v1.2.8: Root-caused Salvo "no AI Visibility data" report to brand_aliases table being
  empty for all brands (parser only matches against brand.aliases). Fixed by
  auto-seeding an exact-match alias from canonicalName on brand/competitor creation
  (server/routes/clients.ts). Backfilled aliases for the 4 existing brands in a local
  prod.data.db copy.
- v1.3.0 (Job Runner Monitoring, Instrumentation & Manual Recovery): found 15 jobs from
  Salvo run 7 stuck 9+ days because rescueOrphans() only ran on process start, not per
  tick, with zero visibility into queue health.
  - server/jobs/runner.ts: rescueOrphans() now runs every tick (self-healing);
    added getHealth() heartbeat (lastTickAt, intervalMs, running) + log instrumentation
  - shared/schema.ts: JOB_STATUSES/JobStatus/Job types (adds "cancelled")
  - server/storage/jobStore.ts (new): list/filter, countByStatus, listHung, requeue, cancel
  - server/routes/jobs.ts (new): GET /api/jobs, GET /api/jobs/health,
    POST /api/jobs/:id/requeue, POST /api/jobs/:id/cancel, POST /api/jobs/rescue —
    all super_admin only
  - client/src/pages/admin/Jobs.tsx (new): health banner, status chips, jobs table
    with Requeue/Cancel actions, "Rescue hung jobs" button, polls every 5s; wired at
    /admin/jobs with nav link in Home
  - Verified live against local prod.data.db copy: starting the server auto-drained
    all 15 stuck run-7 jobs and produced 8 new response_mentions rows
  - 471 tests passing (29 new: 2 runner, 9 jobStore, 16 jobs routes, 2 clients alias)

## Post-Sprint Work Previous Session (v1.2.1 – v1.2.7)

- v1.2.1: Replaced ai-visibility-reporting-spec.md with aeo_geo_google_data_architecture.md as guiding architecture doc; merged PR #1 (feature/ai-visibility-module → main)
- v1.2.2–v1.2.6: GA4 OAuth popup flow — fixed CSP inline-script block, hash routing, COOP header severing window.opener; final solution uses server-side polling from main window (no cross-window messaging)
- v1.2.7: Prompt category taxonomy reworked to 5 groups: Brand/Entity, Category/Commercial Intent, Local/Regional, Comparison/Evaluation, Reputation; GA4 connected and verified (4 AI sessions showing on Traffic page)

## Post-Sprint Work Previous Session (v1.1.0 – v1.2.0)

- v1.1.0: Fixed critical pipeline bug — prompt-run was not enqueuing parse-response; added Re-parse button on RunDetail
- v1.1.1: Reordered ClientDetail nav; added system-documentation.md; added New Export button on Reports page
- v1.2.0: Multi-LLM adapters (OpenAI/ChatGPT, Anthropic/Claude, Gemini, Groq/Llama, Mistral, DeepSeek); platform seeding fixed (INSERT OR IGNORE per slug); platform multi-select on Trigger Run / Run Now; GA4 referrer list expanded to 30+ domains; monthly stacked bar chart on Traffic page

## Current Sprint — AI Visibility Sprint 7 — GA4 + Calibration + v1.0.0

**Goal:** AI referral traffic stitched into reports; calibration harness against a manual audit set; v1.0.0 cut.
**Status: COMPLETE**
**Version: v1.2.0 (includes post-sprint fixes and multi-LLM feature)**

### Milestones

- [x] Schema: integrations table; Migration 0009_chubby_celestials.sql (22 tables total)
- [x] Service: server/services/ga4.ts — native fetch + JWT auth; filterAiSearchRows() covers 6 AI platforms
- [x] Store: integrationStore (CRUD + updateStatus)
- [x] Job kind: refresh-ga4 (daily connectivity sync)
- [x] Routes: server/routes/integrations.ts — CRUD + test + traffic view (graceful noIntegration fallback)
- [x] UI: Traffic + Integrations pages; ClientDetail nav gains Traffic button
- [x] Calibration harness: tests/calibration/ — 20 synthetic fixtures; precision ≥0.85 on mentions, ≥0.90 on citations, ≥0.70 on sentiment — all PASS
- [ ] PR feature/ai-visibility-module → main

---

## Previous Sprints (AI Visibility Module)
- [ ] Services: server/services/parser.ts, server/services/scoring.ts
- [ ] Job kinds: parse-response (auto on insert), aggregate-snapshot-daily
- [ ] Routes: server/routes/metrics.ts (6 endpoints)
- [ ] UI: Overview dashboard (KPI cards + recharts trend lines), MentionsList, SoV chart
- [ ] Tests: parser precision/recall fixtures, scoring formula correctness, metric routes

---

## AI Visibility Module — Sprint Roadmap

Full spec: `docs/aeo_geo_google_data_architecture.md`
Plan file: `C:\Users\georg\.claude\plans\glistening-riding-pixel.md`

Confirmed decisions:
- PDF: CSV-only through MVP (Phase 2 revisit)
- Sentiment: Rule-based lexicon only for MVP; Anthropic-assisted deferred to Phase 2
- Perplexity API key + monthly USD ceiling: to be provided before Sprint 3 (set PERPLEXITY_API_KEY in .env)

| Sprint | Goal | Version | Status |
|--------|------|---------|--------|
| Sprint 0 | Foundation refactor — split routes/storage, add roles + jobs scaffold | v0.3.0 | DONE |
| Sprint 1 | Client / brand / competitor setup + AI module shell UI | v0.4.0 | DONE |
| Sprint 2 | Versioned prompt library | v0.5.0 | DONE |
| Sprint 3 | Run engine + Perplexity adapter | v0.6.0 | DONE |
| Sprint 4 | Mention/citation analysis + core metrics dashboard | v0.7.0 | DONE |
| Sprint 5 | Sentiment, annotations, CSV exports | v0.8.0 | DONE |
| Sprint 6 | Sources, recommendations, share links | v0.9.0 | DONE |
| Sprint 7 | GA4 integration, calibration harness | v1.0.0 | NEXT |

---

## Previous Sprints (AI Visibility Module)

### Sprint 6 — Sources, Recommendations, Share Links (COMPLETE — v0.9.0)

- Schema: share_tokens table; Migration 0008_big_korath.sql (21 tables)
- Services: sources.ts (domain analysis, owned split), recommendations.ts (4 gap rules), shareLink.ts (SHA-256 token lifecycle)
- Store: shareTokenStore; citationStore gained listByClient()
- Routes: sources.ts — sources, recommendations, share link create/revoke, public /api/share/:token/data
- UI: Sources, Recommendations, SharePage pages; ClientDetail nav gains Sources + Recommendations
- Tests: 38 new; 395 total passing

### Sprint 3 — Run Engine + Perplexity Adapter (COMPLETE — v0.6.0)

- Schema: prompt_runs, responses_raw, run_schedules + zod schemas + types
- Migration: 0005_majestic_anita_blake.sql (14 tables total)
- Adapter: server/adapters/perplexity.ts — native fetch, 3-retry w/ exponential backoff, 30s timeout, ordered citation extraction. Registry wires slug to adapter.
- Stores: runStore (lifecycle + atomic SQL counters), responseStore (full result capture), scheduleStore (listDue + markFired)
- Job handlers: prompt-run (executes one prompt, finalises run status) + schedule-tick (promotes due schedules into runs + jobs). Both registered via registerJobHandlers() on startup.
- jobRunner.enqueue() — clean public API so routes/handlers queue jobs without importing db directly
- Routes: server/routes/runs.ts — 8 endpoints (trigger 202, list, detail, retry-failed, schedule CRUD)
- Config: PERPLEXITY_API_KEY + PERPLEXITY_DAILY_USD_LIMIT in AppConfig (optional, graceful)
- UI: RunsList (polled at 5s while active) + RunDetail pages; ClientDetail gains Runs button
- Tests: 41 new (17 storage, 7 adapter, 17 routes); 262 total passing

### Sprint 2 — Versioned Prompt Library (COMPLETE — v0.5.0)

- Schema: platforms, prompt_collections, prompts + PROMPT_CATEGORIES/FUNNEL_STAGES constants
- Migration: 0004_fantastic_kree.sql
- Stores: platformStore (seedDefaults, idempotent), promptCollectionStore (CRUD, clone, activate — one-active-per-client invariant), promptStore (CRUD, bulkCreate up to 200)
- Routes: server/routes/prompts.ts — 11 endpoints (platforms, collections, prompts, bulk import)
- Seeding: Perplexity platform auto-seeded on startup
- UI: PromptCollections + PromptCollectionDetail pages; ClientDetail gains Prompt Collections button
- Tests: 40 new (18 storage, 22 routes); 221 total passing

### Sprint 1 — Client / Brand / Competitor Setup (COMPLETE — v0.4.0)

- Schema: clients, brands, brand_aliases, competitors, client_users tables
- Migration: 0003_numerous_black_tarantula.sql
- Stores: clientStore (soft-delete), brandStore, aliasStore, competitorStore, clientUserStore (canAccess)
- Routes: server/routes/clients.ts — 14 endpoints, { data } envelope, role-gated
- UI: ClientsList + ClientDetail pages; AI Visibility nav link in Home header
- Tests: 47 new (22 storage, 25 routes); 181 total passing
- QA: verified at localhost:5000

### Sprint 0 — Foundation Refactor (COMPLETE — v0.3.0)

- Routes split: server/routes.ts → routes/index.ts + auth.ts + workflows.ts
- Storage split: storage.ts barrel + storage/workflowStore.ts + userStore.ts
- users.role enum column; requireRole() + requireClientAccess() in auth.ts
- server/jobs/runner.ts — JobRunner with 30s tick, atomic locking, orphan rescue on boot
- JobRunner.enqueue() — public API for queuing jobs from routes and handlers
- tests/server/_helpers/buildAuthApp.ts — reusable role-aware test harness
- Migration: 0002_funny_shadowcat.sql (users.role + jobs table)
- Tests: 23 new; 134 total passing

---

## Previous Sprints (Core Portal — main branch at v0.2.7)

### Session 2026-05-09 (Sprint 2 completion — main branch)

- S2-06 .env validation: validateEnv() calls before migrate(), fails fast on bad SESSION_SECRET or partial SMTP
- S2-04 Structured logging: JSON logger with requestId, userId, method, path, statusCode, durationMs
- S2-05 CI/CD: .github/workflows/ci.yml — lint + check + test on push/PR to main
- 111 tests passing at v0.2.7

---

## Tech Debt Register

| ID  | Severity | Status | Description | File |
|-----|----------|--------|-------------|------|
| TD-10 | Medium | Done | Session error callbacks lack request context in logs | server/routes/auth.ts |
| TD-12 | Low | Open | Hardcoded seed data — no versioning or rollback | server/seed.ts |
| TD-13 | Low | Open | skipLibCheck: true masks dep type errors | tsconfig.json |
| TD-14 | Medium | Done | Salvo (clientId=4) run 6: 8/10 responses had a client-owned citation but zero client-brand mentions detected (all_brand_mentions=0). Root cause: brand_aliases for brand_id=4 was empty in production (v1.2.8 backfill never reached live data.db). Fixed (data-only) by adding the "Salvo Metal Works" alias via portal UI and re-parsing runs 6-8; verified live in v1.6.0 (AI SoV now 88.5%, down from an impossible 153%). | server/services/parser.ts |
| TD-15 | Medium | Done | citationStore.listByClient, sentimentStore.listByClient, and sentimentStore.getReviewQueue all ignored their clientId parameter and returned the full response_citations / response_sentiment tables across all clients (same pattern fixed for mentionStore in v1.4.2). Fixed in v1.6.1 by joining responses_raw -> prompt_runs and filtering by client_id; feeds Citation Sources, Sentiment, and Recommendations sections on ClientDetail. | server/storage/citationStore.ts, server/storage/sentimentStore.ts |
| TD-16 | Low | Open | Stale lsnode worker processes can survive a cPanel "Restart" of the Node app, causing env-var drift: a worker started before an env var was added/changed keeps its old `process.env` snapshot (registry.ts builds `_adapters` once at module load), so jobs claimed by that worker fail even though the env var is correctly set for new workers. Observed after adding `OPENAI_API_KEY` — 3/10 prompt-run jobs failed with "No adapter configured for platform: openai" while 7/10 (handled by the new worker) succeeded. Workaround: after changing env vars, manually `kill` any pre-existing `lsnode` PIDs via SSH so only the freshly-restarted worker remains, then requeue failed jobs via /admin/jobs. | ops/cPanel deployment |

---

## Backlog (post-AI-module)

### High Priority
- B-11 Feature: LLM integrations CRUD — add a mechanism to create/read/update/delete
  LLM platform integrations. Target LLMs: ChatGPT, Grok, Perplexity, Claude, and Google
  AI (Gemini). **Phase 1 (backend CRUD, v1.7.0) COMPLETE** — API keys stay in
  .env/cPanel env vars; CRUD applies to platform metadata only (slug, displayName,
  enabled, config). Added `POST/PATCH/DELETE /api/platforms[/:id]` (ADMIN_ROLES),
  `insertPlatformSchema`/`updatePlatformSchema` in shared/schema.ts, and
  `create`/`update`/`delete`/`getBySlug`/`countResponses` on PlatformStore (delete is
  blocked with 409 PLATFORM_IN_USE if responses reference the platform). **Phase 2
  core (v1.8.0) COMPLETE** — new `/admin/platforms` page (super_admin/agency_admin nav
  link "AI Platforms") lists all platforms with Connected/Not-configured badges
  (from `config.configuredPlatforms`), an enabled toggle (PATCH), and delete
  (DELETE, with 409 PLATFORM_IN_USE surfaced via toast). **Remaining**: an
  "add custom platform" form (POST /api/platforms) and extending Integrations.tsx
  to show connection status for all 5 target LLMs are deferred follow-ups.
- B-12 Feature: AI-assisted prompt generation for Prompt Collections — when a Prompt
  Collection is created, offer the user an option to have AI research and generate
  prompts using the client's Brand, website URL, and configured competitors. Generated
  prompts should be grouped by type:
  | Prompt type | Example |
  |---|---|
  | Informational | "What is the best way to solve X?" |
  | Comparative | "Brand A vs Brand B" |
  | Commercial | "Best software for X" |
  | Local | "Best emergency plumber near Seattle" |
  | Problem-aware | "Why is my furnace making noise?" |
  | Alternative | "Alternatives to [competitor]" |
- B-13 Feature: Edit existing prompts — add the ability to edit a prompt's text/category
  on an existing Prompt Collection (currently prompts can only be created/removed, not edited).

### Medium Priority
- B-04 Seed data versioning strategy (allow adding/updating workflows without full redeploy)
- B-06 Session store: session expiry cleanup configuration review
- B-15 Investigate mechanism to create a guided workflow to onboard new clients —
  Section 1B of system-documentation.md lists 6 manual setup steps (brands, aliases,
  GA4, prompt collection, run); a wizard/checklist in-app would reduce setup errors
  such as the missing-competitors gap that caused Salvo's AI SoV to read 0%/100%
  (see system-documentation.md Section 1B Step 2 note, added 2026-06-12).

### Low Priority
- B-08 skipLibCheck: false in tsconfig
- B-09 Local dev server fix for Windows (remaining socket/network issues)
- B-10 Evaluate replacing better-sqlite3-session-store (deprecated)
- B-14 Display the app version number (from package.json) in the footer of every page —
  currently Home.tsx has a one-off footer but no shared layout footer exists across routes.
