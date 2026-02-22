# Gem LinkedIn Shortcuts Extension

Chrome extension + backend for running Gem actions from LinkedIn profile pages via keyboard shortcuts.

## Security model

- Extension does not store the Gem API key.
- Backend stores `GEM_API_KEY` in environment variables.
- Backend exposes fixed action routes only (no generic proxy).

## Included actions

1. Add candidate from LinkedIn profile
2. Add candidate to project (opens in-page project picker with case-insensitive contains search + arrow key selection)
3. Open profile in Gem (uses candidate `weblink` if available)
4. Set candidate custom field (letter-select field, then number-select value)
5. Set reminder (in-page modal with reminder text + date picker + DDMMYYYY keyboard date entry)
6. Open sequence in Gem UI (verifies sequence exists first)
7. View activity feed in-page (notes + candidate events + created entry)

## Observability and logs

- Backend audit log file: `/Users/maximilian/coding/gem-linkedin-shortcuts-extension/backend/logs/events.jsonl`
- Each event contains timestamp, level, event name, run ID, action ID, message, link, and details.
- Extension emits client-side telemetry and forwards it to backend logs when backend is reachable.
- Options page includes Activity Log tools:
  - Refresh logs
  - Export JSON
  - Clear local extension logs

## Backend setup

```bash
cd /Users/maximilian/coding/gem-linkedin-shortcuts-extension/backend
cp .env.example .env
```

Set required env vars in `.env`:

- `GEM_API_KEY` (required)
- `GEM_DEFAULT_USER_ID` or `GEM_DEFAULT_USER_EMAIL` (recommended, used for candidate creation, project attribution, and reminder assignee defaults)
- `ASHBY_API_KEY` (required for Ashby API calls)
- `ASHBY_WRITE_ENABLED` (must remain `false` unless you explicitly approve live Ashby writes)
- `ASHBY_WRITE_REQUIRE_CONFIRMATION` (recommended `true`, requires per-request confirmation token)
- `ASHBY_WRITE_CONFIRMATION_TOKEN` (recommended, extra guard before any Ashby write is allowed)
- `ASHBY_WRITE_ALLOWED_METHODS` (allowlist of Ashby mutating RPC methods)
- `BACKEND_SHARED_TOKEN` (optional but recommended)
- `LOG_DIR` (optional, default `./logs`)
- `LOG_MAX_BYTES` (optional, default `5242880`)

Start backend:

```bash
cd /Users/maximilian/coding/gem-linkedin-shortcuts-extension/backend
npm start
```

Health check:

```bash
curl -sS http://localhost:8787/health
```

## Load extension in Chrome

1. Open `chrome://extensions`
2. Turn on Developer mode
3. Click Load unpacked
4. Select `/Users/maximilian/coding/gem-linkedin-shortcuts-extension`
5. Open extension options and set:
   - Backend Base URL (default `http://localhost:8787`)
   - Backend Shared Token (if set on backend)
   - Created By User ID (if backend env does not set default user)
   - Default project/sequence/custom-field values
   - Keyboard shortcuts

## Notes

- Extension currently targets LinkedIn profile URLs: `https://www.linkedin.com/in/...`
- Sequence send/activate is not exposed in Gem public API schema; current flow opens Gem sequence UI for manual send/activate.
