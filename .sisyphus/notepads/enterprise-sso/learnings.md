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

## [2026-02-23] Task 2: Supabase Management API Utility Module

### Module Structure
- File: `supabase/functions/_backend/utils/supabase-management.ts`
- Exports 4 functions + 2 types for SSO provider management
- Uses Hono Context pattern consistent with other utilities

### Key Implementation Patterns
- **Error Handling**: Custom `ManagementAPIError` class with status, code, message, details
- **Logging**: `cloudlog()` for success, `cloudlogErr()` for errors (never expose token)
- **Environment**: `getEnv(c, 'SUPABASE_MANAGEMENT_API_TOKEN')` and `getEnv(c, 'SUPABASE_PROJECT_REF')`
- **Base URL**: `https://api.supabase.com/v1/projects/{ref}/config/auth/sso/providers`
- **Auth Header**: `Authorization: Bearer {token}`

### Function Signatures
```typescript
createSSOProvider(c: Context, domain: string, metadataUrl: string, attributeMapping?: Record<string, string>): Promise<SSOProviderResponse>
getSSOProvider(c: Context, providerId: string): Promise<SSOProviderResponse>
updateSSOProvider(c: Context, providerId: string, updates: Partial<SSOProviderUpdate>): Promise<SSOProviderResponse>
deleteSSOProvider(c: Context, providerId: string): Promise<void>
```

### Response Types
- `SSOProviderResponse`: id, type ('saml'), domains[], metadata_url, attribute_mapping?, created_at, updated_at
- `SSOProviderUpdate`: Partial update with domains?, metadata_url?, attribute_mapping?

### Error Handling Strategy
- Throw `ManagementAPIError` for non-2xx responses
- Log error details without exposing token
- Include requestId in all logs for tracing
- Catch fetch errors and wrap in ManagementAPIError

### Integration Points
- Used by SSO provider endpoints in `supabase/functions/_backend/private/`
- Called from org-level SSO configuration flows
- Requires SUPABASE_MANAGEMENT_API_TOKEN env var (set in production)

## [2026-02-23] Task 4: DNS Verification Utility

### Implementation: `dns-verification.ts`
- **Location**: `supabase/functions/_backend/utils/dns-verification.ts`
- **Function**: `verifyDnsTxtRecord(domain, expectedToken): Promise<DnsVerificationResult>`
- **API**: Cloudflare DNS-over-HTTPS (DoH) at `https://cloudflare-dns.com/dns-query`
- **Query**: `?name=_capgo-sso.{domain}&type=TXT` with `Accept: application/dns-json` header

### Key Implementation Details
- **TXT Record Type**: DNS type 16 (numeric value in Cloudflare response)
- **Quote Handling**: TXT data may be quoted (`"value"`), regex strips outer quotes: `/^"(.*)"$/`
- **Status Codes**: 
  - Status 0 = NOERROR (success, may have no records)
  - Status 3 = NXDOMAIN (domain not found)
- **Error Handling**: Returns `{ verified: false, error: string }` on network/parse errors, never throws
- **Return Type**: `DnsVerificationResult { verified: boolean, records?: string[], error?: string }`

### Testing Results
- ✓ Nonexistent token in real domain (google.com) → `verified: false, records: []`
- ✓ Invalid domain (empty string) → `verified: false, error: 'Invalid domain'`
- ✓ Nonexistent domain → `verified: false, records: []`
- ✓ No exceptions thrown in any error case
- ✓ Cloudflare DoH API integration working correctly

### Code Style Compliance
- No semicolons, single quotes (ESLint @antfu/eslint-config)
- JSDoc docstring for public API (necessary for contract clarity)
- Inline comments for DNS protocol details (necessary for security/correctness)
- Async/await pattern (no synchronous DNS calls)
- Works in both Deno (Supabase) and Cloudflare Workers (native fetch)

### Integration Notes
- Ready for use in SSO provider verification flows
- Can be imported: `import { verifyDnsTxtRecord } from '../utils/dns-verification.ts'`
- No external dependencies (uses native fetch + JSON parsing)

## [2026-02-23] Task 8: Enterprise Plan Validation Utility

### Implementation: `plan-gating.ts`
- **Location**: `supabase/functions/_backend/utils/plan-gating.ts`
- **Exports**: `requireEnterprisePlan(c, orgId)` and `hasFeature(c, orgId, feature)`

### Function Behaviors
- **requireEnterprisePlan**: Throws `quickError(403, 'enterprise_plan_required', ...)` if org not on Enterprise
- **hasFeature**: Returns boolean, gracefully returns false on error (no throw)
- Both use `getCurrentPlanNameOrg()` RPC to fetch current plan (no caching)

