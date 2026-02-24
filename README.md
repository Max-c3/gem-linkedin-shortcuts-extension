# Gem LinkedIn Shortcuts Extension

Chrome extension + local backend that lets you run Gem and Ashby workflows from LinkedIn profile pages using keyboard shortcuts or popup buttons.

## What this repo contains

- `src/`: Manifest V3 extension code (background worker, LinkedIn/Gem content scripts, popup/options UI).
- `backend/`: Node.js HTTP backend that holds API keys and exposes fixed action routes.
- `references/`: API reference files used by the backend implementation.

No frontend build step is required. The extension is loaded unpacked in Chrome.

## Core capabilities

From a LinkedIn profile page (`https://www.linkedin.com/in/...`), the extension can:

1. Add prospect to Gem.
2. Add candidate to a Gem project (with in-page project picker).
3. Upload candidate to Ashby for a selected job.
4. Open candidate profile in Ashby.
5. Open candidate profile in Gem.
6. Set a Gem custom field value.
7. Set a reminder (note + due date).
8. Open sequence in Gem UI.
9. Edit sequence in Gem UI.

## Architecture and security model

- Extension never stores Gem/Ashby API keys.
- Backend reads secrets from `backend/.env` (or `.env.local`).
- Backend only exposes allowlisted action routes (not a generic proxy).
- Optional shared-token auth (`X-Backend-Token`) can gate all backend routes.
- Backend and extension logs redact token/key/secret/password-like fields.

## Prerequisites

- macOS + Google Chrome (Manifest V3 extension flow is documented for Chrome).
- Node.js 18+ (recommended).
- Access to:
  - Gem API key (required for Gem actions).
  - Ashby API key (only required for Ashby actions).

## Quick start (first-time setup)

### 1. Clone and enter repo

```bash
git clone git@github.com:max-c3/gem-linkedin-shortcuts-extension.git
cd gem-linkedin-shortcuts-extension
```

### 2. Configure backend environment

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` and set at least:

- `GEM_API_KEY`
- `GEM_DEFAULT_USER_ID` or `GEM_DEFAULT_USER_EMAIL`

If you want Ashby actions, also set:

- `ASHBY_API_KEY`

For stronger security, also set:

- `BACKEND_SHARED_TOKEN` (random, long value)

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

### 5. Configure extension options

Open extension **Options** and set:

- `Backend Base URL`: `http://localhost:8787` (default)
- `Backend Shared Token`: required only if backend has `BACKEND_SHARED_TOKEN`
- `Created By User ID`: if you did not set a default user in backend env
- Any optional defaults (project, sequence, custom field)
- Your preferred shortcuts

### 6. Verify end-to-end

1. Open any LinkedIn profile (`https://www.linkedin.com/in/...`).
2. Trigger `Add Prospect` (default: `Cmd+Option+1`) or click button from popup.
3. Confirm success toast/log entry.

## Backend configuration reference

`backend/.env.example` documents all supported values.

| Variable | Required | Purpose |
|---|---|---|
| `PORT` | No | Backend port (default `8787`) |
| `GEM_API_KEY` | Yes (Gem actions) | Gem API auth key |
| `GEM_API_BASE_URL` | No | Gem API base URL (default `https://api.gem.com`) |
| `GEM_DEFAULT_USER_ID` | Recommended | Default Gem user ID for create/add/reminder attribution |
| `GEM_DEFAULT_USER_EMAIL` | Recommended fallback | Used to resolve Gem user when ID not supplied |
| `BACKEND_SHARED_TOKEN` | Recommended | If set, every POST route requires matching `X-Backend-Token` |
| `LOG_DIR` | No | Backend log directory (default `./logs`) |
| `LOG_MAX_BYTES` | No | Rotate `events.jsonl` after threshold (default `5242880`) |
| `PROJECTS_SCAN_MAX` | No | Max project scan size |
| `ASHBY_API_KEY` | Yes (Ashby actions) | Ashby API key |
| `ASHBY_API_BASE_URL` | No | Ashby API base URL (default `https://api.ashbyhq.com`) |
| `ASHBY_CREDITED_TO_USER_ID` | No | Explicit Ashby credited user ID |
| `ASHBY_CREDITED_TO_USER_EMAIL` | No | Fallback for credited user lookup |
| `ASHBY_JOBS_SCAN_MAX` | No | Max Ashby jobs scan size |
| `ASHBY_WRITE_ENABLED` | No | Master switch for Ashby mutating calls (default `false`) |
| `ASHBY_WRITE_REQUIRE_CONFIRMATION` | No | Requires confirmation token for writes (default `true`) |
| `ASHBY_WRITE_CONFIRMATION_TOKEN` | Strongly recommended | Confirmation token for Ashby writes |
| `ASHBY_WRITE_ALLOWED_METHODS` | No | Comma-separated allowlist of permitted Ashby write RPC methods |

