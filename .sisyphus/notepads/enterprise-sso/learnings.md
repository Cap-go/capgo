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
