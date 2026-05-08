## Resume From

Last session: 2026-05-08
Last commit: 4784322 feat: wire ESLint, AppError, and response helpers — v0.2.3
Version: v0.2.3 | Live: https://portal.fullmetaljacketseo.com (UP)

Pick up from:
1. Verify password reset email flow end-to-end on production
2. Begin Sprint 2 planning — top backlog items are B-02 (structured logging) and B-03 (CI/CD)
3. Consider response envelope migration for existing routes (incremental — new routes must use helpers)

Production is live. All Sprint 2 foundation work (ESLint, AppError, response helpers) is complete.
CLAUDE.md now enforces strict TDD, versioning, and deploy discipline.

---

## Current Sprint — Sprint 2

**Goal:** Code quality gates, observability, and CI/CD
**Status: IN PROGRESS**

### Milestones

- [x] S2-01 ESLint setup — zero-warning enforcement in package pipeline
- [x] S2-02 AppError class — structured server errors (server/errors.ts)
- [x] S2-03 Response envelope helpers — ok(), created(), noContent() (server/response.ts)
- [ ] S2-04 Structured logging with request context (B-02)
- [ ] S2-05 CI/CD pipeline — check + lint + test on every push to main (B-03)
- [ ] S2-06 .env validation on startup — fail fast if required vars missing (B-07)

---

## In Progress

- Nothing actively in progress (checkpoint)

---

## Backlog

Priority order within each tier. Move items to a sprint milestone when scheduled.

### High Priority

- B-03 CI/CD pipeline — run lint + check + test on every push to main

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
| TD-10 | Medium | Open | Session error callbacks lack request context in logs | server/routes.ts |
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
- Memory saved: version bump rule, migration-on-schema-change rule, no hollow affirmations

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
