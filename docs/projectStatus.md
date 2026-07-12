## Resume From

Last session: 2026-07-12
Branch: main | Version: v1.31.0 | 790 tests passing

Session 2026-07-12: v1.30.1 DEPLOYED to production and smoke tested
(user-confirmed). YLG program kickoff: reviewed the two spec docs now in
docs/ (YLG_AI_Prompt_Generation_Project_Plan_and_Dev_Spec.docx v1.0,
YLG_AI_Visibility_Project_Plan_and_Dev_Spec_v1.1.docx). Current-state
claims verified against code (fuzzy matching is substring-only,
parser.ts; isTrustedThirdParty hardcoded false, parser.ts; prompts schema
lacks all measurement metadata). Four design decisions LOCKED with user:
1. Sequencing: combined "foundation sprint" first (shared prompt metadata
   schema + methodology versioning + prompt-gen P0 safety: collection
   ownership validation, exclusions/services in generation context,
   validation diagnostics, exact-duplicate detection). Recommendation
   classifier + source-domain registry come next sprint. Factory Slice 2
   (Search Console) deferred, not cancelled.
2. Canonical intent taxonomy = the prompt-gen doc's 8-type enum:
   provider_recommendation, service_specific, geographic_discovery,
   problem_solution, comparison, trust_validation, brand_validation,
   alternative. (The two docs disagreed; visibility doc names map onto
   this: category_discovery->provider_recommendation,
   trust->trust_validation.)
3. Methodology v1.0 APPROVED as written: 30-prompt panel (24 non-branded /
   6 branded, 80/20), 4 core surfaces (ChatGPT search, Google AI, Gemini,
   Perplexity), monthly full run with 3 replicates on non-branded prompts,
   weekly 8-prompt sentinel (~440 observations/client/month).
4. Migration approach: reuse prompts.geo as the spec's "location"; add
   intent_type alongside category with a backfill mapping
   (informational->provider_recommendation, comparative->comparison,
   commercial->provider_recommendation, local->geographic_discovery,
   problem_aware->problem_solution, alternative->alternative); retire
   category later once UI/reports read intent_type.

Session 2026-07-08: TD-18 sweep COMPLETE (docs-only session, no code
changes). Every client with a GA4 integration was disconnected and
reconnected via the portal UI under the published (2026-07-07) OAuth app,
Analytics checkbox ticked, and every integration Test passes. The
definitive live-DB list was never needed — the sweep covered all
GA4-connected clients. Note: because integrations were disconnected
first, property IDs had to be re-selected; all confirmed working via
Test.
SSH follow-up logged as TD-19: the server side is DONE — the local
workflow-portal public key is now in the server's authorized_keys and
the server accepts it ("Server accepts key" in ssh -v). Non-interactive
auth still fails locally only because the private key is
passphrase-protected and the Windows ssh-agent service is
Stopped/Disabled. One-time fix in an ADMIN PowerShell:
  Set-Service ssh-agent -StartupType Automatic; Start-Service ssh-agent
  ssh-add "$env:USERPROFILE\.ssh\workflow-portal"   (type passphrase once)
Alternative (no admin): ssh-keygen -p -f "$env:USERPROFILE\.ssh\workflow-portal"
(strip passphrase — key then sits unencrypted on disk).
v1.29.0 (Factory Slice 1: intake routes + factory-run dispatcher +
reporting cell, migration 0016) deployed to production and QA PASSED
(2026-07-07, client 9): dry run checks ok; real run aiTraffic matched the
Traffic page monthly endpoint exactly (June 2026: 8 sessions, chatgpt.com
7 + gemini.google.com 1); approval hold/release with approvedBy/approvedAt
audit verified; negatives (INVALID_CONTRACT, CLIENT_NOT_FOUND,
DUPLICATE_JOB_ID, NOT_AWAITING_APPROVAL) all correct. The factory API is
admin-only (POST/GET /api/factory/jobs, POST /api/factory/jobs/:id/approve).

QA session findings (all logged): TD-16 recurred and is nastier than
documented — a 3.5-day-old stale worker survived Stop/Start and required an
SSH kill (severity raised to Medium); new TD-17 (runner hard-fails unknown
job kinds instead of leaving them for capable workers); new TD-18 HIGH
(OAuth consent screen was in "Testing" — published to production
2026-07-07, but every GA4 integration connected before that date needs a
one-time Reconnect before its 7-day token dies).

Factory decisions locked 2026-07-07: (1) factory jobs execute on the
existing job runner as "factory-run" jobs (factory_jobs = domain record);
(2) contract fields use hybrid storage (normalized tables for queryable
facts, JSON for descriptive config); (3) first production cell =
reporting/ETL pipeline.

Also this session: B-26 collapse + pagination SHIPPED as v1.30.0 (see
Post-Sprint Work below), DEPLOYED to production and QA PASSED
(2026-07-08). Archive was scoped OUT with the user: mention rows are
deleted and recreated on every re-parse (mentionStore.deleteByResponse +
bulkCreate in the parse-response handler), so an archived flag on
response_mentions would be silently wiped — revisit only with
response-level archiving or a separate hidden-matches table if the need
returns.

