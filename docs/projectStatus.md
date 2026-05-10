## Resume From

Last session: 2026-05-10
Last commit: 21a8a3c feat(sprint-5): sentiment classification, annotations, CSV exports — v0.8.0
Branch: feature/ai-visibility-module | Version: v0.8.0 | 357 tests passing
Main branch: v0.2.7 (last production deploy — portal UP)

Pick up from:
1. Delete local data.db + sessions.db before npm run dev (migration 0007 must apply cleanly)
2. Begin Sprint 6 — Sources, Recommendations, Share Links (v0.9.0)

---

## Current Sprint — AI Visibility Sprint 6 — Sources, Recommendations, Share Links

**Goal:** Citation domain analysis, derived recommendations from detected gaps, signed share-link delivery.
**Status: IN PROGRESS**
**Version target: v0.9.0**

### Milestones

- [ ] Schema: share_tokens table; Migration 0008_*.sql
- [ ] Services: sources.ts, recommendations.ts, shareLink.ts
- [ ] Routes: server/routes/sources.ts (sources + recommendations + share links + public token endpoint)
- [ ] UI: Sources, Recommendations, SharePage pages + ClientDetail nav links
- [ ] Tests: domain extraction, recommendation rules, token verification/expiry/revocation

---

## Previous Sprints (AI Visibility Module)
- [ ] Services: server/services/parser.ts, server/services/scoring.ts
- [ ] Job kinds: parse-response (auto on insert), aggregate-snapshot-daily
- [ ] Routes: server/routes/metrics.ts (6 endpoints)
- [ ] UI: Overview dashboard (KPI cards + recharts trend lines), MentionsList, SoV chart
- [ ] Tests: parser precision/recall fixtures, scoring formula correctness, metric routes

---

## AI Visibility Module — Sprint Roadmap

Full spec: `docs/ai-visibility-reporting-spec.md`
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
| Sprint 6 | Sources, recommendations, share links | v0.9.0 | IN PROGRESS |
| Sprint 7 | GA4 integration, calibration harness | v1.0.0 | - |

---

## Previous Sprints (AI Visibility Module)

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

---

## Backlog (post-AI-module)

### Medium Priority
- B-04 Seed data versioning strategy (allow adding/updating workflows without full redeploy)
- B-06 Session store: session expiry cleanup configuration review

### Low Priority
- B-08 skipLibCheck: false in tsconfig
- B-09 Local dev server fix for Windows (remaining socket/network issues)
- B-10 Evaluate replacing better-sqlite3-session-store (deprecated)