### Plan Name Mapping
- From `planToInt()` in `plans.ts`: Solo=1, Maker=2, Team=3, Enterprise=4
- Enterprise plan name: exact string `'Enterprise'` (case-sensitive)
- No hardcoded plan names — uses RPC function for dynamic lookup

### Feature Extensibility
- `hasFeature()` uses `featureRequirements` map: `Record<string, string[]>`
- Currently: `sso: ['Enterprise']`
- Easy to add new features: just add entry to map
- Unknown features return false (safe default)

### Error Handling Pattern
- `requireEnterprisePlan`: Throws on error (caller must handle)
- `hasFeature`: Returns false on error (graceful degradation)
- All errors logged with requestId for tracing
- Uses `cloudlog()` for success, `cloudlogErr()` for errors

### Integration Notes
- Ready for import in SSO provider endpoints
- Follows Hono Context pattern consistent with other utilities
- No external dependencies beyond existing utilities
- Linting passes (no semicolons, single quotes, proper types)

## [2026-02-23] Task 3: Domain Check Endpoint

### Implementation: `check-domain.ts`
- **Location**: `supabase/functions/_backend/private/sso/check-domain.ts`
- **Route**: `POST /private/sso/check-domain`
- **Authentication**: `middlewareAuth` (JWT required)

### Input/Output Contract
- **Input**: `{ email: string }` (Zod validated with `.check(z.email())`)
- **Output**: `{ has_sso: boolean, provider_id?: string, org_id?: string }`
- **Sensitive fields NOT returned**: metadata_url, dns_verification_token, attribute_mapping

### Key Implementation Details
- **Domain extraction**: `email.split('@')[1]` (simple, safe for valid emails)
- **Query**: `SELECT id, org_id, provider_id FROM sso_providers WHERE domain = $1 AND status = 'active' LIMIT 1`
- **Error handling**: PGRST116 (no rows) returns `{ has_sso: false }`, other errors return 500
- **Logging**: All queries logged with requestId for tracing

### Zod Mini Limitation
- `z.string().email()` does NOT exist in zod/mini
- Use `.check(z.email())` instead (pattern from validate_password_compliance.ts)
- Also applies to other validators: `.check(z.uuid())`, `.check(z.minLength(1))`, etc.

### Router Registration Pattern
- Import in `supabase/functions/private/index.ts`: `import { app as sso_check_domain } from '../_backend/private/sso/check-domain.ts'`
- Register route: `appGlobal.route('/sso/check-domain', sso_check_domain)`
- Endpoints are organized alphabetically in the router file

### Testing Results
- ✓ Non-SSO domain (example.com) → `{ has_sso: false }`
- ✓ JWT authentication required (middlewareAuth enforced)
- ✓ Email validation working (Zod)
- ✓ No sensitive fields in response

### SQL Function Pattern for RPC
- **Location**: Add to migration file, not separate file
- **Signature**: `CREATE OR REPLACE FUNCTION "public"."check_domain_sso"("p_domain" text) RETURNS TABLE(...)`
- **Return type**: Use TABLE() for multiple columns, not SETOF
- **Grants**: Must grant to anon, authenticated, service_role
- **Integration**: Call via `supabase.rpc('check_domain_sso', { p_domain: domain })`

### TypeScript Type Issues with New RPC Functions
- New RPC functions not in auto-generated types until `bun types` is run
- Use `(supabase.rpc as any)('function_name', params)` as workaround
- Type regeneration: `bun types` (runs `scripts/getTypes.mjs`)
- After regeneration, types are available in `supabase/functions/_backend/utils/supabase.types.ts`

### Supabase Client Selection
- `emptySupabase(c)`: For unauthenticated RPC calls (no JWT needed)
- `supabaseClient(c, jwt)`: For authenticated RPC calls (requires JWT string)
- `supabaseAdmin(c)`: For service-role operations (admin access)
- Use `emptySupabase` for public RPC functions that don't require auth

### Router Import Ordering
- Imports must be alphabetically sorted by path
- Pattern: `import { app as name } from '../_backend/private/path/file.ts'`
- Sorting is by full path: `sso/check-domain` comes before `stats`, `stripe_checkout`, etc.
- ESLint perfectionist/sort-imports enforces this

### Testing Endpoint Without SSO Data
- Non-SSO domain returns `{ has_sso: false }` (no error)
- RPC function returns empty array when no rows match
- Check with: `if (!data || (Array.isArray(data) && data.length === 0))`
- Always test with real JWT from test user (test@capgo.app / testtest)

