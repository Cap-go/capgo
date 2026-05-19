# R2 lifecycle rules

This directory stores bucket-level R2 lifecycle configuration.

`lifecycle.capgo.json` deletes objects under `deleted-after-7-days/` after 7 days. That prefix must stay aligned with `R2_TRASH_PREFIX` in `supabase/functions/_backend/utils/s3.ts`.

Apply the tracked config:

```bash
bunx wrangler r2 bucket lifecycle set capgo --file cloudflare_workers/r2/lifecycle.capgo.json --force
```

Verify the rule:

```bash
bunx wrangler r2 bucket lifecycle list capgo
```

`lifecycle set` replaces the bucket lifecycle configuration. If the `capgo` bucket already has other lifecycle rules, add them to `lifecycle.capgo.json` before applying it.
