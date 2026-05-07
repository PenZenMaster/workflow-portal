## Project Overview

Workflow Portal — private internal portal cataloging SEO/audit/schema/reporting workflows.
Stack: Express 5 + React 18 + SQLite (Drizzle ORM) + TypeScript + Vite.
Auth-gated via Passport.js local strategy. Deployed to cPanel at portal.fullmetaljacketseo.com.

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
| npm run check         | TypeScript type check (tsc --noEmit)          |
| npm run db:push       | Push Drizzle schema changes to SQLite         |
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

## Testing Guidelines

- Server tests: `tests/server/**/*.test.ts` — node environment, supertest
- Client tests: `client/src/**/*.test.{ts,tsx}` — jsdom environment
- Coverage target: >=85% on business-logic files (currently 94%)
- Run before every deploy: npm run check && npm test

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

---

## Deployment (cPanel)

Full guide: DEPLOY-CPANEL.md

Quick update cycle:
1. npm run check && npm test   (must be green)
2. npm run build
3. cd workflow-portal && tar -czf ..\workflow-portal-v<version>.tar.gz --exclude="./node_modules" --exclude="./*.db" . && cd ..
4. cPanel File Manager: delete dist/, upload deploy.tar.gz, extract
5. Setup Node.js App -> Run NPM Install -> Restart
