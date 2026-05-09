## Resume From

Last session: 2026-05-09
Last commit: 17606f5 docs(status): Sprint 2 complete — v0.2.7
Version: v0.2.7 | Live: https://portal.fullmetaljacketseo.com (UP on v0.2.4 — pending deploy of v0.2.5–v0.2.7)

Pick up from:
1. Confirm CI passes on GitHub Actions (check Actions tab for commit b98b1e5)
2. Deploy v0.2.7 to production (npm run package, upload, NPM Install, Restart)
3. Begin AI Visibility Module — Sprint 0 (foundation refactor): split routes/storage, add roles + jobs scaffold

---

## Current Sprint — AI Visibility Sprint 1 — Client / Brand / Competitor Setup

**Goal:** Agency admin can create a client with brands, aliases, and competitors; grant access to team members.
**Status: COMPLETE**
**Version target: v0.4.0**

### Milestones

- [x] Schema: clients, brands, brand_aliases, competitors, client_users tables
- [x] Migration: 0003_numerous_black_tarantula.sql
- [x] Stores: clientStore, brandStore, aliasStore, competitorStore, clientUserStore
- [x] Routes: server/routes/clients.ts (14 endpoints, { data } envelope)
- [x] UI: ClientsList + ClientDetail pages, App.tsx routes (#/ai/clients, #/ai/clients/:id)
- [x] Tests: 22 storage + 25 route tests; 181 total passing

---

## Previous Sprint — AI Visibility Sprint 0 — Foundation Refactor (COMPLETE)

---

## AI Visibility Module — Sprint Roadmap

Full spec: `docs/ai-visibility-reporting-spec.md`
Plan file: `C:\Users\georg\.claude\plans\glistening-riding-pixel.md`

Confirmed decisions:
- PDF: CSV-only through MVP (Phase 2 revisit)
- Sentiment: Rule-based lexicon only for MVP; Anthropic-assisted deferred to Phase 2
- Perplexity API key + monthly USD ceiling: to be provided before Sprint 3

| Sprint | Goal | Version |
|--------|------|---------|
| Sprint 0 | Foundation refactor — split routes/storage, add roles + jobs scaffold | v0.3.0 |
| Sprint 1 | Client / brand / competitor setup + AI module shell UI | v0.4.0 |
| Sprint 2 | Versioned prompt library | v0.5.0 |
| Sprint 3 | Run engine + Perplexity adapter | v0.6.0 |
| Sprint 4 | Mention/citation analysis + core metrics dashboard | v0.7.0 |
| Sprint 5 | Sentiment, annotations, CSV exports | v0.8.0 |
| Sprint 6 | Sources, recommendations, share links | v0.9.0 |
| Sprint 7 | GA4 integration, calibration harness | v1.0.0 |

---

## Previous Sprint — Sprint 2

**Goal:** Code quality gates, observability, and CI/CD
**Status: COMPLETE**

### Milestones

- [x] S2-01 ESLint setup — zero-warning enforcement in package pipeline
- [x] S2-02 AppError class — structured server errors (server/errors.ts)
- [x] S2-03 Response envelope helpers — ok(), created(), noContent() (server/response.ts)
- [x] S2-04 Structured logging — JSON lines with requestId, userId, method, path, status, durationMs
- [x] S2-05 CI/CD pipeline — lint + check + test on every push/PR to main (.github/workflows/ci.yml)
- [x] S2-06 .env validation — validateEnv() fails fast on missing SESSION_SECRET or partial SMTP config

---

## In Progress

- Nothing actively in progress

---

## Backlog

Priority order within each tier. Move items to a sprint milestone when scheduled.

### Medium Priority

- B-04 Seed data versioning strategy (allow adding/updating workflows without full redeploy)
- B-06 Session store: add session expiry cleanup configuration review

### Low Priority

- B-08 skipLibCheck: false in tsconfig (stricter dependency type checking)
- B-09 Local dev server fix for Windows (remaining socket/network issues)
- B-10 Evaluate replacing better-sqlite3-session-store (deprecated dependencies)

---

## Tech Debt Register

| ID  | Severity | Status | Description | File |
|-----|----------|--------|-------------|------|
| TD-01 | High | Done | Dead scaffold deps in build allowlist (16 unused packages) | script/build.ts |
| TD-02 | High | Done | No rate limiting on auth endpoints | server/routes.ts |
| TD-03 | High | Done | No database migrations infrastructure | drizzle.config.ts |
| TD-04 | Medium | Done | @supabase/supabase-js in deps, never imported | package.json |
| TD-05 | Medium | Done | countUsers() full table scan instead of COUNT(*) | server/storage.ts |
| TD-06 | Medium | Done | No security headers (helmet, CSP, X-Frame-Options) | server/index.ts |
| TD-07 | Medium | Done | package.json name is "rest-express" (scaffold remnant) | package.json |
| TD-08 | Medium | Done | staleTime: Infinity — queries never refetch | client/src/lib/queryClient.ts |
| TD-09 | Medium | Done | No React error boundary — render error = blank screen | client/src/App.tsx |
| TD-10 | Medium | Done | Session error callbacks lack request context in logs | server/routes.ts |
| TD-11 | Low | Done | Test files excluded from tsc type checking | tsconfig.json |
| TD-12 | Low | Open | Hardcoded seed data — no versioning or rollback | server/seed.ts |
| TD-13 | Low | Open | skipLibCheck: true masks dep type errors | tsconfig.json |
| TD-14 | Low | Done | No .nvmrc / engines field to pin Node version | package.json |
| TD-15 | Medium | Done | No ESLint — any types and console.log not enforced | multiple files |
| TD-16 | Medium | Done | Global error handler used any type and wrong response format | server/index.ts |
| TD-17 | Low | Done | better-sqlite3 bundled by esbuild — native addon path broken on Linux | script/build.ts |
| TD-18 | Low | Done | Missing migration for email/reset columns — caused 500 on first login | migrations/ |

---

## Completed

### Session 2026-05-09 (Sprint 2 completion)

**S2-06 .env validation (v0.2.5):**
- server/config.ts: validateEnv() called at startup before migrate()
- Throws with clear message if SESSION_SECRET < 32 chars in production
- Throws with missing var list if SMTP group is partially configured (all-or-nothing)
- Returns typed AppConfig (PORT, DATA_DB_PATH, SESSION_DB_PATH, SMTP)
- 14 new tests — 104 total passing

**S2-04 Structured logging (v0.2.6):**
- server/logger.ts: zero-dep JSON logger — {ts, level, msg, ...ctx} per line
- Request middleware: logs requestId, userId, method, path, statusCode, durationMs
- Removed response-body capture from request logs (security risk)
- server/routes.ts: 4 console.error calls -> logger.error with structured context (TD-10 resolved)
- server/auth.ts: console.warn -> logger.warn
- 7 new tests — 111 total passing

**S2-05 CI/CD pipeline (v0.2.7):**
- .github/workflows/ci.yml: triggers on push and PR to main
- Runs on ubuntu-latest, Node 22, npm cache enabled
- Gates: npm ci -> lint -> check -> test
- Note: pure config — no unit test applicable (no implementation code)

**Also this session:**
- v0.2.4 deployed to production successfully
- Seed data rewrite complete (user-supplied)
- Password reset email flow verified end-to-end on production

### Session 2026-05-08 (production fix + Sprint 2 foundation)

**Production 503 root cause and fix:**
- SSH diagnosed: ~/persistent/ directory missing — created via SSH
- cPanel env vars had trailing spaces and a space in SESSION_DB_PATH name — corrected
- better-sqlite3 was in esbuild bundle allowlist — native addons cannot be bundled; removed
- Missing migration for email, reset_token_hash, reset_token_expiry columns — generated 0001_clever_talisman.sql
- Portal now live at https://portal.fullmetaljacketseo.com on v0.2.2

**Deploy discipline (all enforced in package pipeline):**
- script/preflight.js: blocks packaging if git tag v{version} already exists
- npm run db:check: blocks packaging if schema has unmigrated changes
- CLAUDE.md: pre-deploy checklist, versioning rules table, TDD cycle, strict mode rules

**Sprint 2 foundation (v0.2.3):**
- ESLint 9 flat config with typescript-eslint — zero warnings enforced
- npm run lint wired as first gate in package pipeline
- server/errors.ts: AppError class (TDD — test written first)
- server/response.ts: ok(), created(), noContent() envelope helpers (TDD)
- Global error handler updated to use AppError, { error, code } format
- All no-explicit-any violations resolved across 6 files (server + client)
- 90 tests passing

### Session 2026-05-07 (Sprint 1 completion + post-sprint)
- Password reset: forgot-password page, reset-password page, nodemailer SMTP transport
- Hashed single-use tokens (SHA-256), 60-min expiry, session invalidation on reset
- Account settings dialog in portal header for setting recovery email
- Email field added to first-run setup and users schema
- CSP fixed in dev: helmet contentSecurityPolicy disabled when NODE_ENV != production
- npm run package: single command that runs check + test + build + creates versioned .tar.gz
- First-deploy checklist added to CLAUDE.md
- Deploy archive fixed: inclusion list only
- .htaccess content confirmed and whitespace errors corrected

### Session 2026-05-04 to 2026-05-06
- Local dev environment configured and git remote initialized
- Windows compatibility: cross-env, reusePort guard, .gitattributes LF enforcement
- Testing infrastructure: vitest 3.x workspace projects, 94% coverage (81 tests)
- CLAUDE.md with session procedures
- LaunchInputsDialog: collects required inputs, fills prompt, copies + launches Perplexity
- Perplexity ?q= URL auto-submit (v0.2.1 from GitHub)
- DB persistence fix: DATA_DB_PATH + SESSION_DB_PATH env vars (survive deploys)
- Semantic versioning: v0.2.1 badge on all screens
- server/storage.ts: dependency injection pattern for testability
- client/src/lib/launchUtils.ts: pure functions extracted and unit tested
- Deploy pipeline confirmed working on cPanel
- Admin account persistence confirmed working after env var setup
