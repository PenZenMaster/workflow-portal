## Project Overview

Workflow Portal — private internal portal cataloging SEO/audit/schema/reporting workflows.
Stack: Express 5 + React 18 + SQLite (Drizzle ORM) + TypeScript + Vite.
Auth-gated via Passport.js local strategy. Deployed to cPanel at portal.fullmetaljacketseo.com.

---

## ⚠️ STRICT MODE — Read Before Touching Anything

These rules are non-negotiable. Violating them is a critical failure, not a minor issue.

1. **STOP before coding.** Confirm scope with the user before writing or changing any code.
2. **READ before editing.** Read every file you will touch before making a single change.
3. **FIX completely or not at all.** No partial fixes. If a fix touches multiple files, all must be updated in the same response.
4. **VERSION every shippable change.** Bump `package.json` version before committing any fix, feature, or refactor. No exceptions.
5. **VERIFY after every change.** Run `npm run lint && npm run check && npm test` after every non-trivial edit and report results.
6. **WARN before risky actions.** Any action that could break auth, corrupt the DB, or affect deployment must be flagged explicitly before proceeding.
7. **TEST FIRST, always.** Write a failing test before writing any implementation code. No exceptions. Shipping code without a test written first is a TDD violation.

---

## Coding Rules (Enforced)

### TDD Cycle — Mandatory for Every Feature and Bug Fix

This project follows strict Test Driven Development. The cycle is **Red → Green → Refactor**,
in that order, every time. There are no exceptions.

**🔴 RED — Write a failing test first**

Before writing a single line of implementation:

- [ ] State the exact behavior being implemented or fixed (one sentence).
- [ ] List every file that will be read or changed.
- [ ] Read ALL of those files now — no exceptions.
- [ ] Confirm scope with the user: *"I plan to implement X. Here is the test I will write first. Confirm?"*
- [ ] Write the test. Run it. **Confirm it fails** for the right reason.
- [ ] Show the failing test output to the user before proceeding.

A test that passes before implementation is written is not a TDD test — it is either
testing the wrong thing or the behavior already exists. Stop and investigate.

```bash
npm test -- --reporter=verbose
```

**🟢 GREEN — Write the minimum code to make the test pass**

- Write only enough implementation code to make the failing test pass.
- No extra features, no "while I'm here" changes, no opportunistic refactors.
- If a fix requires changes in more than one file, update ALL files in the same response.
- Do not introduce new dependencies without explicit user approval.
- Run the test suite again. **All tests must be green before moving on.**

```bash
npm run lint && npm run check && npm test
```

**🔵 REFACTOR — Clean up with tests as your safety net**

- Only refactor after the test is green.
- Refactoring must not change behavior — the test suite must remain green throughout.
- Run the full suite after every refactor step, not just at the end.
- No opportunistic refactors on unrelated code — scope creep is a bug.

---

### Additional Coding Rules

- Do not rename exports, routes, or DB columns without flagging the downstream impact first.
- Never leave the codebase in a broken intermediate state between responses.

### What Counts as "Complete"

A task is only complete when:
1. A test was written **before** the implementation (TDD rule — non-negotiable).
2. The test failed first for the right reason (confirmed and shown to user).
3. The targeted behavior now works as intended.
4. `npm run lint` passes (zero warnings).
5. `npm run check` passes (zero TypeScript errors).
6. `npm test` passes (all tests green, including the new one).
7. `package.json` version is bumped if the change is shippable.
8. You have stated: *"TDD cycle complete. Test written first, all checks pass."*

---

## Versioning Rules (Enforced)

Semantic versioning is **mandatory** for every shippable change. This is not optional.

### When to Bump

| Change type                          | Bump     | Example            |
|--------------------------------------|----------|--------------------|
| Bug fix, copy change, minor tweak    | patch    | 1.2.3 → 1.2.4      |
| New feature, new route, new UI       | minor    | 1.2.3 → 1.3.0      |
| Breaking change, schema migration    | major    | 1.2.3 → 2.0.0      |

### Rules

- Bump `package.json` **before** committing. Never commit a shippable change without a version bump.
- One bump per logical change set. Don't stack multiple features under one bump.
- Commit message must reference the bump: `fix(auth): correct session timeout — v1.2.4`
- The deploy script (`npm run package`) will block if the version tag already exists. Use this as your safety net, not your first line of defense.

### Schema Changes

Schema changes (`shared/schema.ts`) always require a **minor or major** bump and a migration:

