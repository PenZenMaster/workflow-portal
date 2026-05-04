## Project Overview

Workflow Portal — private internal portal cataloging SEO/audit/schema/reporting workflows.
Stack: Express 5 + React 18 + SQLite (Drizzle ORM) + TypeScript + Vite.
Auth-gated via Passport.js local strategy. Deployed to cPanel.

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

1. Pull latest from GitHub:
   git pull origin main

2. Install dependencies only if package.json changed:
   npm install

3. Create .env if missing (copy .env.example and fill SESSION_SECRET):
   copy .env.example .env

4. Push DB schema if shared/schema.ts changed:
   npm run db:push

5. Start dev server:
   npm run dev
   Server: http://localhost:5000  (Express + Vite HMR on same port)

6. Read docs/projectStatus.md and the latest checkpoint in docs/archive/checkpoints/.

---

## Development Commands

| Command              | Description                                  |
|----------------------|----------------------------------------------|
| npm run dev          | Start dev server (Express + Vite HMR)        |
| npm run build        | Production build to dist/                    |
| npm run check        | TypeScript type check (tsc --noEmit)         |
| npm run db:push      | Push Drizzle schema changes to SQLite        |
| npm test             | Run all tests once (vitest run)              |
| npm run test:watch   | Watch mode (vitest)                          |
| npm run test:ui      | Vitest browser UI                            |
| npm run test:coverage| Coverage report (v8, HTML output)            |
| start.cmd            | Windows double-click launcher (installs deps + dev) |

---

## Project Structure

```
workflow-portal/
  client/             React frontend (Vite root)
    src/
      components/     shadcn/ui + custom components
      pages/          Route pages (wouter)
      hooks/          Custom React hooks
      lib/            auth, queryClient, theme, utils
  server/             Express backend
    index.ts          Entry point + middleware setup
    routes.ts         REST API routes
    auth.ts           Passport.js local strategy
    storage.ts        Data access layer (Drizzle)
    seed.ts           SQLite seed data
    static.ts         Static file serving
    vite.ts           Vite dev server integration
  shared/
    schema.ts         Drizzle schema (shared by client and server)
  tests/
    setup.ts          Vitest global setup (@testing-library/jest-dom)
    server/           Server/API integration tests (node env)
  docs/
    projectStatus.md  Current status, in-progress, deferred, next priorities
    standards/        Development standards and references
    archive/
      checkpoints/    Session checkpoint markdown files
  script/
    build.ts          Production build script (esbuild)
  .env                Local secrets (never commit)
  .env.example        Template for .env
  vitest.config.ts    Test configuration
  CLAUDE.md           This file
```

---

## Testing Guidelines

- Server/API tests: `server/**/*.test.ts` or `tests/server/**/*.test.ts`
  - Environment: node (automatic via vitest.config.ts environmentMatchGlobs)
  - Use supertest to mount the Express app without binding a port
- React component tests: `client/src/**/*.test.tsx`
  - Environment: jsdom (default)
  - Use @testing-library/react + @testing-library/jest-dom matchers
- Coverage target: >=80% on server/storage.ts and server/routes.ts

Generate SESSION_SECRET for .env:
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

---

## Checkpoint

Trigger phrase: **"Checkpoint now"** or **"Prepare for rollover"**

1. Stage and commit all changes:
   git add -A
   git commit -m "chore(checkpoint): YYYY-MM-DD_HHMM - <short summary>"

2. Create checkpoint file at:
   docs/archive/checkpoints/CheckPoint-YYYY-MM-DD_HHMM.md

   Contents:
   - Context summary
   - Accomplishments this session
   - Technical changes (files changed, key diffs)
   - Known issues or blockers
   - Next session priorities
   - Git status (branch, last commit)

3. Update docs/projectStatus.md:
   - Move completed items to Completed
   - Update In Progress
   - List Next Session Priorities

4. Push to GitHub:
   git push origin main

---

## Shutdown

Trigger phrase: **"Project shutdown"**

1. Run the full checkpoint procedure above.
2. Verify push: git log --oneline -3 && git status
3. Push if not done: git push origin main
4. Stop the dev server (Ctrl+C in the terminal running npm run dev).
5. List exactly 3 bullets for next session priorities.

---

## Environment Variables

| Variable          | Required | Description                                      |
|-------------------|----------|--------------------------------------------------|
| SESSION_SECRET    | Yes      | 32+ char hex string for Express session signing  |
| PORT              | No       | Server port (default 5000; cPanel injects this)  |
| NODE_ENV          | No       | development or production                        |
| SESSION_DB_PATH   | No       | Override SQLite sessions file path               |

Never commit .env. Generate SESSION_SECRET with:
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

---

## Deployment

See DEPLOY-CPANEL.md for full cPanel deployment instructions.

Build order:
1. npm run build        -> creates dist/
2. Upload dist/ to cPanel public_html or Node.js app root
3. Set NODE_ENV=production and SESSION_SECRET in cPanel app settings
4. Restart Node.js app in cPanel
