# capgo

## What this codebase does

Capgo is a live-update platform for Capacitor apps. The repo contains the Vue 3
console, the Capgo CLI workspace, Supabase Edge Functions for self-hosting, and
Cloudflare Worker entry points for production traffic. The hottest backend paths
are the plugin endpoints used by mobile devices: `/updates`, `/stats`, and
`/channel_self`; private console APIs and public customer APIs share core Hono
logic from `supabase/functions/_backend/`.

## Auth shape

- `middlewareAuth` validates Supabase JWTs with `getClaimsFromJWT` and writes
  `AuthInfo` into Hono context for user-session routes.
- `middlewareV2` accepts either JWT auth or Capgo API keys from `capgkey`,
  `authorization`, or `x-api-key`; it enforces key modes and failed-auth/IP
  throttling.
- `middlewareKey` is API-key-only auth for public/CLI routes and may resolve
  limited subkeys through `x-limited-key-id`.
- `middlewareAPISecret` protects trigger and cron functions with the `apisecret`
  header and timing-safe comparison.
- User-facing Supabase reads should prefer `supabaseClient`,
  `supabaseWithAuth`, or RLS-backed API-key clients; `supabaseAdmin` is for
  internal jobs, trusted server-side writes, and carefully reviewed exceptions.

## Threat model

Highest-impact failures are unauthorized app, bundle, channel, org, billing, or
RBAC mutations; malicious bundle upload/download paths; and bypasses that let a
device or API key read/update another app. Hot unauthenticated plugin endpoints
must preserve plan/on-prem response contracts while staying replica-safe and
bounded under high request volume. Admin dashboard features are read-only except
for impersonation; platform admin must not become a general write capability.

## Project-specific patterns to flag

- New private/public routes without `middlewareAuth`, `middlewareV2`,
  `middlewareKey`, or a deliberate public-device comment.
- User-facing handlers that use `supabaseAdmin` instead of a user/API-key client
  or that pass unsanitized user input into PostgREST filters.
- Plugin `/updates`, `/stats`, or `/channel_self` code that calls the primary DB
  in-request/background work, queries non-replicated views/functions, or changes
  the cached `429` `on_premise_app` / `need_plan_upgrade` response shapes.
- PostgreSQL functions, RPCs, RLS policies, or triggers missing
  `SET search_path = ''`, explicit privileges, or bounded indexed access.
- File/TUS/R2 paths that derive storage keys, bundle paths, or preview hostnames
  from request data without app ownership and plan checks.

## Known false-positives

- `supabase/functions/_backend/plugins/{updates,stats,channel_self}.ts` are
  intentionally unauthenticated device endpoints; validate plan/rate-limit/body
  checks instead of requiring JWT/API-key auth.
- `supabase/functions/_backend/triggers/**` uses service-role/admin access by
  design, but it should stay behind `middlewareAPISecret` or webhook signature
  validation.
- `tests/**`, `supabase/seed.sql`, and local Playwright fixtures contain demo
  credentials and isolated test data.
- `cloudflare_workers/snippet/index.js` intentionally inspects and caches some
  plugin error bodies at the edge; changing those bodies can be a production bug.
- `src/auto-imports.d.ts`, generated Supabase type files, native platform
  directories, and build outputs are mostly generated noise for security review.
