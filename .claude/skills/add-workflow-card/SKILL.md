---
name: add-workflow-card
description: Add a new card to the Workflow Portal's workflow catalog (the "workflows" table shown on Home). Use when the user says "Add Workflow Portal Card", "add a workflow card", or asks to add a new SEO/audit/schema/reporting workflow to the portal.
---

# Add Workflow Portal Card

Adds a new row to the `workflows` table that powers the card grid on the
Workflow Portal's Home page. This skill exists so the mechanism below does
not need to be re-derived from scratch each time — it was reverse-engineered
from the codebase on 2026-08-12 (see `docs/projectStatus.md` for that
session's notes) and confirmed to still be accurate before use.

## The mechanism (verify still true before relying on it)

- `workflows` is a SQLite table, schema in `shared/schema.ts` (search
  `CATEGORIES` and `insertWorkflowSchema`). The client fetches cards via
  `GET /api/workflows` — no static client-side data file exists.
- `server/seed.ts`'s `SEED` array only seeds a table that is **completely
  empty** (`seedIfEmpty()`) — appending to `SEED` alone does **not** add a
  card to the already-populated dev or prod database. It only matters for a
  fresh install / reset dev DB.
- A card actually lands in a live/dev DB via `POST /api/workflows`
  (`server/routes/workflows.ts`), either through the app's "Add Workflow" UI
  dialog (`client/src/components/WorkflowDialog.tsx`) or a direct SQL insert
  matching the same row shape.
- Adding a card is a **data-only** change — no schema migration needed unless
  the request requires a genuinely new column (it shouldn't).

Before executing, quickly re-grep for `seedIfEmpty` and `CATEGORIES` to
confirm this hasn't changed since 2026-08-12.

## Row shape

Columns: `name, category, description, inputs(json array), tags(json array),
prompt, launch_url, launch_label, pinned(0/1), created_at/updated_at(epoch
ms), accepts_file_upload(0/1), optional_inputs(json array),
ai_adapter_slug(nullable string)`.

`category` must be one of `CATEGORIES` in `shared/schema.ts`: `Audit`,
`Schema`, `Reporting`, `Verification`, `Automation`, `Content`, `Local SEO`,
`Other`.

`prompt` convention: one `<PASTE>` token per entry in `inputs`, in the same
order, followed by plain-English instructions for what to do with them. If
the workflow is meant to invoke a named external "skill" (e.g. a Perplexity
Comet skill), open the prompt with `Use the "<skill-name>" skill.` — see
existing cards `SEO Site Audit (full skill)` (id 1) and `Location Page
Builder (Rank Rocket + WordPress)` (id 20, added 2026-08-12) as reference
patterns.

`launch_url` conventions:
- `https://www.perplexity.ai/` + `launch_label: "Launch in Perplexity"` for
  skill-launch cards (Perplexity-specific auto-prefill behavior lives in
  `client/src/lib/launchUtils.ts`).
- An external repo/tool URL (e.g. GitHub) for dev-ops-style cards — falls
  back to clipboard-copy-and-open behavior for non-Perplexity hosts.
- Empty string if the card has no launch target (pure copy-the-prompt card).

Only set `accepts_file_upload: true` if the user explicitly wants CSV/bulk
upload support (mirrors the CSV-upload cards from v1.20.0). Only set
`ai_adapter_slug` if the card should trigger an automated in-app AI run
rather than an external skill launch — confirm this with the user, it's a
different execution model than "Launch in Perplexity".

**If any input label represents a credential/secret** (API key, password,
token, etc.), it MUST match `client/src/lib/launchUtils.ts`'s
`SENSITIVE_LABEL` regex (`/password|passphrase|secret|token|api[\s_-]?key|credential/i`)
or the card will try to embed the secret into a Perplexity URL query string
instead of forcing clipboard-only mode. `api[\s_-]?key` requires "api"
*immediately* followed by "key" (optionally separated by one space/`_`/`-`)
— a label like "API endpoint / key" does NOT match; "API Key" or "Rank
Rocket API Key" does. Check every credential-like label against this regex
before finalizing the row, don't assume the wording is safe.

## Production is a separate, non-optional insert

**A code deploy (`npm run package` + cPanel) ships `dist/` and
`migrations/` only — it never ships data.** `seedIfEmpty()` only fires on a
completely empty `workflows` table, so a `seed.ts` entry — even one already
committed and deployed — will silently never reach a production DB that
already has rows in it (which it always will, past the very first
install). Adding a card to dev does not add it to production, and
deploying the code to production does not either.

If the card needs to exist in production, you MUST separately insert the
row into prod's `data.db` (`/home/fullmetaljacket/persistent/data.db` over
SSH, same direct-SQL technique as the TD-22 fix) — regardless of whether a
code deploy has already happened or is planned. Confirm with the user
whether "add this card" means dev only, prod only, or both, and don't let
a deploy stand in for the data insert. This exact gap caused a shipped
v1.80.0 card to fail its production smoke test on 2026-08-12 ("card not
visible") purely because the insert had only ever been done against dev.

Also be aware **production's `workflows` table can drift from
`server/seed.ts`** — cards get renamed/added directly via the live
"Add Workflow" UI independent of dev. Before drafting a new card, query
production's actual current catalog (not just dev's) if there's any chance
of a naming collision or if matching an existing card's established
pattern matters — dev/seed.ts may be stale.

## Steps

1. **Gather the card-specific content from the user** — do NOT re-derive the
   mechanism above, just ask/confirm: name, category, description, inputs
   (ordered), tags, the prompt body (or enough detail to draft it in the
   established `<PASTE>`-token style), launch target, pinned true/false, and
   whether it needs CSV upload or an AI-adapter run instead of a skill
   launch. Draft a full proposed row and confirm it with the user before
   writing anything, the same way past cards were drafted.

2. **Insert directly into the target DB** via `sqlite3` (dev `data.db` by
   default, unless the user asks for production — production changes need
   explicit confirmation per this project's risk rules, same technique as
   the TD-22 direct-SQL precedent, run over SSH against the persistent DB).
   Write the INSERT to a temp `.sql` file first to avoid shell-quoting
   issues with apostrophes in description/prompt text (double any `'` for
   SQL), then delete the temp file after running it.

3. **Append the same object to `server/seed.ts`'s `SEED` array** (right
   before the closing `];`) for fresh-install parity. Data-only change, no
   migration.

