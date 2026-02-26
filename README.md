# Gem LinkedIn Shortcuts Extension

Chrome extension + backend service that lets you run Gem and Ashby workflows from LinkedIn profile pages using keyboard shortcuts or popup buttons.

## Core capabilities

From a LinkedIn profile page (`https://www.linkedin.com/in/...`), the extension can:

1. Add prospect to Gem.
2. Add candidate to a Gem project (with in-page project picker).
3. Upload candidate to Ashby for a selected job.
4. Open candidate profile in Ashby.
5. Open candidate profile in Gem.
6. Set a Gem custom field value.
7. Add note to candidate in Gem.
8. Manage candidate emails (add email, copy primary email, view/copy all, set primary).
9. Set a reminder (note + due date).
10. Open sequence in Gem UI.
11. Edit sequence in Gem UI.

## Recommended org rollout (non-forced, install-from-link)

This is the easiest path if you want users to click a link, install once, and use immediately:

1. Deploy `backend/server.js` to a stable HTTPS URL (for example `https://api.rebuilding-gem.com`).
2. Configure backend secrets in deployment env vars (`GEM_API_KEY`, `ASHBY_API_KEY`, etc).
   - Leave `GEM_DEFAULT_USER_ID` and `GEM_DEFAULT_USER_EMAIL` empty for multi-user org setup.
   - Each user selects themselves in extension Options using the built-in "Load Users" picker.
3. Set extension defaults in `src/org-defaults.json`:
   - `backendBaseUrl`: your hosted backend URL
   - `backendSharedToken`: optional (only if backend enforces `BACKEND_SHARED_TOKEN`)
   - leave `createdByUserId` empty so users can pick their own Gem account
   - optional defaults for project/sequence/custom field IDs
4. Ensure `manifest.json` includes your backend origin in `host_permissions`.
5. Publish in Chrome Web Store as unlisted/private and share the install link.
6. Use `https://<your-backend-domain>/privacy` as Chrome Web Store privacy policy URL.

The extension now auto-applies `src/org-defaults.json` on install/startup, so users do not need to open options or use terminal.

Build upload zip for Chrome Web Store:

```bash
bash scripts/package-extension.sh
```

Chrome Web Store copy/template files:
- `docs/chrome-web-store-listing.md`
- `docs/privacy-policy.md`

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
# Optional shared-token gate:
# BACKEND_SHARED_TOKEN=<random_long_token>
# Optional:
# GEM_DEFAULT_USER_ID=<your_gem_user_id>
# GEM_DEFAULT_USER_EMAIL=<your_email@example.com>
# ASHBY_API_KEY=<your_ashby_api_key>
EOF
```

To get it to work, set at least:

- `GEM_API_KEY`
- `ASHBY_API_KEY`
- `BACKEND_SHARED_TOKEN` only if you want token-gated backend routes
- If no `GEM_DEFAULT_USER_ID`/`GEM_DEFAULT_USER_EMAIL` is set, each user must pick themselves in extension Options (`Load Users` -> select user -> Save).

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
{"ok":true}
```

### 4. Load the extension in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the repo root folder (`gem-linkedin-shortcuts-extension`)
5. Refresh the loaded extension
6. (Recommended) Click **Keyboard shortcuts** -> Set a shortcut for activating the extension (I use cmd + g)
7. Open a Linkedin-profile (which is already stored in our gem)
8. Activate the extension -> click "open options"
9. If backend token auth is enabled, set the same token in extension options (`Backend Shared Token`) and backend `.env` (`BACKEND_SHARED_TOKEN`).
10. Refresh the extension again + Reload the Linkedin-profile
11. GTG!

- Your preferred shortcuts

### 5. Default shortcut map:

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
- If you moved backend off localhost, confirm `manifest.json` has your backend domain in `host_permissions`.

## Architecture and security model

- Extension never stores Gem/Ashby API keys.
- Backend reads secrets from `backend/.env`
- Backend only exposes allowlisted action routes (not a generic proxy).
- shared-token auth (`X-Backend-Token`) can gate all backend routes.
- Backend and extension logs redact token/key/secret/password-like fields.

## Org defaults file

- `src/org-defaults.json` is bundled with the extension and auto-applied on install/startup.
- It only fills missing/default values, so users can still override settings in options if needed.
- Start from `src/org-defaults.example.json`.

## Development notes

- No npm dependencies are currently required by `backend/server.js`.
- Secrets and runtime logs are intentionally gitignored in `backend/.gitignore`:
  - `.env`
  - `.env.local`
  - `logs/`
