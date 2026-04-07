# Gem LinkedIn Shortcuts Extension

Chrome extension + backend service that lets you run Gem and Ashby workflows using keyboard shortcuts or popup buttons.

## Core capabilities

On supported pages, the extension provides a `Gem actions` launcher (`Cmd+K` by default) with:

1. Create project
2. Search project + navigate
3. Create sequence
4. Search someone in Gem

Supported pages:

- LinkedIn public and recruiter profile pages
- Gem candidate profile pages
- Gem project pages (for `Gem actions`)
- Gmail thread pages
- GitHub profile pages

From a supported profile page, the extension can:

1. Add prospect to Gem.
2. Add candidate to a Gem project (with in-page project picker).
3. Upload candidate to Ashby for a selected job.
4. Open candidate profile in Ashby.
5. Open candidate profile in Gem.
6. Set a Gem custom field value.
7. Add note to candidate in Gem.
8. Manage candidate emails (add email, copy primary email, view/copy all, set primary).
9. Set a reminder (due date + optional note).
10. Open sequence in Gem UI.
11. Edit sequence in Gem UI.
12. Show a persistent Gem `Status` signal on LinkedIn profile pages, with a user on/off toggle in popup/options.

## Recommended org rollout (non-forced, install-from-link)

This is the easiest path if you want users to click a link, install once, and use immediately:

1. Deploy this repo to Vercel and use the production backend URL (default in this repo: `https://project-ak83q.vercel.app`).
2. Configure backend secrets in deployment env vars (`GEM_API_KEY`, `ASHBY_API_KEY`, etc).
   - Leave `GEM_DEFAULT_USER_ID` and `GEM_DEFAULT_USER_EMAIL` empty for multi-user org setup.
   - Each user selects themselves in extension Options using the built-in "Load Users" picker.
   - If you want the Ashby upload/create flows, also set `ASHBY_WRITE_ENABLED=true`.
   - Ashby writes require `ASHBY_WRITE_CONFIRMATION_TOKEN` by default. If you do not want that extra gate, set `ASHBY_WRITE_REQUIRE_CONFIRMATION=false`.
   - For a Chrome Web Store build, prefer `ALLOWED_EXTENSION_ORIGINS=chrome-extension://<your-published-extension-id>` over shipping a shared token in the extension bundle.
3. Set extension defaults in `src/org-defaults.json`:
   - `backendBaseUrl`: your hosted backend URL
   - `backendSharedToken`: leave empty for Chrome Web Store builds
   - leave `createdByUserId`/`createdByUserEmail` empty so users can pick their own Gem account
   - optional defaults for project/sequence/custom field IDs
4. Ensure `manifest.json` includes your backend origin in `host_permissions` before packaging if you change away from the default Vercel backend or localhost dev origins.
5. Publish in Chrome Web Store as unlisted/private and share the install link.
6. Use `https://project-ak83q.vercel.app/privacy` as Chrome Web Store privacy policy URL, unless you intentionally change the production backend domain.

The extension now auto-applies `src/org-defaults.json` on install/startup, so users do not need to open options or use terminal.

## Vercel deployment

The backend now targets Vercel production by default:

- Production backend URL: `https://project-ak83q.vercel.app`
- Stable public routes remain the same: `/api/*`, `/health`, and `/privacy`
- Chrome Web Store builds should only allow the stable production URL, not Vercel preview URLs
- On Vercel, backend file logs are best-effort and live under `/tmp`, so durable debugging should come from Vercel Function/Runtime Logs

Deployment checklist:

1. Import the repo into Vercel.
2. Set production env vars:
   - required: `GEM_API_KEY`
   - recommended for published extension builds: `ALLOWED_EXTENSION_ORIGINS=chrome-extension://<published_extension_id>`
   - optional Gem defaults: `GEM_DEFAULT_USER_ID`, `GEM_DEFAULT_USER_EMAIL`
   - optional Ashby: `ASHBY_API_KEY`, `ASHBY_WRITE_ENABLED`, `ASHBY_WRITE_CONFIRMATION_TOKEN`, `ASHBY_WRITE_REQUIRE_CONFIRMATION`
   - optional manual-install fallback: `BACKEND_SHARED_TOKEN`