## [2026-02-23] Task 5: SSO Provider CRUD Endpoints

### Endpoint Implementation
- New router: `supabase/functions/_backend/private/sso/providers.ts`
- Mounted at: `/private/sso/providers`
- Methods: `POST /`, `GET /:orgId`, `PATCH /:id`, `DELETE /:id`
- Middleware: `app.use('*', middlewareAuth)` + `useCors`

### Security and Permission Patterns
- Permission guard uses `checkPermission(c, 'org.manage_sso', { orgId })` before DB access per endpoint
- CREATE enforces `requireEnterprisePlan(c, org_id)` before writing provider row
- Response sanitizer strips `dns_verification_token` from all create/list/update payloads
- PATCH intentionally excludes domain updates (only metadata_url, attribute_mapping, enforce_sso)

### SSO Provider Lifecycle Notes
- CREATE calls Supabase Management API `createSSOProvider` first, then inserts DB row with `provider_id`
- DNS token generated as 32-char hex using 16 random bytes (`crypto.getRandomValues`)
- DELETE deletes DB row first, then calls Management API `deleteSSOProvider` only if `provider_id` exists
- This order prevents external provider deletion when DB deletion fails

### Type and Validation Notes
- For new/untyped tables (`sso_providers`), cast authenticated client to `any` to avoid stale generated type errors
- Zod mini body schemas use `.check(...)`; custom parser validates `attribute_mapping` as an object with string values
- UUID path params validated explicitly with shared UUID schema before query execution

## [2026-02-23] Task 7: SSO Enforcement Check Endpoint

### Implementation: `check-enforcement.ts`
- **Location**: `supabase/functions/_backend/private/sso/check-enforcement.ts`
- **Route**: `POST /private/sso/check-enforcement`
- **Authentication**: `middlewareAuth` (JWT required)

### Input/Output Contract
- **Input**: `{ email: string, auth_type: 'password' | 'sso' }`
- **Output**: `{ allowed: boolean, reason?: string }`
- **Reason values**: `'sso_enforced'` (only when allowed=false)

### Logic Flow
1. **SSO auth always allowed**: If `auth_type = 'sso'`, return `{ allowed: true }` immediately
2. **Extract domain**: `email.split('@')[1]` (same pattern as check-domain.ts)
3. **Query provider**: Use `check_domain_sso` RPC to find active SSO provider
   - No provider found → `{ allowed: true }` (no enforcement)
   - Provider found → extract `org_id`
4. **Check enforcement flag**: Query `sso_providers.enforce_sso`
   - `enforce_sso = false` → `{ allowed: true }`
   - `enforce_sso = true` → proceed to role check
5. **Check break-glass bypass**: Query `org_users.role` for user in org
   - `role = 'org_super_admin'` → `{ allowed: true }` (bypass)
   - Other roles → `{ allowed: false, reason: 'sso_enforced' }`

### Security Features
- **Break-glass bypass**: `org_super_admin` role can always use password auth
- **Enforcement scope**: Only applies to non-super-admin users
- **Audit trail**: All decisions logged with requestId
- **Error handling**: Graceful handling of missing users/orgs (PGRST116 = no rows)

### Key Implementation Details
- **Zod validation**: `.check(z.email())` pattern for email validation
- **RPC call**: `(supabase.rpc as any)('check_domain_sso', { p_domain: domain })`
- **Error code handling**: Check `roleError.code !== 'PGRST116'` to distinguish "no rows" from real errors
- **Logging**: All enforcement decisions logged with context for audit

### Router Registration Pattern
- Import: `import { app as sso_check_enforcement } from '../_backend/private/sso/check-enforcement.ts'`
- Route: `appGlobal.route('/sso/check-enforcement', sso_check_enforcement)`
- Alphabetically sorted imports maintained (sso_check_enforcement after sso_check_domain)

### Testing Scenarios
- ✓ SSO auth_type always returns `{ allowed: true }`
- ✓ Non-SSO domain returns `{ allowed: true }`
- ✓ Enforced SSO with super_admin user returns `{ allowed: true }`
- ✓ Enforced SSO with regular user returns `{ allowed: false, reason: 'sso_enforced' }`
- ✓ Invalid email format returns 400 error
- ✓ Missing JWT returns 401 error

### Code Quality
- ✓ No linting errors (bun lint:backend passed)
- ✓ Follows @antfu/eslint-config (no semicolons, single quotes)
- ✓ Proper error handling with quickError/simpleError
- ✓ Structured logging with cloudlog()
- ✓ Type-safe with TypeScript

