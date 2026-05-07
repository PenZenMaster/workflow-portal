# Deploying to cPanel (IONOS) — `fullmetaljacketseo.com`

This guide covers deploying the Workflow Portal to a cPanel shared host using the **Setup Node.js App** feature (Passenger-based).

---

## Prerequisites

- cPanel account on IONOS with **Node.js Selector** / **Setup Node.js App** available.
- SSH or File Manager access.
- DNS for `fullmetaljacketseo.com` managed in IONOS (or wherever you point it).
- Decided on a hostname:
  - **Apex** — `https://fullmetaljacketseo.com` (replaces the homepage).
  - **Subdomain (recommended)** — `https://portal.fullmetaljacketseo.com`. Keeps the apex free for marketing.

---

## 1. Build the project locally first

The portal ships TypeScript source. cPanel's Node app should run the precompiled output.

In PowerShell on your Windows box, in the project folder:

```powershell
npm install
npm run build
```

This creates:

- `dist/public/` — static frontend (index.html + assets).
- `dist/index.cjs` — bundled Express server.

You will upload everything **except** `node_modules` (cPanel will install those on the server).

---

## 2. Generate a session secret

Pick one. From PowerShell:

```powershell
-join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
```

Or from any terminal with Node installed:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the long hex string — you'll paste it as an env var in step 5.

---

## 3. Create the (sub)domain in cPanel

1. cPanel → **Domains** → **Create A New Domain**.
2. Enter `portal.fullmetaljacketseo.com` (or use the apex).
3. Uncheck "Share document root..." — Passenger will manage the root.
4. Document root: `/home/<cpanel-user>/portal.fullmetaljacketseo.com` (or similar).
5. Save.

---

## 4. Create the Node.js app

1. cPanel → **Setup Node.js App** → **Create Application**.
2. Settings:
   - **Node.js version**: 20.x or 22.x LTS (avoid 24).
   - **Application mode**: `Production`.
   - **Application root**: `portal.fullmetaljacketseo.com` (this becomes `/home/<user>/portal.fullmetaljacketseo.com`).
   - **Application URL**: pick the (sub)domain you created.
   - **Application startup file**: `dist/index.cjs`
   - Leave **Passenger log file** at default.
3. Click **Create**. You'll see a virtual environment activate command — copy it; you'll need it in step 6.

---

## 5. Set environment variables in the app

In the same Setup Node.js App screen, scroll to **Environment variables** and add:

| Variable | Value |
|---|---|
| `SESSION_SECRET` | the hex string from step 2 |
| `NODE_ENV` | `production` |

Do **not** set `PORT` — cPanel/Passenger injects it.

Click **Save**.

---

## 6. Upload the project files

Create a gzip-compressed tar archive (`.tar.gz`) — the correct format for Linux servers.

In PowerShell, from the parent folder of the project (replace `0.2.1` with the current version from `package.json`):

```powershell
cd workflow-portal
tar -czf ..\workflow-portal-0.2.1.tar.gz --exclude="./node_modules" --exclude="./*.db" .
cd ..
```

Then in cPanel **File Manager**:

1. Navigate to your application root (e.g. `/home/<user>/portal.fullmetaljacketseo.com/`).
2. Delete the existing `dist/` folder to avoid stale Vite-hashed assets.
3. Upload `deploy.tar.gz`.
4. Right-click → **Extract**. Confirm files land in the app root, **not** in a `workflow-portal/` subfolder. If they did, move them up.
5. Delete the archive.

You should now see at the app root:

```
dist/                ← compiled server + static frontend
client/              ← source (not strictly needed at runtime)
server/              ← source (not strictly needed at runtime)
shared/              ← source (used by the bundle)
package.json
package-lock.json
DEPLOY-CPANEL.md
README.md
.env.example
```

You can delete `client/`, `server/`, `script/`, and other dev-only folders to slim things down — only `dist/`, `package.json`, `package-lock.json` are required at runtime.

---

## 7. Install dependencies on the server

In cPanel's **Setup Node.js App** screen, click **NPM Install** (or use SSH with the activate command from step 4, then run `npm ci --omit=dev`).

This populates `node_modules` on the server. Wait until it finishes.

If `better-sqlite3` fails to install on the server, your host's Node version may not have a prebuilt binary. Try the next supported LTS in step 4.

---

## 8. Start the app

1. Back in **Setup Node.js App**, click **Restart**.
2. Open `https://portal.fullmetaljacketseo.com` in a browser.
3. You should see the **Create your admin account** screen on first visit.
4. Pick a username and a strong passphrase (10+ chars). Save.
5. You're in.

---

## 9. DNS (if not already pointed)

If your subdomain isn't resolving:

1. IONOS dashboard → **Domains & SSL** → `fullmetaljacketseo.com` → **DNS**.
2. Add an `A` record:
   - **Host**: `portal`
   - **Value**: your cPanel server's IP (shown in cPanel sidebar under "Shared IP Address" or in the welcome email).
   - **TTL**: 1 hour is fine.
3. Wait 5–30 minutes for propagation.
4. In cPanel → **SSL/TLS Status** → run **AutoSSL** for the subdomain so HTTPS provisions automatically.

---

## 10. Lock down access (recommended)

The portal already requires login, but add belt-and-suspenders:

- **Force HTTPS** — cPanel → **Domains** → toggle **Force HTTPS Redirect** on the subdomain.
- **IP allow-list (optional)** — if you only access from a few known IPs, cPanel → **Directory Privacy** or `.htaccess` `Require ip ...` rules. Skip if you want access on the road.
- **Backup `data.db`** — set a weekly cPanel backup, or `scp` a copy to your machine periodically. This is your workflow library.

---

## Updating the portal later

When you want to ship changes:

1. Make changes locally, run `npm run check && npm test && npm run build`.
2. From inside the project folder: `cd workflow-portal && tar -czf ..\workflow-portal-<version>.tar.gz --exclude="./node_modules" --exclude="./*.db" . && cd ..`
3. In cPanel File Manager: delete `dist/`, upload the archive, extract.
4. cPanel → **Setup Node.js App** → **Run NPM Install**.
5. cPanel → **Setup Node.js App** → **Restart**.

Your `data.db` stays put across restarts and updates as long as you don't overwrite it.

---

## Troubleshooting

- **502 / "Application failed to start"** — open Passenger log file from the app screen. Most common cause: missing `SESSION_SECRET` in production. The app refuses to start without one.
- **Login works but redirects back to login** — cookies aren't being kept. Confirm:
  - `NODE_ENV=production` is set (so `Secure` cookie flag is on)
  - You're accessing the site over HTTPS (not plain HTTP)
  - cPanel proxy is forwarding `X-Forwarded-Proto` (it should by default — `app.set('trust proxy', 1)` is already configured).
- **`better-sqlite3` install fails** — switch the app's Node version to 20.x LTS in cPanel and re-run NPM Install.
- **Want to reset the admin account** — SSH in, delete `data.db` (back it up first if you want to keep workflows), restart the app. You'll be prompted to set up again on next visit. To preserve workflows but reset users: open `data.db` with any SQLite tool and run `DELETE FROM users;`.