3. Deploy to production.
4. Verify:
   - `https://project-ak83q.vercel.app/health`
   - `https://project-ak83q.vercel.app/privacy`
5. Load the unpacked extension or package a release and confirm action flows hit the Vercel backend.

For a fuller deployment checklist, see `docs/vercel-deployment.md`.

Build upload zip for Chrome Web Store:

```bash
bash scripts/package-extension.sh
```

Chrome Web Store copy/template files:
- `docs/chrome-web-store-listing.md`
- `docs/privacy-policy.md`
- `docs/chrome-web-store-review-checklist.md`
- `docs/vercel-deployment.md`

## Local quick start (developer setup)

### Prerequisites

- macOS + Google Chrome (Manifest V3 extension flow is documented for Chrome).
- Node.js 18+ (recommended).
- Access to:
  - Gem API key (required for Gem actions).
  - Ashby API key (only required for Ashby actions).


### 1. Clone and enter repo

```bash
git clone git@github.com:max-c3/gem-linkedin-shortcuts-extension.git
cd gem-linkedin-shortcuts-extension
```

### 2. Configure backend environment

```bash
cd backend
cat > .env <<'EOF'
PORT=8787
GEM_API_KEY=<your_gem_api_key>
# Optional production gate for the published extension origin:
# ALLOWED_EXTENSION_ORIGINS=chrome-extension://<published_extension_id>
# Optional shared-token gate for private/manual installs only:
# BACKEND_SHARED_TOKEN=<random_long_token>
# Optional:
# GEM_DEFAULT_USER_ID=<your_gem_user_id>
# GEM_DEFAULT_USER_EMAIL=<your_email@example.com>
# ASHBY_API_KEY=<your_ashby_api_key>
# ASHBY_WRITE_ENABLED=true
# ASHBY_WRITE_CONFIRMATION_TOKEN=<long_random_confirmation_token>
# Or disable the extra confirmation gate instead:
# ASHBY_WRITE_REQUIRE_CONFIRMATION=false
EOF
```

To get it to work, set at least:

- `GEM_API_KEY`
- `ASHBY_API_KEY` for Ashby read/list/search actions
- `ASHBY_WRITE_ENABLED=true` for Ashby upload/create/update actions
- `ASHBY_WRITE_CONFIRMATION_TOKEN` if you keep the default `ASHBY_WRITE_REQUIRE_CONFIRMATION=true`
- Or `ASHBY_WRITE_REQUIRE_CONFIRMATION=false` if you intentionally want Ashby writes without the extra confirmation gate
- `ALLOWED_EXTENSION_ORIGINS` is recommended for Chrome Web Store builds
- `BACKEND_SHARED_TOKEN` is only recommended for private/manual installs where each user enters it themselves
- If no `GEM_DEFAULT_USER_ID`/`GEM_DEFAULT_USER_EMAIL` is set, each user must pick themselves in extension Options (`Load Users` -> select user -> Save). This fills both user ID and email; email alone is sufficient.

### 3. Start backend

From `backend/`:

```bash
npm start
```

Health check:

```bash
curl -sS http://localhost:8787/health
```

Expected response:

```json
{
  "ok": true,
  "config": {
    "gemApiKeyConfigured": true,
    "ashbyApiKeyConfigured": true,
    "ashbyWriteEnabled": true,
    "ashbyWriteRequireConfirmation": true,
    "ashbyWriteConfirmationConfigured": true
  },
  "warnings": []
}
```

If `warnings` includes `ASHBY_WRITE_CONFIRMATION_TOKEN is not set`, the backend can read Ashby but will refuse Ashby write actions such as candidate upload/create.