```bash
npm run db:generate   # generate migration file
git add migrations/   # commit migration with the schema change
```

Never push schema changes without a migration file committed alongside them.

---

## Security Standards (Enforced)

### HTTP Security Headers — Helmet

Every Express app must use Helmet. It must be the **first middleware registered** in `server/index.ts`.

**Setup (requires user approval before running):**
```bash
npm install helmet
npm install --save-dev @types/helmet
```

```typescript
// server/index.ts — must be first middleware
import helmet from 'helmet';
app.use(helmet());
```

Helmet enables: `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`,
`Strict-Transport-Security`, and others by default. Do not disable any of these without
explicit user approval and a documented reason.

---

### Rate Limiting — Auth Routes

Auth routes (`/login`, `/logout`, `/reset-password`, any route accepting credentials)
must be protected by a rate limiter.

**Setup (requires user approval before running):**
```bash
npm install express-rate-limit
```

```typescript
// server/auth.ts (or a shared middleware file)
import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                   // max attempts per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
});

// Apply to auth routes only
router.post('/login', authLimiter, handleLogin);
router.post('/reset-password', authLimiter, handleReset);
```

**Rules:**
- Never apply the auth limiter globally — it will break normal API usage.
- Do not raise the `max` limit above 20 for auth routes without user approval.

---

### Input Validation — Zod on All API Boundaries

Every route that accepts user input must validate with Zod before touching the DB or
business logic. No raw `req.body` access without validation.

**Setup (requires user approval before running):**
```bash
npm install zod
```

**Pattern — validate at the route level:**
```typescript
// server/routes.ts
import { z } from 'zod';

const CreateWorkflowSchema = z.object({
  title:    z.string().min(1).max(200),
  category: z.string().min(1),
  body:     z.string().optional(),
});

router.post('/workflows', async (req, res) => {
  const result = CreateWorkflowSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid input', details: result.error.flatten() });
  }
  const data = result.data; // fully typed and safe from here
  // ...
});
```

**Rules:**
- Use `safeParse`, not `parse` — let the route handle the error response, not a thrown exception.
- Schemas live close to the route that uses them, or in `shared/schema.ts` if shared with the client.
- Never trust `req.params` or `req.query` without validation — use `z.string().uuid()` etc.

---

### Sensitive Data — Never Log It

The following must never appear in logs, error messages, or API responses:

- Passwords or password hashes
- Session tokens or session IDs
- Full cookie strings
- SMTP credentials
- Any value from `.env` marked as a secret

**Rule:** If you add a `console.log` or logger call during debugging, remove it before
committing — or ensure it contains only safe, non-sensitive fields.

---

## Error Handling Standards (Enforced)

### Structured Error Class

All thrown errors in server code must use a structured `AppError` class so the global
error handler can format them consistently.

**Create `server/errors.ts`:**
```typescript
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,   // machine-readable, e.g. 'WORKFLOW_NOT_FOUND'
  ) {
    super(message);
    this.name = 'AppError';
  }
}
```

**Usage in routes/storage:**
```typescript
import { AppError } from './errors';

if (!workflow) {
  throw new AppError(404, 'Workflow not found', 'WORKFLOW_NOT_FOUND');
}
```

---

### Global Error Handler

A single error handler must be registered as the **last middleware** in `server/index.ts`.
It catches all thrown `AppError` instances and any unexpected errors.

```typescript
// server/index.ts — must be last middleware registered
import { AppError } from './errors';

app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code:  err.code ?? null,
    });
  }
  // Unexpected error — do not leak internals
  console.error('[Unhandled error]', err);
  res.status(500).json({ error: 'Internal server error' });
});
```

---

### Async Error Handling — Express 5

Express 5 natively propagates async errors — you do **not** need `try/catch` wrappers
or `express-async-handler` for route handlers. However:

- All `async` route handlers must `await` every async operation.
- Never use floating promises (un-awaited async calls with no `.catch()`).
- Any async work outside a route handler (e.g. startup tasks, scheduled jobs) **must**
  have its own `try/catch` with explicit error logging.

```typescript
// ✅ Correct — Express 5 catches this automatically
router.get('/workflows/:id', async (req, res) => {
  const workflow = await storage.getWorkflow(req.params.id);
  if (!workflow) throw new AppError(404, 'Not found', 'WORKFLOW_NOT_FOUND');
  res.json({ data: workflow });
});

// ❌ Wrong — floating promise, errors silently swallowed
router.post('/workflows', async (req, res) => {
  storage.createWorkflow(req.body); // missing await
  res.status(201).json({ ok: true });
});
```