TD-17 also FIXED this session (v1.30.1, packaged, NOT yet deployed):
unknown-kind jobs now requeue with a 60s delay instead of hard-failing,
with a 24h grace window before terminal failure (capped variant chosen
by user — no eternal requeue loops for typo'd or retired kinds).

Next session priorities:
1. YLG foundation sprint: v1.31.0 (metadata schema + methodology
   versioning) SHIPPED this session — see Post-Sprint Work below. Next
   slice: v1.32.0 generator safety (FR-01 ownership validation, expanded
   GenerationContext with coreServices/exclusions, parse diagnostics
   instead of silent drops, exact-duplicate detection, review-UI
   metadata + warnings). NOTE: v1.31.0 not yet deployed.
2. YLG next sprint: recommendation classifier (7-status scale, evidence,
   confidence, human override) + source-domain registry + golden dataset
   (visibility doc section 16).
3. Factory Slice 2 (DEFERRED behind YLG work): Search Console integration
   (reuse GA4 OAuth pattern,
   webmasters.readonly scope) + hybrid-storage analytics fields (GSC
   property, Bing, reporting Sheet, Looker refs); extend the reporting
   cell. Also still open from Phase 1: production manifest schema, QA
   severity definitions.
4. Workflow 20 follow-up (carried over): paste the methodology block from
   docs/ranking-audit-ai-run-methodology.md into workflow 20's prompt
   (above the <PASTE> lines) and set its AI model; re-test Run with AI for
   less generic output.
5. B-20 GBP API: Business Profile APIs were NOT yet enabled in the GCP
   project (quota page showed "No quotas available" on 2026-07-07). Enable
   My Business Account Management + Business Information (+ Q&A) APIs in
   the project named on the access application, then check quota: 0 QPM =
   approval pending, 300 QPM = granted. When granted, build the per-client
   GBP snapshot integration (reuse GA4 OAuth pattern; United Structural
   Systems is under a different Google account).
6. TD-19 (when convenient): finish local ssh-agent setup so Claude can
   reach the production DB non-interactively (see Session 2026-07-08 note
   above for the exact commands).
7. Next backlog candidates: B-24 tooltips, B-25 in-app Help, B-15 v2
   onboarding wizard, B-14 version footer. Groq API access still pending.
Production: v1.24.0 deployed and user-confirmed (2026-07-03). This deploy
carried v1.22.1 (GA4 scope guard), v1.23.0 (B-21 Run-with-AI inputs), and
v1.24.0 (B-18 collection CRUD) live. GA4 reconnect for
camphousecountrylandscaping.com verified: after removing the portal's access
at myaccount.google.com/permissions and reconnecting with the Analytics
checkbox ticked, the integration Test passes (previously 403
ACCESS_TOKEN_SCOPE_INSUFFICIENT).
v1.6.0 verified live: Salvo Metal Works AI Share of Voice now reads 88.5% (previously 153%) after
re-parsing runs 6-8 and the aggregate-snapshot-daily job completing. TD-14 fix
confirmed live. v1.6.1 (TD-15 + sentimentStore cross-client leak fix) deployed and
QA passed. v1.7.0 (platform CRUD API) verified live and QA passed against
pre-production (GET /api/platforms returns the 7 seeded platforms with
enabled/config fields). v1.8.0 (AI Platforms admin page) deployed to
pre-production and verified — /admin/platforms confirmed working. v1.9.0 (B-16
GA4 property picker) deployed to pre-production and verified — TD-16 recurred
on this deploy's restart (stale lsnode worker, killed manually) but resolved
once the fresh worker took over; "No adapter configured" errors gone. v1.10.0
(Retry failed button on RunDetail) deployed and QA passed.
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
graceful-degradation path working as designed, not a code bug. Documented in
system-documentation.md (Section 1A Step 4, Section 1B Step 4 troubleshooting).
User enabled the Google Analytics Admin API for project 551074775331 and
retested — PASS, the property dropdown now populates and works as designed.

v1.3.0 deploy follow-ups (brand_aliases backfill, Salvo runs 6 & 7 re-parse, /admin/jobs
health check) — all completed during v1.3.0 QA.

Pick up from:
1. Remaining v1.24.0 QA on production (deploy + GA4 reconnect already
   verified 2026-07-03):
   - B-21: Run with AI on a workflow with inputs should open the inputs
     dialog; unfilled token lines must not reach the model.
   - B-18: edit/clone/archive/delete actions on the Prompt Collections page
     (delete is admin-only and 409-blocked while runs reference the
     collection).
2. GBP API access (B-20): user is applying for Google Business Profile API
   access (walkthrough given 2026-07-03: GCP project + "Application for Basic
   API Access" contact form; approval shows as quota going 0 -> 300 QPM).
   When approved, build the portal GBP snapshot integration — per-client
   button pulling listing + services + reviews + Q&A via OAuth (reuse the
   GA4 integration pattern). Gotcha: tokens are per-user; United Structural
   Systems lives under a different Google account than the main 27 locations.
3. QA v1.22.0 on the next real audit run: launch dialog now shows a
   persistent instruction step (credential-labeled workflows always use
   clipboard mode — prompt never enters the URL); the Ranking Audit workflow
   prompt AND the Perplexity skill (seo-rank-and-gbp-growth-planner SKILL.md)
   were both corrected from implicit AND to explicit UNION/OR keyword
   filtering — verify the "Filtered keyword set" section reports per-condition
   match counts and a sane union.
4. Still open: Groq API access pending (GROQ_API_KEY for pre-production);
   backlog B-17, B-15 v2, B-14. See Tech Debt Register and Backlog below
   for full priority list.

---

## Post-Sprint Work This Session (v1.31.0, 2026-07-12)

- feat(prompts): YLG measurement metadata schema + methodology versioning
  (foundation sprint slice 1 of 2). Migration 0017_lyrical_cannonball.sql.
  - shared/schema.ts: canonical 8-type PROMPT_INTENT_TYPES enum (locked
    2026-07-12), COMMERCIAL_VALUES, MEASUREMENT_PURPOSES; prompts gains
    intent_type, brand_in_prompt (nullable = unvalidated), service,
    prompt_family, commercial_value, measurement_purpose (geo doubles as
    the YLG "location"); new prompt_methodologies table + PromptMethodology
    / MethodologyQuotas types; clients.core_services JSON column;
    metric_snapshots_daily.methodology_version (default '1.0').
  - Migration backfills intent_type from category (informational/
    commercial -> provider_recommendation, comparative -> comparison,
    local -> geographic_discovery, problem_aware -> problem_solution,
    alternative -> alternative; unknown/legacy values stay NULL).
  - server/storage/promptMethodologyStore.ts (new): METHODOLOGY_V1_QUOTAS
    (approved 30-prompt panel, replicates, surfaces, cadence), getActive(),
    getByVersion(), list(), idempotent seedDefaults() (INSERT OR IGNORE on
    version), called from routes/index.ts on startup.
  - promptStore/clientStore/metricStore hydrate + write paths carry the
    new fields; metricStore.upsert accepts optional methodologyVersion
    (defaults '1.0'); aggregate-snapshot-daily stamps each snapshot with
    the active methodology version.
  - docs/system-documentation.md: Section 2.2 methodology-versioning note,
    Section 3.2 YLG intent taxonomy + backfill mapping.
  - TDD: 13 new tests written first and confirmed failing (5 methodology
    store, 3 prompt store, 2 client store, 1 metric store, 2 aggregate
    handler); routes.test.ts storage mock gained promptMethodologyStore.
    790 tests passing.

---

## Post-Sprint Work This Session (v1.30.1, 2026-07-08)

- fix(jobs): TD-17 — unknown job kinds no longer hard-fail.
  - server/jobs/runner.ts (tick, no-handler branch): a claimed job whose
    kind has no handler in this worker is released back to queued with
    nextRunAt += 60s (UNKNOWN_KIND_RETRY_MS) and lastError "No handler
    registered for kind: X", so a capable worker (newer deploy, or the
    healthy sibling of a TD-16 stale worker) can claim it. If the job is
    still unknown 24h after created_at (UNKNOWN_KIND_MAX_AGE_MS), it
    fails terminally with "no handler appeared within 24h of creation" —
    covers typo'd/retired kinds without eternal requeue.
  - attempts is NOT incremented on the unknown-kind path: it means
    "handler executed and threw", and with maxAttempts=3 + 60s delay an
    attempts-based cap would fire in ~3 minutes, shorter than a normal
    deploy window (the observed TD-16 zombie lived 3.5 days).
  - Startup-order path ruled out during scoping: server/index.ts
    registers all handlers before jobRunner.start(db), so a single
    healthy process never ticks before its handlers exist.
  - TDD: existing no-handler test rewritten to the new contract + 2 new
    tests (24h-cap failure; late-registered handler picks the job up),
    confirmed failing first. 777 tests passing.

---

## Post-Sprint Work This Session (v1.30.0, 2026-07-08)

- feat (B-26): Mentions section collapse + server-side pagination.
  - server/storage/mentionStore.ts: listByClient() now orders newest first
    (id DESC) and accepts optional { limit, offset } (SQLite LIMIT -1 =
    unlimited keeps unpaged callers — CSV export in jobs/handlers.ts and
    routes/sources.ts — returning all rows, now newest first). New
    countByClient() for pagination totals.
  - server/routes/metrics.ts: GET /api/clients/:id/mentions accepts
    limit/offset query params (400 INVALID_PAGINATION on non-integer or
    negative values); response envelope changed from { data: [...] } to
    { data: { mentions, total } }. MentionsSection was the only consumer.
  - client/src/pages/ai/sections/MentionsSection.tsx: shows first 20
    mentions; "Show more" loads 20 more per click (query refetch with a
    larger limit), "Show less" collapses back, "Showing X of Y" count
    label. Footer hidden entirely when total fits one page.
  - Archive (the third B-26 ask) deliberately deferred — re-parse deletes
    and recreates mention rows, so per-mention archived state would not
    survive; see Resume From note.
  - TDD: 7 new tests written first and confirmed failing (2 store, 2
    route + 1 updated to the new envelope, 3 client in new
    MentionsSection.test.tsx); ClientDetail.test.tsx mentions fixture
    updated to the new URL/envelope. 775 tests passing.

---

## Post-Sprint Work This Session (v1.29.0, 2026-07-07)

- feat(factory): Slice 1 — factory job intake + execution wiring, first
  production cell. Decisions recorded in the design doc: existing job
  runner executes factory jobs; reporting/ETL is the first cell.
  - shared/schema.ts: factory_jobs gains output (JSON), approved_by,
    approved_at. Migration 0016_fair_carnage.sql.
  - server/storage/factoryJobStore.ts: get(), approve(id, userId) (audit
    fields + release to queued), setOutput().
  - server/routes/factory.ts (new): POST /api/factory/jobs (validates the
    contract with factoryJobSchema — 400 INVALID_CONTRACT with zod details,
    404 CLIENT_NOT_FOUND, 409 DUPLICATE_JOB_ID; enqueues factory-run unless
    the contract requires approval), POST /api/factory/jobs/:id/approve
    (409 NOT_AWAITING_APPROVAL; records approver, enqueues), GET
    /api/factory/jobs (clientId/status/limit filters). Admin roles only.
  - server/jobs/factory.ts (new): factory-run dispatcher — loads the
    factory job, skips held/terminal statuses, routes to the production
    cell registered for its jobType, writes running/done/failed + output
    back; cell errors rethrow so the runner's retry/backoff applies.
  - server/services/factory/reportingCell.ts (new): reporting.monthly-
    pipeline cell — validates periodStart/periodEnd input, requires a GA4
    integration, dry run returns config checks without extracting, real
    run returns the AI-traffic summary (sessions, engagement,
    pages/session, conversion rate, referrers) via Ga4Service with OAuth
    token refresh persisted.
  - server/index.ts registers the dispatcher with the reporting cell;
    server/routes/index.ts registers the factory routes.
  - TDD throughout: 30 new tests (4 store, 12 routes, 7 dispatcher, 7 cell
    on top of v1.28.0's 17), each suite confirmed failing before
    implementation. 768 tests passing.

---

## Post-Sprint Work This Session (v1.28.0, 2026-07-07)

- feat(factory): Lights-Out SEO Factory Phase 1 foundations. New design doc
  docs/lights-out-seo-factory.md (production-cell architecture, approval
  gates, phased build sequence). Decision recorded in Section 3: the portal
  database is the single source of truth for client production
  configuration; YAML is import/export serialization only, validated by the
  same schema.
  - shared/factory/job-contract.ts: Factory Job Contract v1 as a zod schema
    (contractVersion literal "1.0", jobId, integer clientId = portal client
    row id, dot-namespaced jobType, priority enum low/normal/high, ISO-8601
    createdAt, input record, execution dryRun/approvalRequired flags).
    validateFactoryJob() type guard derives from the schema (replaces an
    unsound hand-rolled predicate from initial scaffolding).
  - shared/schema.ts: factory_jobs table + FACTORY_JOB_STATUSES (queued,
    awaiting_approval, running, qa_failed, done, failed, cancelled) +
    FactoryJobRecord type. Migration 0015_motionless_rachel_grey.sql.
  - server/storage.ts: SCHEMA_SQL gains factory_jobs.
  - server/storage/factoryJobStore.ts (new): create() from a validated
    contract (status queued, or awaiting_approval when the contract requires
    approval; unique jobId enforced), getByJobId(), list() with
    clientId/status/limit filters newest-first, updateStatus() with
    lastError.
  - TDD: tests/server/factory/job-contract.test.ts (11) and
    tests/server/storage/factoryJobs.test.ts (6) written first and confirmed
    failing for the right reasons. 738 tests passing (17 new).

---

## Post-Sprint Work This Session (v1.22.1 - v1.24.0, 2026-07-03)

- v1.22.1 fix(ga4): exchangeCode() now validates the granted `scope` field
  from Google's token response and rejects grants missing analytics.readonly
  with a "tick the Google Analytics checkbox" message. Root cause of the
  camphousecountrylandscaping.com 403 ACCESS_TOKEN_SCOPE_INSUFFICIENT:
  Google's granular consent screen lets the user connect without granting
  Analytics; the portal silently stored the useless token. Troubleshooting
  entry added to system-documentation.md Section 1B Step 4. 3 new tests
  (668 passing).
- v1.23.0 feat (B-21): "Run with AI" collects launch inputs and strips
  unfilled tokens. Workflows with inputs open LaunchInputsDialog in a new
  "ai-run" mode before running; run-with-file accepts application/json
  { csv, inputValues } alongside legacy text/csv; buildCsvRunPrompt fills
  <PASTE> tokens (blank/missing value = unfilled) then strips any line
  still containing a token, on both body paths. 10 new tests (678 passing).
- v1.24.0 feat (B-18): prompt collection CRUD completed. Store gains
  setStatus/countRuns/delete (delete cascades prompts + run schedules);
  routes gain POST archive/unarchive (editor roles) and DELETE (admin
  roles, 409 COLLECTION_IN_USE while runs exist); PromptCollections.tsx
  gains inline name/notes edit, clone, archive/restore, and delete with
  inline confirm. 19 new tests (697 passing).
- v1.26.0 feat (B-22): per-workflow AI model for Run with AI.
  workflows.aiAdapterSlug column (migration 0013_special_pride.sql);
  runWorkflowWithCsv honors it (503 ADAPTER_NOT_CONFIGURED if the chosen
  platform has no key); WorkflowDialog "AI model for Run with AI" select
  shown when Accept CSV upload is on. Root cause of "generic suggestions"
  from Run with AI: it never executes the Perplexity skill - it is a plain
  API call to the first configured adapter; pair with the methodology block
  in docs/ranking-audit-ai-run-methodology.md. 7 new tests (708 passing).
- v1.27.0 feat (B-23): shared launch-input persistence. New
  workflow_input_values table (migration 0014_cute_iron_patriot.sql),
  WorkflowInputValueStore, GET/PUT /api/workflows/:id/input-values;
  LaunchInputsDialog prefills saved values on open and persists non-blank
  values on Launch / Run with AI. Values shared across users. 13 new tests
  (721 passing).
- v1.25.0 feat (UI, closes B-17): breadcrumb navigation. New shared
  client/src/components/Breadcrumbs.tsx (Breadcrumbs component +
  useClientName hook) replaces the ad-hoc "Back to X" links on all 12
  AI-module and admin pages with a clickable trail that always shows the
  client being worked on (user request: "which client am I on when I'm on
  Integrations & API Keys"). Also fixed the dead "Back to Sentiment" link
  on ReviewQueue (target route was removed in v1.4.0). 701 tests passing.

---

## Post-Sprint Work This Session (v1.22.0, 2026-07-02 - 2026-07-03)

- Fix/Feature: launch-mode plan with persistent post-launch instructions
  (commit ca622e7). Root cause of "Start Audit just opens
  perplexity.ai/computer": Perplexity /computer?q= prefills the input but
  never auto-submits (verified live; only /search auto-submits), and prompts
  over the 1800-char encoded URL cap silently fell back to a transient toast.
  - client/src/lib/launchUtils.ts: new getLaunchPlan() (auto-submit only for
    /search, prefill for other Perplexity paths, clipboard otherwise) and
    hasSensitiveInputLabel() (password/token/secret/api-key input labels force
    clipboard mode so prompts never travel in URLs).
  - client/src/components/LaunchInputsDialog.tsx: transient toast replaced
    with a persistent in-dialog instruction step (paste or press-Enter
    guidance, Copy prompt + Done buttons).
  - TDD: 13 new tests written first; 665 total passing. Deployed to
    production and user-confirmed.
- Production data fixes (no code; applied via authenticated /api/workflows):
  - Workflow 20 renamed "Ranking Audit and Improvement Suite", absorbing
    duplicate workflow 21's richer description and "Start Audit" label;
    workflow 21 deleted (portal now 20 workflows). Prompt rewritten with 14
    <PASTE> tokens (7 required + 7 optional inputs) — previously it had zero
    tokens, so all user-entered launch inputs were silently discarded.
  - Keyword filter corrected from implicit AND to explicit UNION/OR
    (Tag = Root Keyword OR # of Searches > 10000 after cleaning) in the
    workflow prompt AND in the Perplexity skill
    seo-rank-and-gbp-growth-planner SKILL.md (4 places, edited via the
    skill editor's Monaco instance). Both now require reporting
    per-condition match counts in the "Filtered keyword set" section.
- Research (structured GBP snapshot for audits): Google Takeout's GBP export
  is an undocumented internal dump — per-location data.json is the Business
  Information API Location resource, plus reviews.json / placeQa.json and
  media files (bulk of the 2GB). User's export covers 27 locations but NOT
  United Structural Systems (managed under a different Google account).
  Instant scoped alternative: business.google.com/locations > select profile
  > Actions > Download > Businesses (spreadsheet; includes secondary
  categories but not services/Q&A). Long-term fix: B-20 GBP API integration.

## Post-Sprint Work This Session (v1.21.0)

- Feature: Optional Inputs section on workflow cards. Optional inputs behave
  like required ones but are skippable: they render as a second
  "Optional inputs" list on the card, appear in the Launch dialog after the
  required fields labeled "(optional)", and their values fill the prompt's
  <PASTE> tokens after the required values (blank optional values fill as
  empty text). The launch dialog now also opens when a workflow has only
  optional inputs.
  - shared/schema.ts: `workflows.optionalInputs` JSON-array column,
    `insertWorkflowSchema` array default [], `Workflow` type field.
    Migration 0012_goofy_jubilee.sql.
  - server/storage.ts: SCHEMA_SQL gains `optional_inputs`.
  - server/storage/workflowStore.ts: hydrate/create/update carry the field.
  - client/src/components/WorkflowCard.tsx: "Optional inputs" bullet list
    (muted styling); launch-dialog condition now inputs + optionalInputs.
  - client/src/components/LaunchInputsDialog.tsx: optional fields render
    after required ones with "(optional)" labels; fill order is
    [...requiredValues, ...optionalValues].
  - client/src/components/WorkflowDialog.tsx: "Optional inputs" textarea
    (one per line) with a hint about <PASTE> token order.
  - New tests: storage.test.ts (+2), WorkflowCard.test.tsx (+3),
    LaunchInputsDialog.test.tsx (new, 3), WorkflowDialog.test.tsx (+1).
  - 651 tests passing (9 new). TDD cycle followed.
  - Note: "Required" inputs remain unenforced at launch (pre-existing
    behavior, unchanged) — flagged to user; enforcement is a possible
    follow-up.

## Post-Sprint Work This Session (v1.20.0)

- Feature: Workflow CSV upload + AI run (Option B of the file-upload
  operational question). A workflow can now be flagged "Accept CSV upload";
  its card then shows a file picker + "Run with AI" button. The file's text
  is POSTed as text/csv (never written to disk), embedded whole into the
  workflow's prompt, sent to the first configured LLM adapter, and the
  response renders in a dismissible panel on the card.
  - shared/schema.ts: `workflows.acceptsFileUpload` column (integer, default
    0), `insertWorkflowSchema` boolean default false, `Workflow` type field.
    Migration 0011_nervous_kronos.sql.
  - server/storage.ts: SCHEMA_SQL gains `accepts_file_upload`.
  - server/storage/workflowStore.ts: hydrate/create/update carry the flag.
  - server/services/workflowFileRun.ts (new): `countCsvDataRows`,
    `buildCsvRunPrompt` (embeds full CSV + row count + optional filename),
    `runWorkflowWithCsv` (reuses `pickGenerationAdapter` from
    promptGenerator — 503 NO_GENERATION_ADAPTER if no LLM key configured).
  - server/routes/workflows.ts: new `POST /api/workflows/:id/run-with-file`
    (requireAuth) — route-level `express.text({ type: text/csv, limit: 5MB })`
    bypasses the app-wide 100kb JSON parser; guards: 400 invalid id,
    404 not found, 400 FILE_UPLOAD_NOT_ENABLED, 400 EMPTY_FILE. Returns
    `{ data: { response, modelVariant, latencyMs } }`. No multer, no
    multipart, no temp files — the CSV travels as a raw text body.
  - client/src/components/WorkflowCard.tsx: upload section (file input +
    Run with AI button + response panel) rendered only when
    `acceptsFileUpload` is true; uses `File.text()` client-side.
  - client/src/components/WorkflowDialog.tsx: "Accept CSV upload" switch.
  - tests/setup.ts: added jsdom polyfills — ResizeObserver stub (Radix
    Select) and Blob.prototype.text via FileReader.
  - New tests: tests/server/services/workflowFileRun.test.ts (7),
    tests/server/workflows.filerun.test.ts (7), storage.test.ts (+2),
    WorkflowCard.test.tsx (new, 4), WorkflowDialog.test.tsx (new, 2).
  - 642 tests passing (22 new). TDD cycle followed (tests written first,
    confirmed failing for the right reasons).
  - Sizing note: a 248 KB / 2,192-row CSV ≈ 63k tokens — fits whole in all
    configured LLM contexts; no preprocessor/truncation needed. The 5 MB
    limit is the guard rail.

---

## Post-Sprint Work This Session (v1.19.0)

- Feature: B-20 — Prompt template tokens for Prompt Collections.
  - New `server/services/promptTokens.ts`: pure `buildPromptTokenContext` and
    `expandPromptText` functions. `{{brand}}` -> client's primary brand
    (first `brands` row with kind "client", else `client.name`).
    `{{city}}`/`{{geo}}` -> `prompt.geo` if set, else
    `client.geographies[0]`, else `""`. `{{competitor}}` fans the prompt out
    into one response per configured competitor brand (or `""` with a single
    response if none configured).
  - `server/routes/runs.ts` (`POST /api/clients/:id/runs`) and
    `server/jobs/handlers.ts` (`schedule-tick`) both look up the client and
    its brands, build a `ClientBrandContext`, expand each prompt's text, and
    create one response per expanded query string per platform. `totalPrompts`
    now reflects the expanded count.
  - `PromptCollectionDetail.tsx`: add-prompt form shows a hint listing the
    available tokens and the {{competitor}} fan-out behavior.
  - `docs/system-documentation.md`: new Section 3.5 "Prompt Template Tokens"
    documents the token table, resolution rules, and a worked example; updated
    Section 2.1 to note prompt text is expanded before being sent to the AI
    platform.

---

## Post-Sprint Work This Session (v1.18.0)

- Feature: B-19 follow-up — convert schedule times from UTC to the browser's
  local timezone for display and input, with no persisted timezone setting
  (uses native `Date` local getters/setters, grabbed from the browser).
  - New `client/src/lib/scheduleTiming.ts`: pure conversion helpers
    `utcToLocalWeekly`, `localToUtcWeekly`, `utcHourToLocalHour`,
    `localHourToUtcHour`.
  - `PromptCollectionDetail.tsx`:
    - `formatCadence()` now shows weekly schedules fully in local time (day +
      hour, e.g. "Weekly on Tuesday at 07:00") and monthly schedules with the
      day-of-month labeled "(UTC date)" but the hour converted to local time.
    - The add-schedule form's "Day of week" and "Hour (local time)" inputs
      collect local values; on submit they are converted to `dayOfWeek` /
      `hourUtc` via `localToUtcWeekly` (weekly) or `localHourToUtcHour`
      (monthly) before posting to `/api/clients/:id/schedules`. "Day of month
      (UTC date)" is unchanged/unconverted.
  - New tests: `client/src/lib/scheduleTiming.test.ts` (6, pinned to
    America/New_York/EST for determinism); updated 2 of the 4
    `PromptCollectionDetail.test.tsx` Schedules tests to pin
    `process.env.TZ = "America/Phoenix"` (UTC-7, no DST) and assert local-time
    display/conversion.
  - 606 tests passing (6 new).

## Post-Sprint Work This Session (v1.17.0)

- Feature: B-19 — recurring AEO/GEO prompt run schedules now actually run.
  - New `server/services/scheduling.ts`: `computeNextFireAt({cadence,
    hourUtc, dayOfWeek?, dayOfMonth?}, from?)` (pure, UTC-based, correctly
    handles weekly day-of-week and monthly day-of-month rollover) and
    `SCHEDULE_TICK_INTERVAL_MS` (1 hour).
  - `server/routes/runs.ts`: POST `/api/clients/:id/schedules` and PATCH
    `/api/schedules/:id` now compute/recompute `nextFireAt` via
    `computeNextFireAt` when not explicitly provided.
  - `server/jobs/runner.ts`: new `JobRunner.seedRecurring(kind, payload?)`
    enqueues a job of that kind only if none is already queued/running.
  - `server/jobs/handlers.ts`: `schedule-tick` now uses the new
    `computeNextFireAt` (honoring dayOfWeek/dayOfMonth) when marking a
    schedule fired, and self-re-enqueues via
    `runner.enqueue("schedule-tick", {}, now + SCHEDULE_TICK_INTERVAL_MS)`.
  - `server/index.ts`: calls `jobRunner.seedRecurring("schedule-tick")` after
    `jobRunner.start(db)` so the recurring chain is bootstrapped on startup.
  - New "Schedules" section on `PromptCollectionDetail.tsx`: lists schedules
    for the collection with a cadence summary ("Weekly on Tuesday at 14:00
    UTC") and next-run time; super_admin/agency_admin can add a schedule
    (cadence, day-of-week/month, hour UTC, platforms), toggle enabled, and
    delete.
  - New tests: `tests/server/services/scheduling.test.ts` (7),
    `tests/server/jobs/runner.test.ts` (+3 seedRecurring),
    `tests/server/jobs/handlers.test.ts` (new, 3),
    `tests/server/runs.routes.test.ts` (+2 nextFireAt compute/recompute),
    `PromptCollectionDetail.test.tsx` (+4 Schedules section).
  - 600 tests passing (22 new).

## Post-Sprint Work This Session (v1.16.0)

- Feature: B-15 v1.1 — per-client readiness on ClientDetail. New
  `GET /api/clients/:id/readiness` (server/routes/clients.ts, reuses
  `computeReadiness` from server/services/clientReadiness.ts, 404s if the
  client doesn't exist). ClientDetail.tsx now shows an orange "Setup
  incomplete" banner (matching the Perplexity-key-warning style) listing
  the readiness issues for that client when `ready` is false.
  - New tests: GET /api/clients/:id/readiness in
    tests/server/clients.routes.test.ts (3), ClientDetail.test.tsx banner
    test (1).
  - 578 tests passing (5 new).

## Post-Sprint Work This Session (v1.15.0)

- Feature: B-15 v1 — Client Run-Readiness. New `shared/schema.ts` type
  `ClientReadiness` and `server/services/clientReadiness.ts`
  (`computeReadiness`, `computeReadinessForAllClients`) check, per client:
  a client brand exists, at least one competitor brand has aliases, and an
  active prompt collection has at least one prompt. New
  `GET /api/clients/readiness` route (server/routes/clients.ts, registered
  before `/api/clients/:id` to avoid route collision) returns
  `{ data: ClientReadiness[] }`.
  - ClientsList.tsx (`/ai/clients`) shows a green "Ready" badge per client,
    or an amber "Setup incomplete (N)" badge that expands on click to list
    the specific issues (e.g. "No competitor brands defined - AI Share of
    Voice will be meaningless", "No active prompt collection with prompts").
  - New tests: tests/server/services/clientReadiness.test.ts (6),
    GET /api/clients/readiness in tests/server/clients.routes.test.ts (2),
    ClientsList.test.tsx readiness badges (1).
  - 573 tests passing (9 new).

## Post-Sprint Work This Session (v1.14.0)

- Feature: B-13 — Edit existing prompts. PromptCollectionDetail.tsx adds an
  Edit (pencil) button per prompt that opens an inline text/category editor;
  Save calls the existing `PATCH /api/prompts/:id` with the full prompt
  payload (text, category, funnelStage, geo, deviceContext, priorityWeight,
  status, targetPlatforms, position) so `insertPromptSchema` defaults don't
  overwrite fields not present in a partial payload. No backend changes
  needed — `PromptStore.update()` and the PATCH route already existed.
  - New test: PromptCollectionDetail.test.tsx ("Edit reveals an editable
    form and Save PATCHes the prompt, preserving other fields").
  - 564 tests passing (1 new).

## Post-Sprint Work This Session (v1.13.1)

- Fix: /ai/clients list was unsorted (insertion order). `ClientStore.list()`
  (server/storage/clientStore.ts) now orders by `lower(name)` ascending, so
  the Clients list renders alphabetically (case-insensitive).
  - New test: tests/server/storage/clients.test.ts ("returns clients sorted
    alphabetically by name, case-insensitive").
  - 563 tests passing (1 new).

## Post-Sprint Work This Session (v1.13.0)

- Feature: B-12 — AI-assisted prompt generation for Prompt Collections.
  - shared/schema.ts: replaced `PROMPT_CATEGORIES` with the 6 B-12 types
    (informational, comparative, commercial, local, problem_aware,
    alternative); added `generatePromptsSchema` and `GeneratedPromptCandidate`
    type. No migration needed — the `prompts.category` column is free TEXT.
  - server/services/promptGenerator.ts (new): `pickGenerationAdapter` (first
    configured adapter by fixed preference order, throws AppError 503
    NO_GENERATION_ADAPTER if none), `buildGenerationPrompt` (client/brand/
    competitor/geo context + the 6 category definitions), `parseGeneratedPrompts`
    (defensive JSON parsing — handles fenced code blocks and surrounding prose,
    drops invalid items), `generatePrompts` (orchestration, no DB writes).
  - server/routes/prompts.ts: new `POST
    /api/clients/:clientId/prompt-collections/:id/generate-prompts`
    (EDITOR_ROLES) — gathers client + brand/competitor context, calls
    `generatePrompts`, returns `{ candidates }`. Generation is
    generate-then-review; persisting reuses the existing
    `POST /api/prompt-collections/:id/prompts/bulk`.
  - client/src/pages/ai/PromptCollectionDetail.tsx: "Generate with AI" button,
    review panel (per-candidate checkbox + editable text/category), "Save
    selected" -> bulk import. `CATEGORY_LABELS` updated to the 6 new types.
  - New/updated tests: tests/server/services/promptGenerator.test.ts (new, 9
    tests), tests/server/prompts.routes.test.ts (extended, generate-prompts
    route incl. 503/404/role checks; legacy category values in existing tests
    updated to the new taxonomy), client/src/pages/ai/PromptCollectionDetail.test.tsx
    (new, 2 tests).
  - 562 tests passing (17 new). No DB migration.

## Post-Sprint Work This Session (v1.12.0)

- Feature: B-11 Phase 2 follow-ups — add-custom-platform form + per-client LLM
  connection status.
  - client/src/pages/admin/Platforms.tsx: added an "Add platform" form
    (slug + display name inputs) wired to `POST /api/platforms` via a new
    `createMutation`. Client-side validation mirrors the server's
    `insertPlatformSchema` slug regex (`^[a-z0-9-]+$`) to disable Submit on
    invalid input; a 409 duplicate-slug response renders an inline error.
  - client/src/pages/ai/Integrations.tsx: replaced the Perplexity-only "API
    Key" section with a generalized "AI Platform API Keys" section listing all
    catalog platforms (via `/api/platforms`), each with a Connected /
    Not-configured badge driven by `config.configuredPlatforms`. Not-configured
    platforms show an env-var setup hint (slug -> env var map matching
    server/adapters/registry.ts); the Perplexity-specific
    `PERPLEXITY_DAILY_USD_LIMIT` note is preserved. GA4 section unchanged.
  - New/updated tests: client/src/pages/admin/Platforms.test.tsx (3 new —
    add-platform POST, disabled submit on invalid slug, duplicate-slug error),
    client/src/pages/ai/Integrations.test.tsx (2 new — all-platform status
    badges, env-var hint rendering).
  - 545 tests passing (5 new). No server/schema/migration changes.

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
| TD-16 | Medium | Open | Stale lsnode worker processes can survive a cPanel "Restart" of the Node app, causing env-var drift: a worker started before an env var was added/changed keeps its old `process.env` snapshot (registry.ts builds `_adapters` once at module load), so jobs claimed by that worker fail even though the env var is correctly set for new workers. Observed after adding `OPENAI_API_KEY` — 3/10 prompt-run jobs failed with "No adapter configured for platform: openai" while 7/10 (handled by the new worker) succeeded. RECURRED during v1.29.0 QA (2026-07-07): a 3.5-day-old worker (predating v1.28.0) survived BOTH a cPanel Restart AND a full Stop/Start and kept failing factory-run jobs with "No handler registered". Only an SSH `kill <pid>` removed it. Severity raised Low->Medium: every deploy must now include the SSH `ps -eo pid,etime,cmd \| grep -i node` check + kill of old PIDs. | ops/cPanel deployment |
| TD-17 | Medium | Done | JobRunner hard-failed jobs with unknown kinds ("No handler registered for kind: X") instead of leaving them queued, so during mixed-version deploy windows (or with a TD-16 stale worker) an old worker permanently failed jobs a newer worker could process. FIXED in v1.30.1: unknown-kind jobs are released back to queued with a 60s nextRunAt delay and a descriptive lastError so a capable worker can claim them; if no capable worker claims the job within 24h of creation (UNKNOWN_KIND_MAX_AGE_MS — covers typo'd or retired kinds), it fails terminally with "no handler appeared within 24h". attempts is deliberately not incremented (it means "handler executed and threw"). | server/jobs/runner.ts (tick, no-handler branch) |
| TD-18 | High | Done | All GA4 refresh tokens minted before 2026-07-07 would expire with invalid_grant: the Google OAuth consent screen (project 551074775331) was in "Testing" publishing status, which caps refresh-token life at 7 days. Published to "In production" on 2026-07-07 (new tokens long-lived), but Testing-era tokens kept their 7-day clock. RESOLVED 2026-07-08: every GA4-connected client was disconnected and reconnected via the portal UI under the published app (Analytics checkbox ticked, property IDs re-selected) and every integration Test passes on a post-publish connection. | ops/Google Cloud OAuth; client Integrations |
| TD-19 | Low | Open | No non-interactive SSH access to production from the dev machine. Server side FIXED 2026-07-08: the local ~/.ssh/workflow-portal public key is in authorized_keys and the server accepts it. Remaining local blocker: the private key is passphrase-protected and the Windows ssh-agent service is Stopped/Disabled, so BatchMode auth fails at the signing step. Fix (admin PowerShell): Set-Service ssh-agent -StartupType Automatic; Start-Service ssh-agent; then ssh-add the key once. Until fixed, live-DB questions require interactive password SSH by the user. | ops/local dev environment |

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
  (DELETE, with 409 PLATFORM_IN_USE surfaced via toast). **Phase 2 follow-ups
  (v1.12.0) COMPLETE** — `/admin/platforms` now has an "add custom platform"
  form (POST /api/platforms), and Integrations.tsx shows connection status +
  env-var hints for all 7 catalog platforms.
- B-12 Feature: AI-assisted prompt generation for Prompt Collections — **COMPLETE
  (v1.13.0)**. When working on a Prompt Collection, the analyst can click
  "Generate with AI" to have the first configured LLM adapter research and
  generate candidate prompts from the client's Brand, website domain,
  geographies, and configured competitors. `PROMPT_CATEGORIES` was replaced
  with the 6 B-12 types: informational, comparative, commercial, local,
  problem_aware, alternative (no migration needed — free TEXT column).
  Generation is generate-then-review: `POST
  /api/clients/:clientId/prompt-collections/:id/generate-prompts` returns
  candidates (not persisted); the analyst reviews/edits/deselects in a panel,
  then "Save selected" reuses the existing `POST
  /api/prompt-collections/:id/prompts/bulk` endpoint. New service
  `server/services/promptGenerator.ts` (pickGenerationAdapter,
  buildGenerationPrompt, parseGeneratedPrompts, generatePrompts) — returns 503
  NO_GENERATION_ADAPTER if no LLM key is configured.
- B-13 Feature: Edit existing prompts — **COMPLETE (v1.14.0)**. Each prompt row on
  PromptCollectionDetail has an Edit action that opens an inline text/category
  editor; Save PATCHes /api/prompts/:id with the full prompt payload.
- B-19 Feature: Recurring AEO/GEO prompt run schedules — **COMPLETE (v1.17.0)**.
  Previously the `run_schedules` table, store, and CRUD API existed but the
  `schedule-tick` job handler was registered and never enqueued, so prompts
  only ever ran via manual "Run Now". New `server/services/scheduling.ts`
  (`computeNextFireAt`, `SCHEDULE_TICK_INTERVAL_MS` = 1 hour) computes the
  next UTC fire time for weekly (day-of-week) or monthly (day-of-month)
  cadences, replacing the old helper that ignored those fields. POST/PATCH
  `/api/clients/:id/schedules` and `/api/schedules/:id` now compute/recompute
  `nextFireAt` on create and on timing-field changes. New
  `JobRunner.seedRecurring(kind)` enqueues a `schedule-tick` job on startup
  only if one isn't already queued/running (server/index.ts); the handler now
  self-re-enqueues every `SCHEDULE_TICK_INTERVAL_MS`. New "Schedules" section
  on PromptCollectionDetail.tsx lists schedules with a cadence summary and
  next-run time; super_admin/agency_admin can add, enable/disable, and delete
  schedules.
- B-20 Feature: Prompt template tokens ({{brand}}, {{competitor}}, {{city}}/
  {{geo}}) — **COMPLETE (v1.19.0)**. Prompt text can now include `{{brand}}`
  (client's primary brand, falling back to client.name), `{{city}}`/`{{geo}}`
  (prompt.geo, falling back to client's first geography, else empty string),
  and `{{competitor}}` (fans the prompt out into one response per configured
  competitor; resolves to an empty string with a single response if no
  competitors are configured). Substitution happens at run time (not baked
  into stored prompt.text) for both the manual run trigger
  (`POST /api/clients/:id/runs`) and the recurring `schedule-tick` handler.
  New pure service `server/services/promptTokens.ts`
  (`buildPromptTokenContext`, `expandPromptText`), shared by both call sites.
  PromptCollectionDetail's add-prompt form now shows a hint listing the
  available tokens. docs/system-documentation.md Section 3.5 documents the
  token table and fan-out behavior.

### Medium Priority
- B-18 Full CRUD UI for Prompt Collections — **COMPLETE (v1.24.0)**.
  PromptCollections.tsx now has per-collection actions: inline edit of
  name/notes (PATCH), clone-as-draft (existing endpoint, new UI), archive/
  restore (new POST /api/prompt-collections/:id/archive and /unarchive,
  editor roles), and hard delete (new DELETE /api/prompt-collections/:id,
  admin roles, inline confirm step, 409 COLLECTION_IN_USE while runs
  reference the collection; delete cascades the collection's prompts and
  run schedules).
- B-17 Client-name indicator on Integrations & API Keys — **COMPLETE
  (v1.25.0)**, superseded by the breadcrumb navigation feature: every
  client-scoped page now shows Workflows > Clients > {client name} > {page}
  as a clickable trail.
- B-20 Feature: GBP snapshot integration. Once Google Business Profile API
  access is approved (application in progress 2026-07-03), add a per-client
  "GBP snapshot" action that OAuth-connects (reuse the GA4 integration
  pattern), calls the Business Information API (locations.get: categories,
  serviceItems, regularHours, attributes, serviceArea, profile) plus the
  legacy v4.9 reviews endpoint and Q&A API, and produces the structured
  snapshot JSON the "Ranking Audit and Improvement Suite" workflow expects.
  Approval check: Business Profile API quota 0 QPM = pending, 300 QPM =
  approved. Note: OAuth tokens are per-user; some client profiles (e.g.
  United Structural Systems) live under a different Google account and need
  their own connection.
- B-21 Feature: "Run with AI" input collection — **COMPLETE (v1.23.0)**.
  Workflows with inputs open the launch inputs dialog (new "ai-run" mode)
  before the CSV run; values fill the prompt's <PASTE> tokens server-side
  (run-with-file accepts application/json { csv, inputValues }); any line
  whose token is still unfilled is stripped before the prompt reaches the
  model, on both the JSON and legacy text/csv paths.
- B-22 Feature: per-workflow AI model selection for "Run with AI" —
  **COMPLETE (v1.26.0)**. `workflows.aiAdapterSlug` (null = default order
  openai > anthropic > gemini > perplexity), WorkflowDialog model select,
  503 ADAPTER_NOT_CONFIGURED when the chosen platform has no API key.
  Pairs with docs/ranking-audit-ai-run-methodology.md (block to paste into
  workflow 20's prompt so API runs follow the skill's rules).
- B-23 Feature: launch-input persistence — **COMPLETE (v1.27.0)**.
  Last-used values stored server-side per workflow + input label
  (workflow_input_values), shared across users/machines;
  LaunchInputsDialog prefills them on open and updates non-blank values on
  every Launch / Run with AI.
- B-24 Feature: tooltips for operators who weren't involved in building the
  tool. Add shadcn Tooltip explanations to launch-dialog input fields
  (what each value is, where to find it, example), workflow card action
  icons, and the AI Visibility setup controls (brands, aliases, prompt
  categories).
- B-25 Feature: in-app Help / system documentation. Surface
  docs/system-documentation.md (and the workflow methodology docs) inside
  the portal - a /help route with rendered markdown, section navigation,
  and a Help link in the top nav - so operators don't need repo access to
  read setup and troubleshooting guides.
- B-26 Feature: Mentions view is too long (user request 2026-07-07).
  **(a) collapse + (b) pagination COMPLETE (v1.30.0)** — GET
  /api/clients/:id/mentions takes limit/offset (newest first, returns
  { mentions, total }); MentionsSection shows 20 with Show more / Show
  less and a "Showing X of Y" label. **(c) archive DEFERRED by user
  decision 2026-07-08**: parse-response deletes and recreates mention
  rows on every re-parse, so a per-mention archived flag would be wiped;
  only worth building as response-level archiving or a separate
  hidden-matches table if the need returns.
- B-04 Seed data versioning strategy (allow adding/updating workflows without full redeploy)
- B-06 Session store: session expiry cleanup configuration review
- B-15 v1 DONE (v1.15.0): Client Run-Readiness badges on /ai/clients (Ready /
  Setup incomplete with itemized issues) catch the missing-competitors gap that
  caused Salvo's AI SoV to read 0%/100% (see system-documentation.md Section 1B
  Step 2 note, added 2026-06-12). Remaining for a v2: turn the issues list into
  a guided onboarding wizard/checklist that links directly to the page where
  each fix is made (add brand, add competitor + aliases, create prompt
  collection), per the 6 manual setup steps in Section 1B.

### Low Priority
- B-08 skipLibCheck: false in tsconfig
- B-09 Local dev server fix for Windows (remaining socket/network issues)
- B-10 Evaluate replacing better-sqlite3-session-store (deprecated)
- B-14 Display the app version number (from package.json) in the footer of every page —
  currently Home.tsx has a one-off footer but no shared layout footer exists across routes.