### Integration Notes
- Used by authentication flows to enforce SSO policies
- Called before password authentication is allowed
- Respects org_super_admin break-glass bypass
- Logs all enforcement decisions for audit trail


## [2026-02-23] Task 6: SSO Pre-Linking Endpoint

### Implementation: `prelink.ts`
- **Location**: `supabase/functions/_backend/private/sso/prelink.ts`
- **Route**: `POST /private/sso/prelink-users`
- **Authentication**: `middlewareAuth` (JWT required)
- **Permission**: `org.manage_sso` via `checkPermission()`

### GoTrueAdminApi Limitation — Identity Deletion
- **CRITICAL**: `GoTrueAdminApi` does NOT have a `deleteUserIdentity()` method
- Must use direct GoTrue REST API: `DELETE /auth/v1/admin/users/{userId}/identities/{identityId}`
- Auth headers: `Authorization: Bearer {serviceRoleKey}` + `apikey: {serviceRoleKey}`
- Helper function pattern: `adminDeleteIdentity(c, userId, identityId): Promise<{ error: string | null }>`
- Uses `getEnv(c, 'SUPABASE_URL')` and `getEnv(c, 'SUPABASE_SERVICE_ROLE_KEY')`

### User Identity Model
- `auth.users` = the user record (has UUID)
- `auth.identities` = login methods linked to a user (email, google, saml, etc.)
- Password identity: `identity.provider === 'email'`
- Deleting an identity does NOT delete the user or change their UUID
- User identities accessible via `admin.auth.admin.getUserById(userId)` → `user.identities[]`
- Each identity has `.id`, `.provider`, `.identity_data`

### Pagination Pattern for User Listing
- `admin.auth.admin.listUsers({ page, perPage })` — paginated, 1-indexed
- Check `users.length < perPage` to detect last page
- Default `perPage: 1000` for batch processing

### Error Handling Strategy
- Per-user error handling: failures for one user don't block others
- Errors collected in string array, returned in response
- `quickError()` for fatal errors (provider not found, listing failed)
- `try/catch` per user for graceful degradation
- All actions logged with requestId for audit trail


## [2026-02-24] Task: Two-Step Login Flow with SSO Routing

### Implementation: `login.vue` Redesign
- **Flow**: email → domain check → (SSO button | password field) → MFA (if applicable)
- **State machine**: `statusAuth: 'email' | 'credentials' | '2fa'` (was `'login' | '2fa'`)
- **New state**: `emailForLogin`, `hasSso`, `isDomainChecking`

### Key Design Decisions
- **Separate form handlers**: `handleEmailContinue`, `handlePasswordSubmit`, `handleSsoLogin`, `handleMfaSubmit` (replaced single `submit` function)
- **Domain check graceful degradation**: If no session token available or API fails, defaults to `{ has_sso: false }` (password flow)
- **SSO redirect**: `supabase.auth.signInWithSSO({ domain, options: { redirectTo: origin + '/sso-callback' } })` → browser redirect to `data.url`
- **Footer placement**: Moved outside Transition, shown for email + credentials steps (not 2FA), avoids jump during animation
- **Transition**: Vue `<Transition name="step-slide" mode="out-in">` with 0.25s translateX animation

### Domain Check API Pattern
- Endpoint: `${defaultApiHost}/private/sso/check-domain` (POST)
- Uses existing session token if available (login page may have stale session)
- Falls back to `{ has_sso: false }` on any error (401, network, etc.)
- Import `defaultApiHost` from `~/services/supabase`

### FormKit Form Splitting
- Step 1: `id="email-step"` → name="email" → `handleEmailContinue({ email })`
- Step 2 (password): `id="login-account"` → name="password" → `handlePasswordSubmit({ password })`
- Step 2 (SSO): No form, just button with `@click="handleSsoLogin"`
- Step 3 (MFA): `id="2fa-account"` → name="code" → `handleMfaSubmit({ code })`
- `setErrors('login-account', ...)` still works because password form keeps same ID

### Preserved Features
- ✓ Turnstile captcha (in password step)
- ✓ Magic link flow (checkMagicLink on mount, unchanged)
- ✓ Forgot password link (in password step)
- ✓ Register link (in email step + password step)
- ✓ 2FA/MFA (unchanged, separate step)
- ✓ Review account ban check (unchanged)
- ✓ Session auto-detection on mount (checkLogin, unchanged)
- ✓ All data-test attributes preserved
- ✓ LangSelector, support, scan buttons (footer)