## Extension settings reference

In Options:

- `Enable extension`: global on/off.
- `Backend Base URL`: backend address.
- `Backend Shared Token`: must match backend env if enabled.
- `Created By User ID`: fallback when backend default is not set.
- `Project ID`, `Sequence ID`, `Custom Field ID`, `Custom Field Value`: optional defaults.
- `Activity URL Template`, `Sequence URL Template`: optional URL fallback templates.
- Shortcut editor: validates uniqueness and requires modifier keys.

Default shortcut map:

- `Cmd+Option+1` Add Prospect
- `Cmd+Option+2` Add to Project
- `Cmd+Option+3` Open Profile in Gem
- `Cmd+Option+4` Set Custom Field
- `Cmd+Option+5` Open Sequence
- `Cmd+Option+7` Set Reminder
- `Cmd+Option+8` Upload to Ashby
- `Cmd+Option+9` Edit Sequence
- `Cmd+Option+0` Open Profile in Ashby

## Backend endpoints (for debugging)

- `GET /health`
- `POST /api/candidates/find-by-linkedin`
- `POST /api/candidates/create-from-linkedin`
- `POST /api/projects/add-candidate`
- `POST /api/projects/list`
- `POST /api/ashby/jobs/list`
- `POST /api/ashby/candidates/find-by-linkedin`
- `POST /api/ashby/upload-candidate`
- `POST /api/custom-fields/list`
- `POST /api/candidates/set-custom-field`
- `POST /api/candidates/set-due-date`
- `POST /api/candidates/get`
- `POST /api/sequences/list`
- `POST /api/sequences/get`
- `POST /api/users/list`
- `POST /api/logs/client`
- `POST /api/logs/recent`

If `BACKEND_SHARED_TOKEN` is set, include:

```http
X-Backend-Token: <your token>
```

## Logs and observability

- Backend logs: `backend/logs/events.jsonl` (rotates when max size is exceeded).
- Extension local logs: stored in Chrome local storage.
- Options page can:
  - Refresh and merge backend + local logs.
  - Export rendered logs as JSON.
  - Clear local logs.

## Troubleshooting

- `Could not reach backend (...)`
  - Ensure backend is running and `Backend Base URL` is correct.
  - Default startup command: `cd backend && npm start`.

- `Unauthorized`
  - `BACKEND_SHARED_TOKEN` is set on backend but missing/mismatched in extension options.

- `Missing backend base URL in extension settings`
  - Set `Backend Base URL` in options.

- `Could not determine LinkedIn handle from current profile`
  - Open a real LinkedIn profile URL (`/in/...`) and retry.

- Ashby actions fail
  - Set `ASHBY_API_KEY`.
  - If writes are intended, verify `ASHBY_WRITE_ENABLED`, confirmation token, and allowlisted method config.

- Sequence action opens editor instead of sending
  - Expected behavior. Gem send/activate is intentionally handled in Gem UI.

## Development notes

- No npm dependencies are currently required by `backend/server.js`.
- Secrets and runtime logs are intentionally gitignored in `backend/.gitignore`:
  - `.env`
  - `.env.local`
  - `logs/`
