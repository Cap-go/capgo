# App-first onboarding media

Generate screenshots and a WebP walkthrough after local Supabase is running:

```bash
bun run supabase:start
bun run supabase:db:reset
bun backend
```

In one terminal (use your worktree Supabase port from `bun scripts/supabase-worktree.ts status`):

```bash
VITE_SUPABASE_URL=http://127.0.0.1:55411 \
VITE_SUPABASE_ANON_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH \
VITE_API_HOST=http://127.0.0.1:55411/functions/v1 \
VITE_APP_URL=http://localhost:5173 \
BRANCH=local bun vite
```

In another terminal:

```bash
SUPABASE_SERVICE_KEY="$(bun scripts/supabase-worktree.ts status | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>console.log(JSON.parse(s).SERVICE_ROLE_KEY))')" \
VITE_SUPABASE_URL=http://127.0.0.1:55411 \
VITE_SUPABASE_ANON_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH \
CAPGO_MEDIA_EMAIL="media-onboard@capgo.app" \
CAPGO_MEDIA_PASSWORD="CapgoMediaLocal!2026Zx" \
node scripts/capture-app-first-onboarding-media.mjs
```

Outputs:

- `01-app-onboarding.png`
- `02-app-details-filled.png`
- `03-organization-onboarding.png`
- `04-organization-app-name-mode.png`
- `app-first-onboarding.webp`
