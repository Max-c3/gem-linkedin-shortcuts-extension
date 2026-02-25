# Gem LinkedIn Shortcuts Extension

Chrome extension + local backend that lets you run Gem and Ashby workflows from LinkedIn profile pages using keyboard shortcuts or popup buttons.

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

## Quick start (first-time setup)

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
GEM_DEFAULT_USER_ID=<your_gem_user_id>
# Optional:
# GEM_DEFAULT_USER_EMAIL=<your_email@example.com>
# ASHBY_API_KEY=<your_ashby_api_key>
# BACKEND_SHARED_TOKEN=<random_long_token>
EOF
```

❗️ Ideally just ask Max to send you the content of his .env-file!!

Otherwise, to get it to work, set at least:

- `GEM_API_KEY`
- `GEM_DEFAULT_USER_ID` or `GEM_DEFAULT_USER_EMAIL`
- `ASHBY_API_KEY`
- `BACKEND_SHARED_TOKEN` (random, long value — more on this below!)

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
9. ! The same **Backend Token** needs to be present in the field "Backend Shared Token" AND in the .env-file. It can be any combination of tokens, but it needs to be present in both. So:
10. Add token to **Backend Shared Token (optional)** (it is NOT optional, need to fix this) — e.g.: 7a04ed5949f4fa047b3ed7db7c1e086538b9de070034d0e916b89421097778c5 -> then click "Save" at the bottom of the page.
11. Open the .env-file, and add the SAME token (e.g.: BACKEND_SHARED_TOKEN=7a04ed5949f4fa047b3ed7db7c1e086538b9de070034d0e916b89421097778c5)
12. Refresh the extension again + Reload the Linkedin-profile
13. GTG!

- Your preferred shortcuts

### 5. Default shortcut map:

- `Cmd+Option+1` Add Prospect
- `Cmd+Option+2` Add to Project
- `Cmd+Option+3` Open Profile in Gem
- `Cmd+Option+4` Set Custom Field
- `Cmd+Option+5` Open Sequence
- `Cmd+Option+6` Add Note to Candidate
- `Cmd+Option+E` Manage Emails
- `Cmd+Option+7` Set Reminder
- `Cmd+Option+8` Upload to Ashby
- `Cmd+Option+9` Edit Sequence
- `Cmd+Option+0` Open Profile in Ashby

## Troubleshooting

- If you see `Could not load projects: Unauthorized`, check whether `BACKEND_SHARED_TOKEN` is set in `backend/.env`.
- If it is set, the same token must be entered in extension **Options** (`Backend Shared Token`).
- If you do not want token auth locally, remove `BACKEND_SHARED_TOKEN` from `backend/.env` and restart the backend.

## Architecture and security model

- Extension never stores Gem/Ashby API keys.
- Backend reads secrets from `backend/.env`
- Backend only exposes allowlisted action routes (not a generic proxy).
- shared-token auth (`X-Backend-Token`) can gate all backend routes.
- Backend and extension logs redact token/key/secret/password-like fields.

## Development notes

- No npm dependencies are currently required by `backend/server.js`.
- Secrets and runtime logs are intentionally gitignored in `backend/.gitignore`:
  - `.env`
  - `.env.local`
  - `logs/`