---

### Logging Strategy

- Use `console.error` for unexpected errors only (the global handler does this).
- Use `console.info` sparingly for significant lifecycle events (server start, DB connect).
- Do not use `console.log` for routine request logging in production code.
- Do not log request bodies — they may contain credentials or PII.
- Future: if a logging library (e.g. `pino`) is added, all `console.*` calls must be
  migrated in the same PR.

---

## Code Quality Standards (Enforced)

### ESLint

ESLint must pass with zero warnings before any code is considered complete. Run it as
part of every verification step alongside `npm run check`.

**If ESLint is not yet configured, flag it to the user and set it up with approval:**
```bash
npm install --save-dev eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser
```

**Minimal `eslint.config.js` for this stack:**
```javascript
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { parser: tsParser },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['error', 'info', 'warn'] }],
    },
  },
];
```

**Add to `package.json` scripts:**
```json
"lint": "eslint . --max-warnings 0"
```

---

### TypeScript — No `any`

- `any` is **banned**. Use `unknown` and narrow it, or define a proper type.
- Never use `// @ts-ignore` or `// @ts-expect-error` without a comment explaining why,
  and never without user approval.
- Never disable or weaken `tsconfig.json` strict settings. If a strict rule causes pain,
  fix the code — don't lower the bar.
- Prefer explicit return types on all exported functions.

```typescript
// ❌ Wrong
function processData(input: any): any { ... }

// ✅ Correct
function processData(input: unknown): ProcessedResult {
  if (typeof input !== 'object' || input === null) throw new AppError(400, 'Invalid input');
  // narrow and use safely
}
```

---

### General Code Quality Rules

- No commented-out code committed to main. Delete it or put it in a branch.
- No TODO comments committed without a corresponding backlog entry in `docs/projectStatus.md`.
- Functions should do one thing. If a function needs a comment to explain what it does,
  it probably needs to be split.
- Keep route handlers thin — business logic belongs in `storage.ts` or a dedicated
  service layer, not inline in `routes.ts`.

---

## API Design Standards (Enforced)

### HTTP Status Codes

Use the correct status code every time. Do not use 200 for errors.

| Situation                              | Code |
|----------------------------------------|------|
| Successful GET / read                  | 200  |
| Successfully created resource          | 201  |
| Successful action, no body returned    | 204  |
| Bad input / validation failure         | 400  |
| Not authenticated (no valid session)   | 401  |
| Authenticated but not authorized       | 403  |
| Resource not found                     | 404  |
| Method not allowed                     | 405  |
| Conflict (e.g. duplicate entry)        | 409  |
| Unhandled server error                 | 500  |

---

### Response Envelope Format

All API responses must use a consistent envelope. Never return raw objects or arrays
at the top level.

**Success — single resource:**
```json
{ "data": { "id": 1, "title": "My Workflow" } }
```

**Success — list:**
```json
{ "data": [ { "id": 1 }, { "id": 2 } ] }
```

**Error:**
```json
{ "error": "Workflow not found", "code": "WORKFLOW_NOT_FOUND" }
```

**TypeScript helpers — create `server/response.ts`:**
```typescript
import type express from 'express';

export const ok = <T>(res: express.Response, data: T, status = 200) =>
  res.status(status).json({ data });

export const created = <T>(res: express.Response, data: T) =>
  res.status(201).json({ data });

export const noContent = (res: express.Response) =>
  res.status(204).send();

// Usage in routes
// return ok(res, workflow);
// return created(res, newWorkflow);
```

**Rules:**
- Never mix the envelope format. If existing routes don't use it, migrate them
  incrementally — but never add a new route without it.
- Never include both `data` and `error` keys in the same response.

---

## Project Start

Trigger phrase: **"Project start"**

1. Pull latest and confirm clean state:
   git pull origin main && git status

2. Read docs/projectStatus.md — this is the single source of truth.
   It contains: current sprint, active work, backlog, tech debt register, and
   the last session's "Resume From" note. No other file needs to be read to
   get fully current.

3. Summarize aloud: current sprint goal, what was in progress, today's priority.

4. Install dependencies only if package.json changed:
   npm install

5. Verify .env exists (copy .env.example if missing):
   copy .env.example .env   (then fill SESSION_SECRET)

6. Push DB schema only if shared/schema.ts changed:
   npm run db:push

