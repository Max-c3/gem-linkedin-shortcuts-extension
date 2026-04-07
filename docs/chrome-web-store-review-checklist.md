# Chrome Web Store Review Checklist

Use this before uploading a new package.

## Backend

1. Deploy the backend to the HTTPS origin used in `src/org-defaults.json` (default: `https://project-ak83q.vercel.app`), or update both `src/org-defaults.json` and `manifest.json` before packaging.
2. Set `ALLOWED_EXTENSION_ORIGINS=chrome-extension://<published_extension_id>` on the backend for the published Chrome Web Store item.
3. Leave `src/org-defaults.json` with an empty `backendSharedToken`.
4. If `BACKEND_SHARED_TOKEN` was ever used in production or committed during development, rotate it before the next release.
5. Confirm the privacy policy is reachable at `https://project-ak83q.vercel.app/privacy`, unless you intentionally changed the production backend domain.
6. Do not point the packaged extension at a Vercel preview deployment.

## Extension package

1. Update `manifest.json` version for the release.
2. Run:

```bash
bash scripts/package-extension.sh
```

3. Confirm the zip exists in `dist/`.
4. Upload the generated zip to the existing Chrome Web Store item.

## Store submission

1. Update the listing copy from `docs/chrome-web-store-listing.md`.
2. Use `docs/privacy-policy.md` for the public privacy policy text if you need to mirror it outside the backend route.
3. Make sure the Chrome Web Store privacy questionnaire matches the current behavior:
   - supported pages are LinkedIn, Gem candidate/project, and GitHub profile pages
   - actions send recruiting workflow data to your hosted backend
   - API keys are stored only on the backend
