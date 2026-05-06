## Resume From

Last session: 2026-05-06
Last commit: 213b0e4 — test: achieve 94% coverage across business-logic files
Version: v0.2.1 | Live: https://portal.fullmetaljacketseo.com

Pick up from:
1. Review tech debt register below and agree priority order with user
2. Begin Sprint 1 execution — start with quick wins (#4 remove supabase, #5 fix countUsers, #7 fix package name)
3. Plan LaunchInputsDialog end-to-end QA on live server

---

## Current Sprint — Sprint 1

**Goal:** Harden the portal for reliable daily use (tech debt, security basics, UX polish)
**Priority order:** Security > Correctness > Performance > Polish

### Milestones

- [ ] S1-01 Remove dead scaffold dependencies (supabase, script/build.ts allowlist)
- [ ] S1-02 Add rate limiting to /api/auth/login and /api/auth/setup
- [ ] S1-03 Fix countUsers() to use COUNT(*) instead of full table scan
- [ ] S1-04 Fix package.json name ("rest-express" -> "workflow-portal")
- [ ] S1-05 Add helmet middleware (security headers)
- [ ] S1-06 Add React error boundary in App.tsx
- [ ] S1-07 Fix staleTime: Infinity on queryClient (stale data across tabs)
- [ ] S1-08 Add .nvmrc / engines field to pin Node version

---

## In Progress

- Nothing actively in progress (session ended)

---

## Backlog

Priority order within each tier. Move items to a sprint milestone when scheduled.

### High Priority

- B-01 Database migrations infrastructure (drizzle-kit generate + migration runner)
- B-02 Structured logging with request context (replace console.log in error handler)
- B-03 CI/CD pipeline — run check + test on every push to main

### Medium Priority

- B-04 Seed data versioning strategy (allow adding/updating workflows without full redeploy)
- B-05 Fix tsconfig to include test files in type checking
- B-06 Session store: add session expiry cleanup configuration review
- B-07 Add .env validation on startup (fail fast if required vars are missing)

### Low Priority

- B-08 skipLibCheck: false in tsconfig (stricter dependency type checking)
- B-09 Local dev server fix for Windows (remaining socket/network issues)
- B-10 Evaluate replacing better-sqlite3-session-store (deprecated dependencies)

---

## Tech Debt Register

Severities from audit conducted 2026-05-06. Update status as resolved.

| ID  | Severity | Status | Description | File |
|-----|----------|--------|-------------|------|
| TD-01 | High | Open | Dead scaffold deps in build allowlist (16 unused packages) | script/build.ts |
| TD-02 | High | Open | No rate limiting on auth endpoints | server/routes.ts |
| TD-03 | High | Open | No database migrations infrastructure | drizzle.config.ts |
| TD-04 | Medium | Open | @supabase/supabase-js in deps, never imported | package.json |
| TD-05 | Medium | Open | countUsers() full table scan instead of COUNT(*) | server/storage.ts:169 |
| TD-06 | Medium | Open | No security headers (helmet, CSP, X-Frame-Options) | server/index.ts |
| TD-07 | Medium | Open | package.json name is "rest-express" (scaffold remnant) | package.json |
| TD-08 | Medium | Open | staleTime: Infinity — queries never refetch | client/src/lib/queryClient.ts |
| TD-09 | Medium | Open | No React error boundary — render error = blank screen | client/src/App.tsx |
| TD-10 | Medium | Open | Session error callbacks lack request context in logs | server/routes.ts:73-86 |
| TD-11 | Low | Open | Test files excluded from tsc type checking | tsconfig.json |
| TD-12 | Low | Open | Hardcoded seed data — no versioning or rollback | server/seed.ts |
| TD-13 | Low | Open | skipLibCheck: true masks dep type errors | tsconfig.json |
| TD-14 | Low | Open | No .nvmrc / engines field to pin Node version | package.json |

---

## Completed

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
- Deploy pipeline confirmed working on cPanel (portal.fullmetaljacketseo.com)
- Admin account persistence confirmed working after env var setup
