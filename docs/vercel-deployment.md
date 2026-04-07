# Vercel Deployment

Use this when running the hosted backend on Vercel.

## Production URL

- Default production URL in this repo: `https://project-ak83q.vercel.app`
- Public routes exposed by the backend:
  - `/api/*`
  - `/health`
  - `/privacy`

If you intentionally use a different production domain, update all of these together before packaging a release:

- `src/org-defaults.json`
- `src/shared.js`
- `manifest.json`
- Chrome Web Store privacy policy URL

## Vercel project setup

1. Import the repository into Vercel.
2. Keep the default build behavior; the backend is served by Vercel Node functions under `api/`.
3. Set production environment variables in the Vercel project:
   - `GEM_API_KEY`
   - `ASHBY_API_KEY` if Ashby reads/search are enabled
   - `ASHBY_WRITE_ENABLED=true` if Ashby writes are enabled
   - `ASHBY_WRITE_CONFIRMATION_TOKEN=<token>` if `ASHBY_WRITE_REQUIRE_CONFIRMATION` stays enabled
   - `ASHBY_WRITE_REQUIRE_CONFIRMATION=false` only if you intentionally disable the extra write gate
   - `ALLOWED_EXTENSION_ORIGINS=chrome-extension://<published_extension_id>` for Chrome Web Store builds
   - `BACKEND_SHARED_TOKEN=<token>` only for private/manual installs where users enter the same token in extension options
   - optional defaults: `GEM_DEFAULT_USER_ID`, `GEM_DEFAULT_USER_EMAIL`, `ASHBY_CREDITED_TO_USER_ID`, `ASHBY_CREDITED_TO_USER_EMAIL`
4. Deploy to production.

## Runtime notes

- The backend is serverless on Vercel. In-memory caches may disappear on cold start or scale-out.
- Backend log files are written best-effort to `/tmp` on Vercel, so `/api/logs/recent` is not durable history.
- Use Vercel Function/Runtime Logs as the durable backend debugging source.
- The packaged extension should only use the stable production backend origin. Preview deployments are out of scope.

## Verification

1. Check `https://project-ak83q.vercel.app/health`.
2. Check `https://project-ak83q.vercel.app/privacy`.
3. Verify the extension can reach:
   - `/api/projects/list`
   - `/api/users/list`
   - `/api/logs/client`
4. Confirm `ALLOWED_EXTENSION_ORIGINS` blocks unauthorized origins when configured.
5. Package the extension and confirm `manifest.json` host permissions include only the production backend origin plus localhost loopback entries.

## Local development

- Local development remains the same:
  - `cd backend`
  - `npm start`
- Point the extension at `http://localhost:8787` during local development.
- You do not need to use `vercel dev` for the normal extension workflow.