7. Start dev server if local testing is needed:
   npm run dev   -> http://localhost:5000

---

## Development Commands

| Command               | Description                                   |
|-----------------------|-----------------------------------------------|
| npm run dev           | Start dev server (Express + Vite HMR)         |
| npm run build         | Production build to dist/                     |
| npm run lint          | ESLint check (zero warnings allowed)          |
| npm run check         | TypeScript type check (tsc --noEmit)          |
| npm run db:push       | Push Drizzle schema changes to SQLite         |
| npm run db:generate   | Generate migration file from schema changes   |
| npm test              | Run all tests once (vitest run)               |
| npm run test:watch    | Watch mode (vitest)                           |
| npm run test:ui       | Vitest browser UI                             |
| npm run test:coverage | Coverage report (v8, HTML output)             |
| .\start.cmd           | Windows double-click launcher                 |

---

## Project Structure

```
workflow-portal/
  client/             React frontend (Vite root)
    src/
      components/     shadcn/ui + custom components
      pages/          Route pages (wouter)
      hooks/          Custom React hooks
      lib/            auth, queryClient, theme, utils, launchUtils
  server/             Express backend
    index.ts          Entry point + middleware setup
    routes.ts         REST API routes
    auth.ts           Passport.js session auth
    storage.ts        Data access layer (Drizzle, DI-testable)
    errors.ts         AppError class
    response.ts       Response envelope helpers
    seed.ts           SQLite seed data
  shared/
    schema.ts         Drizzle schema (shared by client and server)
  tests/
    setup.ts          Vitest global setup
    server/           Server/API integration tests (node env)
  docs/
    projectStatus.md  SINGLE SOURCE OF TRUTH — sprint, backlog, tech debt
    standards/        Development standards references
    archive/          Historical sprint archives (major milestones only)
  .env                Local secrets (never commit)
  .env.example        Template for .env
  CLAUDE.md           This file
```

---

## Standards and References

- Node.js API docs: https://nodejs.org/docs/latest/api/documentation.html
- Express 5 API: https://expressjs.com/en/5x/api.html
- Drizzle ORM: https://orm.drizzle.team/docs/overview
- Vite: https://vitejs.dev/guide/
- Vitest: https://vitest.dev/guide/
- shadcn/ui: https://ui.shadcn.com/docs
- React Testing Library: https://testing-library.com/docs/react-testing-library/intro/

---

## Prerequisites

- Node.js 20+
- npm 10+
- Git

---

## Testing Guidelines

This project uses Test Driven Development. Tests are written **before** implementation — always.
See the TDD Cycle in Coding Rules for the full Red → Green → Refactor procedure.

- Server tests: `tests/server/**/*.test.ts` — node environment, supertest
- Client tests: `client/src/**/*.test.{ts,tsx}` — jsdom environment
- Coverage target: >=85% on business-logic files (currently 94%)
- Every new route, storage method, or utility function must have a corresponding test written first.
- Bug fixes must begin with a test that reproduces the bug before the fix is written.
- Run before every deploy: npm run lint && npm run check && npm test

Generate SESSION_SECRET:
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

---

## Checkpoint

Trigger phrase: **"Checkpoint now"** or **"Prepare for rollover"**

1. Commit all changes:
   git add -A
   git commit -m "chore(checkpoint): YYYY-MM-DD - <short summary>"

2. Update docs/projectStatus.md in-place:
   - Move newly completed sprint items to the Completed section
   - Update In Progress with current state
   - Update the Resume From block at the top with exactly what to pick up next
   - Add any new backlog items discovered this session
   - Update tech debt entries if any were resolved or added

3. Commit the updated projectStatus.md:
   git add docs/projectStatus.md
   git commit -m "docs(status): update sprint status and resume point"

4. Push:
   git push origin main

Note: Separate checkpoint files in docs/archive/ are only needed for major
milestones (sprint completions, significant releases). Routine session
checkpoints live entirely in projectStatus.md.

---

## Shutdown

Trigger phrase: **"Project shutdown"**

1. Run the full Checkpoint procedure above.
2. Confirm: git log --oneline -3 && git status (tree must be clean)
3. Push if not already done: git push origin main
4. Stop the dev server (Ctrl+C).
5. State exactly 3 bullets for next session — these go into the Resume From
   block in projectStatus.md before committing.

---

## Environment Variables

