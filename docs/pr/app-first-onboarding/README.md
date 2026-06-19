# App-first onboarding media

Generate screenshots and a WebP walkthrough after local Supabase is running:

```bash
bun run supabase:start
bun run supabase:db:reset
SUPABASE_SERVICE_KEY="$(grep SUPABASE_SERVICE_KEY .env.test | cut -d= -f2-)" \
CAPGO_MEDIA_EMAIL="media-onboard@capgo.app" \
CAPGO_MEDIA_PASSWORD="CapgoMediaLocal!2026" \
BRANCH=local bun serve:dev
```

In another terminal:

```bash
SUPABASE_SERVICE_KEY="$(grep SUPABASE_SERVICE_KEY .env.test | cut -d= -f2-)" \
CAPGO_MEDIA_EMAIL="media-onboard@capgo.app" \
CAPGO_MEDIA_PASSWORD="CapgoMediaLocal!2026" \
node scripts/capture-app-first-onboarding-media.mjs
```

Outputs:

- `01-app-onboarding.png`
- `02-app-details-filled.png`
- `03-organization-onboarding.png`
- `04-organization-app-name-mode.png`
- `app-first-onboarding.webp`