### 4. Load the extension in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the repo root folder (`gem-linkedin-shortcuts-extension`)
5. Refresh the loaded extension
6. (Recommended) Click **Keyboard shortcuts** -> Set a shortcut for activating the extension (I use cmd + g)
7. Open a supported page (LinkedIn, Gem candidate/project, Gmail thread, or GitHub)
8. Activate the extension -> click "open options"
9. If backend token auth is enabled for your private deployment, set the same token in extension options (`Backend Shared Token`) and backend `.env` (`BACKEND_SHARED_TOKEN`).
10. Refresh the extension again and reload the supported profile tab
11. GTG!

- Your preferred shortcuts

### 5. Default shortcut map:

- `Cmd+K` Gem actions
- `Cmd+Option+1` Add Prospect
- `Cmd+Option+2` Add to Project
- `Cmd+Option+3` Upload to Ashby
- `Cmd+Option+4` Open Profile in Ashby
- `Cmd+Option+5` Open Profile in Gem
- `Cmd+Option+6` Set Custom Field
- `Cmd+Option+7` Add Note to Candidate
- `Cmd+Option+8` Manage Emails
- `Cmd+Option+9` Set Reminder
- `Cmd+Option+0` Open Sequence
- `Cmd+Control+Option+1` Edit Sequence

## Troubleshooting

- If you see `Could not load projects: Unauthorized`, check whether `BACKEND_SHARED_TOKEN` is set in `backend/.env`.
- If it is set, the same token must be entered in extension **Options** (`Backend Shared Token`).
- If you use `ALLOWED_EXTENSION_ORIGINS`, confirm it includes your published `chrome-extension://<extension-id>` origin.
- If you moved backend off localhost or the default Vercel backend, confirm `manifest.json` has your backend domain in `host_permissions` before packaging.
- If backend logs look empty on Vercel, remember `/api/logs/recent` is best-effort and may reset on cold starts; check Vercel Runtime Logs for durable backend visibility.
- Gmail matching now uses the visible thread participants as the primary signal and can optionally enrich that with the Gmail API.
- To enable Gmail API enrichment, add an `oauth2` client ID for this extension in `manifest.json` and request `https://www.googleapis.com/auth/gmail.readonly`.

## Local vs Chrome Web Store auth

- Local unpacked development and the Chrome Web Store build can use different backend auth paths.
- Local development can keep using `http://localhost:8787` and either a shared token or your unpacked extension origin in `ALLOWED_EXTENSION_ORIGINS`.
- Chrome Web Store builds should keep `src/org-defaults.json` tokenless and authorize the published `chrome-extension://<extension-id>` origin on the Vercel backend instead.
- Packaged builds should not target Vercel preview URLs; only the stable production origin should be allowed.

## Architecture and security model

- Extension never stores Gem/Ashby API keys.
- Chrome Web Store builds should not ship org-wide backend shared tokens in `src/org-defaults.json`.
- Local backend reads secrets from `backend/.env`; Vercel production reads them from Vercel project env vars.
- Backend only exposes allowlisted action routes (not a generic proxy).
- Backend shared-token auth (`X-Backend-Token`) and extension-origin allowlisting can gate backend routes.
- Backend and extension logs redact token/key/secret/password-like fields.
- Vercel deployments treat in-memory caches and `/tmp` logs as disposable warm-instance optimizations, not durable storage.

## Org defaults file

- `src/org-defaults.json` is bundled with the extension and auto-applied on install/startup.
- It only fills missing/default values, so users can still override settings in options if needed.
- Keep `backendSharedToken` empty in Chrome Web Store builds.
- Start from `src/org-defaults.example.json`.

## Development notes

- No npm dependencies are currently required by `backend/server.js`.
- Secrets and runtime logs are intentionally gitignored in `backend/.gitignore`:
  - `.env`
  - `.env.local`
  - `logs/`