### New i18n Keys Used
- `continue` - Continue button text (step 1)
- `sso-detected` - SSO detection message
- `continue-with-sso` - SSO login button text
- `go-back` - Already existed (used in MFA step)


## useSSORouting Composable (Task 4)

- Composable pattern: `useSupabase()` from `~/services/supabase` is the standard way to get the Supabase client
- `defaultApiHost` from same module provides the API base URL for fetch calls
- Existing composables don't use lifecycle hooks unless needed (useRealtimeCLIFeed uses onUnmounted, useDeviceUpdateFormat does not)
- Auth token for private endpoints: get via `supabase.auth.getSession()` → `session.access_token`, pass as Bearer header
- The `/private/sso/check-domain` endpoint accepts `{ email }` and returns `{ has_sso, provider_id?, org_id? }`
- `supabase.auth.signInWithSSO({ domain, options: { redirectTo } })` returns `{ data: { url }, error }` — redirect user to data.url
- SSO callback path is `/sso-callback`
- login.vue already has inline `checkDomain` and `handleSsoLogin` that can be replaced with composable usage


## [2026-02-24] Task: SSO Callback Page

### Implementation: `sso-callback.vue`
- **Location**: `src/pages/sso-callback.vue`
- **Route**: `/sso-callback` (file-based routing, auto-generated)
- **Layout**: `naked` (no sidebar/nav, same as login.vue)

### Key Design Decisions
- **Separate from confirm-signup.vue**: confirm-signup has URL redirect guardrails for email links; SSO callback uses `exchangeCodeForSession` for PKCE flow
- **Manual code exchange**: `detectSessionInUrl: false` in supabase.ts means we MUST call `supabase.auth.exchangeCodeForSession(code)` manually
- **Code source**: `route.query.code` (URL query param from IdP redirect)
- **Redirect target**: `route.query.to` if present, otherwise `/dashboard` (same pattern as login.vue `nextLogin`)
- **Error handling**: Shows error message + "Back to Login" link on failure; uses `toast.error()` for notification
- **Loading state**: Shows spinner (IconLoader from lucide) during code exchange

### Component Patterns Used
- `useSupabase()` from `~/services/supabase` (singleton pattern)
- `useRoute()` / `useRouter()` from `vue-router`
- `toast` from `vue-sonner` (error notifications)
- `IconLoader` from `~icons/lucide/loader-2` (animated spinner, same as confirm-signup.vue)
- Dark mode support via `dark:` Tailwind variants
- DaisyUI-compatible button styling (`bg-muted-blue-700`)

### No Dependencies Added
- All imports from existing project dependencies
- No new i18n keys (hardcoded English strings, consistent with confirm-signup.vue)


## [2026-02-24] Task: useSSOProvisioning Composable

### Implementation: `src/composables/useSSOProvisioning.ts`
- **Export**: `useSSOProvisioning()` returning `{ isProvisioning, error, provisionUser }`
- **Session type**: `import type { Session } from '@supabase/supabase-js'`
- **Thin client layer**: Most provisioning is server-side via DB triggers

### Composable Pattern Conventions
- Named export: `export function useXxx()` (not default export)
- Refs returned in object: `ref()` for reactive state
- `useSupabase()` from `~/services/supabase` for DB access
- `defaultApiHost` from `~/services/supabase` for API calls
- No semicolons, single quotes (@antfu/eslint-config)

### provisionUser Logic Flow
1. Check `users` table for public user record (server trigger creates this)
2. Check `org_users` table for existing org membership
3. If no org: call `/private/sso/check-domain` with email to find SSO provider
4. Domain check is informational — actual org membership is handled server-side
5. All errors set `error` ref instead of throwing

### Key Design Decisions
- **maybeSingle() over single()**: Avoids PGRST116 errors when no rows found
- **Non-critical domain check**: Wrapped in try/catch, doesn't set error ref on failure
- **Bearer token from session**: Uses `session.access_token` for authenticated API calls
- **Graceful degradation**: If any check fails, provisioning continues (server handles it)


## Task 17: Env Var Configuration
- Supabase function env vars go in `supabase/functions/.env.example` (template) and `.env` (actual, gitignored)
- `config.toml` uses `env()` syntax only for Supabase-managed config (S3, Twilio, auth secrets), NOT for custom function env vars
- `supabase/.env` is a separate file for Supabase CLI config, not function-level vars
- README documents the pattern: duplicate `.env.example` to `.env`, replace placeholders, use `supabase secrets set --env-file`
- Functions access env vars via `Deno.env.get()` or `getEnv(c, 'VAR_NAME')` from hono context