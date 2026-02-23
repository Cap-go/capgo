# Enterprise SSO - Learnings

## [2026-02-23] Session Initialized

### Key Architecture Patterns
- Backend: Hono + Zod + middlewareAuth in `supabase/functions/_backend/private/`
- DB: PostgreSQL via Supabase, migrations in `supabase/migrations/`
- Frontend: Vue 3 + Composition API + `<script setup>` + DaisyUI
- Plans: Solo=1, Maker=2, Team=3, Enterprise=4 via `planToInt()`
- User provisioning pattern: `accept_invitation.ts` — auth.users → public.users → org_users + role_bindings

### Critical Conventions
- ALL PostgreSQL functions MUST have `SET search_path = ''` and fully qualified names
- RLS: Use `get_identity_org_appid()` when app_id exists, `get_identity_org_allowed()` as last resort
- HTTP responses: `c.json(data)` for success, `simpleError()`/`quickError()` for errors, NEVER `c.body(null, 204)`
- Tests: ALL test files run in parallel — create isolated seed data, never modify shared test@capgo.app
- Commit messages: Conventional Commits format
- No semicolons, single quotes (ESLint @antfu/eslint-config)

### SSO-Specific Decisions
- SAML 2.0 only via Supabase built-in SSO
- Management API token: `SUPABASE_MANAGEMENT_API_TOKEN` env var
- DNS verification: Cloudflare DNS-over-HTTPS (not Deno native DNS)
- Pre-linking: Delete password identity, link SSO to same UUID
- Break-glass: `org_super_admin` role bypasses SSO enforcement
- SSO callback: New `sso-callback.vue` (NOT reusing confirm-signup.vue)
- `detectSessionInUrl: false` in supabase.ts — must use `exchangeCodeForSession` manually


## [2026-02-23] Task 1: sso_providers Migration

### RBAC Permission Pattern
- Permission functions: `rbac_perm_org_*()` returns `'org.*'::text` with `SET search_path = ''`
- Register in `public.permissions` table: `INSERT INTO public.permissions (key, scope_type, description)`
- Attach to roles via `public.role_permissions` (role_id, permission_id) JOIN pattern
- Update `rbac_legacy_right_for_permission()` to map new permission to legacy `user_min_right`

### CRITICAL: seed.sql Wipes Permissions on TRUNCATE
- `TRUNCATE auth.users CASCADE` in seed.sql wipes `public.permissions` and `public.role_permissions`
- seed.sql re-inserts all permissions manually at line ~1067
- ANY new RBAC permission MUST be added to BOTH the migration AND seed.sql
- Without seed.sql update, `bunx supabase db reset` will succeed but permissions will be missing

### RLS for Tables Without app_id
- Use `get_identity_org_allowed()` (last resort pattern per AGENTS.md)
- Pattern: `check_min_rights('admin'::user_min_right, get_identity_org_allowed('{read,...}'::key_mode[], org_id), org_id, NULL::varchar, NULL::bigint)`
- Both `anon` and `authenticated` roles required
- One policy per table per operation (no duplicates)

### updated_at Trigger Pattern
- Custom function preferred over `extensions.moddatetime` for new tables (gives control)
- Function MUST have `SET search_path TO ''` and `LANGUAGE plpgsql`
- Pattern: `NEW.updated_at = now(); RETURN NEW;`