| Variable          | Required | Description                                      |
|-------------------|----------|--------------------------------------------------|
| SESSION_SECRET    | Yes      | 32+ char hex string for Express session signing  |
| PORT              | No       | Server port (default 5000; cPanel injects this)  |
| NODE_ENV          | No       | development or production                        |
| DATA_DB_PATH      | No       | Override main SQLite db path (use ../persistent/data.db on cPanel) |
| SESSION_DB_PATH   | No       | Override sessions SQLite path (use ../persistent/sessions.db on cPanel) |
| LLM_MAX_OUTPUT_TOKENS | No   | Output-token cap for measurement LLM calls (default 1500; changing it is a methodology-comparability event) |
| LLM_TIMEOUT_MS    | No       | Request timeout for measurement LLM calls (default 30000ms); a timed-out request is not retried, since the provider may already have billed it |
| BUDGET_MONTHLY_TOKEN_WARN | No | Per-client month-to-date token count (input+output) at which run creation logs a warning but proceeds. Disabled (no budget enforced) unless set to a positive integer. |
| BUDGET_MONTHLY_TOKEN_BLOCK | No | Per-client month-to-date token count at which run creation (manual trigger, retry-failed, schedule-tick) is refused with 429 BUDGET_EXCEEDED. Disabled unless set to a positive integer. |
| UTILITY_MODEL_<SLUG> | No    | Override the economy model for internal calls per provider, e.g. UTILITY_MODEL_OPENAI=gpt-4o-mini |
| RANKROCKET_MCP_TOKEN | No** | Bearer token for rankrocket-mcp's `/mcp` endpoint (secret - never log). Required to enable the "RankRocket Site Insights" workflow card; that card's run returns 503 without it. |
| RANKROCKET_MCP_URL | No     | rankrocket-mcp endpoint override (default `https://mcp.fullmetaljacketseo.com/mcp`) |
| SMTP_HOST         | No*      | SMTP server hostname (required for password reset) |
| SMTP_PORT         | No*      | SMTP port — 465 for SSL, 587 for STARTTLS (default 465) |
| SMTP_USER         | No*      | SMTP username / sender address                   |
| SMTP_PASS         | No*      | SMTP password                                    |
| BASE_URL          | No*      | Portal public URL for reset links (e.g. https://portal.fullmetaljacketseo.com) |

\* Required together to enable the "Forgot password?" feature.
\*\* Also requires `ANTHROPIC_API_KEY` to be set.

---

## Deployment (cPanel)

### FIRST-DEPLOY CHECKLIST — must be done once before the app will run

These must be set in the cPanel .env BEFORE starting the app for the first time.
Missing or wrong values cause an immediate 503 with no visible error to the user.

- [ ] SESSION_SECRET = <32+ char hex string>
      Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
      The server THROWS and refuses to start in production if this is < 32 characters.

- [ ] DATA_DB_PATH = ../persistent/data.db
      Without this, the database is created inside the app folder and wiped on every deploy.

- [ ] SESSION_DB_PATH = ../persistent/sessions.db
      Without this, all sessions are lost on every deploy (users get logged out).

- [ ] NODE_ENV = production

- [ ] Create the persistent folder via SSH before first run:
      mkdir -p ~/persistent

Optional (required for password reset):
- [ ] SMTP_HOST = portal.fullmetaljacketseo.com
- [ ] SMTP_PORT = 465
- [ ] SMTP_USER = security@portal.fullmetaljacketseo.com
- [ ] SMTP_PASS = <email account password>
- [ ] BASE_URL = https://portal.fullmetaljacketseo.com

---

### Pre-deploy checklist — must pass before running npm run package

- [ ] Schema changed? Run `npm run db:generate` and commit the new migration file.
- [ ] Any shippable change (fix, feat, perf)? Bump version in package.json first.
      patch = bug fix (+0.0.1), minor = new feature (+0.1.0), major = breaking (+1.0.0)
- [ ] `npm run lint && npm run check && npm test` all pass.
- [ ] `npm run package` will block if the version tag already exists (preflight check).
- [ ] `npm run package` will block if schema has unmigrated changes (db:check).

### Routine update cycle

1. Complete the pre-deploy checklist above.
2. git add -A && git commit && git push
3. npm run package          (preflight -> lint -> check -> db:check -> test -> build -> archive -> git tag)
4. cPanel File Manager: upload the new .tar.gz, extract into app root (overwriting dist/)
5. Setup Node.js App -> Run NPM Install -> Restart

The package script produces dist/, migrations/, package.json, package-lock.json only.
Archive is named workflow-portal-v<version>.tar.gz and placed one level above the project root.
