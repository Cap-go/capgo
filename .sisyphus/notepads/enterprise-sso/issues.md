# Enterprise SSO - Issues & Gotchas

## [2026-02-23] Known Gotchas

### Backend
- Supabase admin client pitfall: if you call `supabaseAdmin.auth.signInWithPassword()`, that client becomes authenticated as the user. Always use a SEPARATE admin client for sign-in.
- `get_identity_org_allowed()` is LAST RESORT — only when table has NO app_id and NO way to join to get one
- RLS policies: ONE policy per table per operation (merge conditions with OR)
- `auth.uid()` should be called only ONCE per policy using subquery pattern

### Frontend
- `detectSessionInUrl: false` in supabase.ts — SSO callback MUST manually call `exchangeCodeForSession`
- Do NOT reuse `confirm-signup.vue` for SSO callback (has specific redirect guardrails)
- Konsta components ONLY for safe area helpers — use DaisyUI for everything else

### Testing
- Tests run in parallel — NEVER modify shared test@capgo.app user or com.demo.app
- Create dedicated seed data in supabase/seed.sql for SSO tests
- Use `it.concurrent()` for parallel tests within same file