4. **Bump `package.json` version** — minor bump (new user-visible workflow
   card) per this repo's CLAUDE.md versioning rule.

5. **Run the quality gate**: `npm run lint && npm run check && npm test` —
   should be a no-op verification since no application logic changed.

6. **Verify the inserted row**: `sqlite3 -json data.db "SELECT * FROM
   workflows WHERE name = '<name>';"` and confirm it matches what was
   drafted with the user.

7. **Ask the user to visually confirm** in the browser (dev server already
   running, already logged in — avoid driving the authenticated UI via
   browser automation, this app's session handling has caused
   automation/session-context mismatches in past sessions).

8. **git commit** `server/seed.ts` + `package.json` with a conventional
   commit message referencing the version, e.g. `feat(workflows): add
   <name> card - v1.x.0`. Do not push or deploy unless asked — deploying to
   production is a separate, explicit step (`npm run package` + cPanel
   upload per this repo's CLAUDE.md).

9. **Update `docs/projectStatus.md`** per this repo's checkpoint convention,
   noting the new card and its deploy status.

## Existing cards for reference

Query `sqlite3 -json data.db "SELECT id,name,category,tags FROM
workflows;"` (dev) and, if production parity matters, the same query over
SSH against prod's `data.db` — see the drift warning above — before
drafting a new card. Useful for spotting naming/tag conventions and
avoiding near-duplicates.
