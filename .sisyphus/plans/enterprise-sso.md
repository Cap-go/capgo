# Enterprise SSO Integration (SAML 2.0)

## TL;DR

> **Quick Summary**: Add Enterprise SSO (SAML 2.0) to Capgo so enterprise customers can configure SSO for their org. Login page becomes two-step: email first → Continue → route to SSO or classic password. Auto-provisioning, domain verification via DNS TXT, and forced migration of existing users.
>
> **Deliverables**:
> - Database: `sso_providers` table + RBAC permission
> - Backend: SSO CRUD endpoints + DNS verification + domain check API
> - Frontend: Two-step login flow (`login.vue`) + SSO callback page + Security settings UI
> - Auth flow: `signInWithSSO` integration + auto-provisioning + pre-linking existing users
>
> **Estimated Effort**: Large (3-4 waves, ~15-20 tasks)
> **Parallel Execution**: YES - 3-4 waves with 5-7 tasks each
> **Critical Path**: DB Migration → Backend Endpoints → Login Redesign → SSO Callback → Admin UI

---

## Context

### Original Request
Enterprise customers (e.g. Okta, Azure AD) should be able to configure SSO for their org. Users in that org authenticate via their corporate SSO instead of email/password. Login page must be modified: email input first, then 'Continue' button. Domain-based routing: infer from email domain whether user should go SSO or classic login.

### Interview Summary
**Key Decisions**:
- **Protocol**: SAML 2.0 only via Supabase built-in SSO
- **Login flow**: Two-step — Step 1 (email + Continue) → Step 2 (password OR SSO redirect)
- **Self-service**: Org admin configures SSO in Security settings (Enterprise plan only)
- **Auto-provisioning**: Auto-create user + auto-join org (default role: read)
- **SSO enforcement**: Toggle to force all users of a domain to use SSO
- **Domain verification**: DNS TXT record required before activation
- **Account linking**: Pre-linking via Admin API — when SSO activated for domain, delete password identity and link SSO to same UUID
- **Management API**: New token `SUPABASE_MANAGEMENT_API_TOKEN` to create providers
- **Multi-domain**: NOT in this version — 1 org = 1 domain
- **Break-glass**: `org_super_admin` role can bypass SSO enforcement
- **2FA + SSO**: SSO users exempt from TOTP (IdP already handles MFA)
- **Subdomain**: Exact match only — no wildcard

### Research Findings
- **Login page**: `src/pages/login.vue` — currently email+password simultaneously, needs two-step
- **Supabase client**: `src/services/supabase.ts` — has `detectSessionInUrl: false`, needs `exchangeCodeForSession` handling
- **Auth guard**: `src/modules/auth.ts` — no SSO awareness yet
- **Security settings**: `src/pages/settings/organization/Security.vue` — 1,340+ lines, needs separate SSO component
- **Org model**: `public.orgs` table — no SSO fields yet
- **Plans**: Solo=1, Maker=2, Team=3, Enterprise=4 via `planToInt()`
- **User provisioning pattern**: `accept_invitation.ts` — auth.users → public.users → org_users + role_bindings
- **Backend pattern**: `supabase/functions/_backend/private/` — Hono + Zod + middlewareAuth
- **DNS verification**: No existing pattern — use DNS-over-HTTPS for Deno/CF Workers compatibility

### Metis Review
**Identified Gaps (addressed)**:
- Identity linking strategy: Pre-linking via Admin API when SSO activated
- SSO callback page: New `sso-callback.vue` needed with `exchangeCodeForSession`
- Management API: New secret + isolated utility module
- Security.vue bloat: Implement as separate `SsoConfiguration.vue` component
- DNS verification: DNS-over-HTTPS approach for cross-platform

---

## Work Objectives

### Core Objective
Implement Enterprise SSO (SAML 2.0) via Supabase native SSO, enabling domain-based routing on login, self-service configuration by org admins, and seamless migration of existing users.

### Concrete Deliverables
1. Database migration: `public.sso_providers` table + `org.manage_sso` RBAC permission
2. Backend endpoints: SSO CRUD + DNS verification + domain check API
3. Frontend: Two-step login flow + SSO callback page + Security settings UI
4. Auth flow: `signInWithSSO` integration + auto-provisioning + pre-linking

### Definition of Done
- [ ] User with SSO domain sees SSO button on Step 2 of login
- [ ] User with non-SSO domain sees password field on Step 2
- [ ] SSO login creates session and redirects to dashboard
- [ ] First SSO login auto-creates user + joins org with read role
- [ ] Existing users pre-linked to SSO identity (no orphan accounts)
- [ ] Org admin can configure SSO in Security settings (Enterprise only)
- [ ] Domain verified via DNS TXT before activation
- [ ] SSO enforcement toggle blocks password login for domain
- [ ] `org_super_admin` can bypass enforcement (break-glass)

### Must Have
- SAML 2.0 SSO via Supabase native SSO
- Domain-based login routing
- Two-step login page (email → Continue → SSO/password)
- SSO callback page with `exchangeCodeForSession`
- `sso_providers` database table
- Self-service SSO configuration (Enterprise plan only)
- DNS TXT domain verification
- Auto-provisioning (user creation + org join)
- Pre-linking of existing users (no duplicates)
- SSO enforcement toggle
- `org_super_admin` break-glass bypass

### Must NOT Have (Guardrails)
- OIDC support (SAML only)
- Multi-domain per org (single domain only)
- SCIM provisioning
- SSO in Capacitor mobile app
- API key SSO (human login only)
- IdP-initiated flow (SP-initiated only)
- Wildcard subdomain matching
- Inline SSO config in 1,340-line Security.vue

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES — Vitest for backend, Playwright for frontend
- **Automated tests**: Tests after implementation
- **Framework**: bun test (Vitest) for backend, Playwright MCP for frontend

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright (playwright skill) — Navigate, interact, assert DOM, screenshot
- **API/Backend**: Use Bash (curl) — Send requests, assert status + response fields
- **Database**: Use Bash (psql via Supabase CLI) — Query tables, verify data

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - Database + Backend Scaffolding):
├── Task 1: Database migration (sso_providers table + RBAC)
├── Task 2: Management API utility module
├── Task 3: Domain check endpoint
└── Task 4: DNS verification utility

Wave 2 (Backend Core - SSO Endpoints):
├── Task 5: SSO provider CRUD endpoints
├── Task 6: Pre-linking existing users endpoint
├── Task 7: SSO enforcement check endpoint
└── Task 8: Org plan validation helper

Wave 3 (Frontend Auth - Login Flow):
├── Task 9: Redesign login.vue to two-step flow
├── Task 10: SSO callback page (exchangeCodeForSession)
├── Task 11: Domain-based routing logic
└── Task 12: Auto-provisioning on first SSO login

Wave 4 (Admin UI + Integration):
├── Task 13: SsoConfiguration.vue component
├── Task 14: Integrate SSO config into Security.vue
├── Task 15: SSO enforcement toggle + break-glass
├── Task 16: Auth guard SSO enforcement check
└── Task 17: Environment config (SUPABASE_MANAGEMENT_API_TOKEN)

Wave 5 (Tests + QA):
├── Task 18: Backend tests for SSO endpoints
├── Task 19: Playwright E2E for SSO flow
├── Task 20: Playwright E2E for admin configuration
└── Task 21: Integration test (full SSO login → dashboard)

Wave FINAL (Review):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: Task 1 → Task 5 → Task 9 → Task 10 → Task 13 → Task 18 → F1-F4
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 4 (Wave 1 & 2)
```

### Dependency Matrix

- **1**: — — 5, 2, 3, 4
- **2**: — — 5
- **3**: 1 — 9
- **4**: — — 5
- **5**: 1, 2, 4 — 6, 7, 13
- **6**: 5 — 12
- **7**: 5 — 16
- **8**: — — 5, 13
- **9**: 3 — 10, 11, 12
- **10**: 9 — 21
- **11**: 9 — 12
- **12**: 6, 9, 11 — 21
- **13**: 5, 8 — 14
- **14**: 13 — 15
- **15**: 14 — 16
- **16**: 7, 15 — 21
- **17**: — — 5, 13
- **18**: 5 — 21
- **19**: 10, 12 — 21
- **20**: 14 — 21
- **21**: 10, 12, 16, 18, 19, 20 — F1-F4

### Agent Dispatch Summary

- **Wave 1**: 4 tasks — T1→`unspecified-high`, T2→`quick`, T3→`quick`, T4→`quick`
- **Wave 2**: 4 tasks — T5→`deep`, T6→`unspecified-high`, T7→`quick`, T8→`quick`
- **Wave 3**: 4 tasks — T9→`visual-engineering`, T10→`visual-engineering`, T11→`quick`, T12→`unspecified-high`
- **Wave 4**: 5 tasks — T13→`visual-engineering`, T14→`visual-engineering`, T15→`unspecified-high`, T16→`quick`, T17→`quick`
- **Wave 5**: 4 tasks — T18→`unspecified-high`, T19→`unspecified-high`, T20→`unspecified-high`, T21→`deep`
- **FINAL**: 4 tasks — F1→`oracle`, F2→`unspecified-high`, F3→`unspecified-high`, F4→`deep`

---

## TODOs

- [ ] 1. Database Migration: sso_providers table + RBAC permission

  **What to do**:
  - Create migration file: `supabase/migrations/YYYYMMDDHHMMSS_add_sso_providers.sql`
  - Create `public.sso_providers` table:
    ```sql
    CREATE TABLE public.sso_providers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
      domain text NOT NULL UNIQUE,
      provider_id text, -- Supabase provider ID
      status text NOT NULL DEFAULT 'pending_verification' CHECK (status IN ('pending_verification', 'verified', 'active', 'disabled')),
      enforce_sso boolean NOT NULL DEFAULT false,
      dns_verification_token text NOT NULL,
      dns_verified_at timestamptz,
      metadata_url text,
      attribute_mapping jsonb DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    ```
  - Add RBAC permission: `org.manage_sso`
  - Add RLS policy using `get_identity_org_allowed` pattern
  - Create trigger function for `updated_at`
  - Add index on `domain` for lookup performance

  **Must NOT do**:
  - Do NOT add fields to `public.orgs` table directly
  - Do NOT forget `search_path = ''` in trigger functions
  - Do NOT allow duplicate domains across orgs

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Database schema work requiring SQL expertise
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Blocks**: Task 5, 2, 3
  - **Blocked By**: None

  **References**:
  - `supabase/schemas/prod.sql` — Schema patterns to follow
  - `supabase/migrations/` — Migration naming convention
  - `supabase/functions/_backend/utils/postgress_schema.ts` — Drizzle patterns if needed
  - `accept_invitation.ts:173-280` — User/org relationship patterns

  **Acceptance Criteria**:
  - [ ] Migration applies cleanly: `bunx supabase db reset`
  - [ ] Table exists with correct columns:
    ```bash
    curl -s "$SUPABASE_URL/rest/v1/sso_providers?select=*&limit=1" \
      -H "apikey: $SUPABASE_ANON_KEY" | jq '.code'
    # Assert: NOT '42P01' (undefined_table)
    ```
  - [ ] RBAC permission exists: `org.manage_sso`
  - [ ] RLS policy prevents unauthorized access

  **QA Scenarios**:

  ```
  Scenario: Migration applies successfully
    Tool: Bash (supabase CLI)
    Steps:
      1. Run: bunx supabase db reset
      2. Query: SELECT column_name FROM information_schema.columns WHERE table_name='sso_providers'
    Expected Result: Columns include id, org_id, domain, status, enforce_sso, dns_verification_token
    Evidence: .sisyphus/evidence/task-1-migration-applies.txt

  Scenario: RLS policy blocks unauthorized access
    Tool: Bash (curl)
    Steps:
      1. Attempt: curl -s "$SUPABASE_URL/rest/v1/sso_providers" -H "apikey: $SUPABASE_ANON_KEY"
    Expected Result: HTTP 400 or empty array (RLS blocks)
    Evidence: .sisyphus/evidence/task-1-rls-blocks.txt
  ```

  **Commit**: YES
  - Message: `feat(db): add sso_providers table with RBAC permission`
  - Files: `supabase/migrations/YYYYMMDDHHMMSS_add_sso_providers.sql`


- [ ] 2. Management API Utility Module

  **What to do**:
  - Create `supabase/functions/_backend/utils/supabase-management.ts`
  - Implement functions:
    - `createSSOProvider(orgId, domain, metadataUrl, attributeMapping)` — POST to Management API
    - `getSSOProvider(providerId)` — GET provider details
    - `updateSSOProvider(providerId, updates)` — PATCH provider
    - `deleteSSOProvider(providerId)` — DELETE provider
  - Handle Management API errors (rate limits, invalid metadata, etc.)
  - Use `SUPABASE_MANAGEMENT_API_TOKEN` from env

  **Must NOT do**:
  - Do NOT call Management API from frontend
  - Do NOT expose Management API token in logs/errors
  - Do NOT use Supabase client for Management API (different endpoint)

  **Recommended Agent Profile**:
  - **Category**: `quick` — Utility module, clear API contract
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Blocks**: Task 5
  - **Blocked By**: None

  **References**:
  - Supabase Management API docs: https://supabase.com/docs/reference/api
  - Endpoint: `POST /v1/projects/{ref}/config/auth/sso/providers`
  - `supabase/functions/_backend/utils/hono.ts` — Error handling patterns

  **Acceptance Criteria**:
  - [ ] Module created with all 4 CRUD functions
  - [ ] Error handling for Management API failures

  **QA Scenarios**:

  ```
  Scenario: Module exports all functions
    Tool: Bash (bun)
    Steps:
      1. bun run -e "import * as mgmt from './supabase/functions/_backend/utils/supabase-management.ts'; console.log(Object.keys(mgmt))"
    Expected Result: Output includes createSSOProvider, getSSOProvider, updateSSOProvider, deleteSSOProvider
    Evidence: .sisyphus/evidence/task-2-module-exports.txt
  ```

  **Commit**: YES (group with Task 1)
  - Message: `feat(backend): add Supabase Management API utility module`
  - Files: `supabase/functions/_backend/utils/supabase-management.ts`


- [ ] 3. Domain Check Endpoint

  **What to do**:
  - Create endpoint: `POST /private/sso/check-domain`
  - Input: `{ email: string }`
  - Logic:
    1. Extract domain from email
    2. Query `sso_providers` where `domain = extracted_domain` AND `status = 'active'`
    3. Return `{ has_sso: boolean, provider_id?: string, org_id?: string }`
  - Use `middlewareAuth` for authentication

  **Must NOT do**:
  - Do NOT return sensitive provider details (metadata_url, etc.)
  - Do NOT check user permissions (public endpoint for login flow)

  **Recommended Agent Profile**:
  - **Category**: `quick` — Simple lookup endpoint
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Blocks**: Task 9
  - **Blocked By**: Task 1

  **References**:
  - `supabase/functions/_backend/private/` — Hono endpoint patterns
  - `accept_invitation.ts:68-70` — New Hono endpoint structure

  **Acceptance Criteria**:
  - [ ] Endpoint returns correct SSO status for any email domain

  **QA Scenarios**:

  ```
  Scenario: Active SSO domain returns has_sso=true
    Tool: Bash (curl)
    Preconditions: Seed data with active SSO provider for test.com
    Steps:
      1. curl -X POST "$API_URL/private/sso/check-domain" \
         -H "Content-Type: application/json" \
         -d '{"email":"user@test.com"}'
    Expected Result: JSON with has_sso: true, provider_id present
    Evidence: .sisyphus/evidence/task-3-sso-domain.txt

  Scenario: Non-SSO domain returns has_sso=false
    Tool: Bash (curl)
    Steps:
      1. curl -X POST "$API_URL/private/sso/check-domain" \
         -d '{"email":"user@nodomain.com"}'
    Expected Result: JSON with has_sso: false
    Evidence: .sisyphus/evidence/task-3-no-sso.txt
  ```

  **Commit**: YES (group with Task 1)
  - Message: `feat(api): add domain check endpoint for SSO routing`
  - Files: `supabase/functions/_backend/private/sso/check-domain.ts` (or inline in index.ts)


- [ ] 4. DNS Verification Utility

  **What to do**:
  - Create `supabase/functions/_backend/utils/dns-verification.ts`
  - Implement `verifyDnsTxtRecord(domain, expectedToken)`:
    1. Query Cloudflare DNS-over-HTTPS: `https://cloudflare-dns.com/dns-query?name=_capgo-sso.{domain}&type=TXT`
    2. Parse JSON response for TXT records
    3. Check if any record contains expectedToken
    4. Return `{ verified: boolean, records?: string[] }`
  - Handle errors (DNS lookup failure, invalid domain, etc.)

  **Must NOT do**:
  - Do NOT use Deno-native DNS (not available in CF Workers)
  - Do NOT use Node DNS module (not available in Deno)
  - Do NOT make synchronous DNS calls (use async/await)

  **Recommended Agent Profile**:
  - **Category**: `quick` — Utility function with external API call
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Blocks**: Task 5 (verification step)
  - **Blocked By**: None

  **References**:
  - Cloudflare DNS-over-HTTPS docs: https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/
  - Example query: `https://cloudflare-dns.com/dns-query?name=example.com&type=TXT`

  **Acceptance Criteria**:
  - [ ] Utility correctly verifies DNS TXT records via DoH

  **QA Scenarios**:

  ```
  Scenario: Correct DNS TXT record detected
    Tool: Bash (curl + bun test)
    Steps:
      1. Set up test domain with TXT record: _capgo-sso.test.example.com = "test-token-123"
      2. Run verifyDnsTxtRecord('test.example.com', 'test-token-123')
    Expected Result: verified: true
    Evidence: .sisyphus/evidence/task-4-dns-verified.txt

  Scenario: Missing DNS TXT record returns false
    Tool: Bash (curl + bun test)
    Steps:
      1. Run verifyDnsTxtRecord('nodns.example.com', 'any-token')
    Expected Result: verified: false
    Evidence: .sisyphus/evidence/task-4-dns-fail.txt
  ```

  **Commit**: YES (group with Task 1)
  - Message: `feat(utils): add DNS TXT verification via DoH`
  - Files: `supabase/functions/_backend/utils/dns-verification.ts`




- [ ] 5. SSO Provider CRUD Endpoints

  **What to do**:
  - Create endpoints under `supabase/functions/_backend/private/sso/`:
    - `POST /private/sso/providers` — Create new SSO provider
      1. Validate org has Enterprise plan (use `get_current_plan_name_org`)
      2. Validate user has `org.manage_sso` permission
      3. Generate `dns_verification_token` (random string)
      4. Insert into `sso_providers` with status='pending_verification'
      5. Return provider record (without sensitive data)
    - `GET /private/sso/providers/:orgId` — List org's SSO providers
    - `PATCH /private/sso/providers/:id` — Update provider settings
      - Allow updating: `metadata_url`, `attribute_mapping`, `enforce_sso`
      - Do NOT allow changing domain (would break existing users)
    - `DELETE /private/sso/providers/:id` — Delete provider
      - Call Management API to delete from Supabase first
      - Then delete from `sso_providers` table
  - Use Zod for input validation
  - Use `middlewareAuth` + permission checks

  **Must NOT do**:
  - Do NOT allow non-Enterprise orgs to create providers
  - Do NOT return `dns_verification_token` in LIST endpoint (security)
  - Do NOT delete provider from Management API if DB deletion fails (transaction)

  **Recommended Agent Profile**:
  - **Category**: `deep` — Complex CRUD with external API integration
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Blocks**: Task 6, 7, 13
  - **Blocked By**: Task 1, 2, 4

  **References**:
  - `accept_invitation.ts:68-70` — Hono endpoint structure
  - `supabase/functions/_backend/utils/hono.ts` — Error handling
  - `Security.vue:86-91` — Permission check pattern (`computedAsync`)

  **Acceptance Criteria**:
  - [ ] All 4 CRUD endpoints working
  - [ ] Enterprise plan validation enforced
  - [ ] Permission checks enforced

  **QA Scenarios**:

  ```
  Scenario: Enterprise org can create SSO provider
    Tool: Bash (curl)
    Preconditions: Enterprise org with manage_sso permission
    Steps:
      1. curl -X POST "$API_URL/private/sso/providers" \
         -H "Authorization: Bearer $JWT" \
         -d '{"org_id":"ent-org-id","domain":"test.com","metadata_url":"https://idp.test.com/metadata"}'
    Expected Result: HTTP 201, provider record with status='pending_verification'
    Evidence: .sisyphus/evidence/task-5-create-provider.txt

  Scenario: Non-Enterprise org cannot create provider
    Tool: Bash (curl)
    Steps:
      1. curl -X POST "$API_URL/private/sso/providers" \
         -H "Authorization: Bearer $JWT" \
         -d '{"org_id":"team-org-id","domain":"test.com"}'
    Expected Result: HTTP 403 with error 'SSO requires Enterprise plan'
    Evidence: .sisyphus/evidence/task-5-plan-gate.txt
  ```

  **Commit**: YES
  - Message: `feat(api): add SSO provider CRUD endpoints`
  - Files: `supabase/functions/_backend/private/sso/index.ts` or separate files


- [ ] 6. Pre-linking Existing Users Endpoint

  **What to do**:
  - Create endpoint: `POST /private/sso/prelink-users` (admin only)
  - Input: `{ provider_id: string }`
  - Logic:
    1. Get provider details (domain, org_id)
    2. Find all `auth.users` with email matching `%@domain.com`
    3. For each user:
       - Get their identities from Supabase Auth
       - If they have password identity: delete it via Admin API
       - Link SSO identity to same UUID (user keeps same `auth.users.id`)
    4. Log actions for audit
  - This is called when SSO provider transitions from 'verified' to 'active'

  **Must NOT do**:
  - Do NOT delete users (only delete password identity)
  - Do NOT change `auth.users.id` (must preserve UUID for data integrity)
  - Do NOT run without explicit admin confirmation (destructive operation)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Complex identity manipulation via Admin API
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Blocks**: Task 12 (auto-provisioning needs pre-linked users)
  - **Blocked By**: Task 5

  **References**:
  - Supabase Admin API: `supabase.auth.admin.deleteUserIdentity()`
  - Supabase Admin API: `supabase.auth.admin.linkIdentity()`
  - `accept_invitation.ts:173-280` — User/org creation patterns

  **Acceptance Criteria**:
  - [ ] Endpoint successfully pre-links existing users
  - [ ] Users retain same UUID after linking

  **QA Scenarios**:

  ```
  Scenario: Pre-linking preserves user UUID
    Tool: Bash (curl + psql)
    Preconditions: User with password exists: user@example.com (UUID=aaa)
    Steps:
      1. Create SSO provider for example.com
      2. Call POST /private/sso/prelink-users with provider_id
      3. Query auth.users for user@example.com
    Expected Result: Same UUID (aaa), password identity removed, SSO identity linked
    Evidence: .sisyphus/evidence/task-6-prelink-uuid.txt
  ```

  **Commit**: YES
  - Message: `feat(api): add pre-linking endpoint for SSO migration`
  - Files: `supabase/functions/_backend/private/sso/prelink.ts`


- [ ] 7. SSO Enforcement Check Endpoint

  **What to do**:
  - Create endpoint: `POST /private/sso/check-enforcement`
  - Input: `{ email: string, auth_type: 'password' | 'sso' }`
  - Logic:
    1. Extract domain from email
    2. Query `sso_providers` where `domain = extracted_domain` AND `enforce_sso = true`
    3. If `auth_type = 'password'` and enforcement is on:
       - Check if user has `org_super_admin` role (break-glass)
       - If not super_admin: return `{ allowed: false, reason: 'sso_enforced' }`
    4. Return `{ allowed: boolean, reason?: string }`

  **Must NOT do**:
  - Do NOT block SSO authentication (always allow)
  - Do NOT check enforcement for non-existent domains (no provider = no enforcement)

  **Recommended Agent Profile**:
  - **Category**: `quick` — Simple permission check endpoint
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Blocks**: Task 16 (auth guard needs this)
  - **Blocked By**: Task 5

  **References**:
  - `src/modules/auth.ts` — Where this will be called from
  - `supabase/functions/_backend/utils/hono.ts` — Error response patterns

  **Acceptance Criteria**:
  - [ ] Endpoint correctly enforces SSO for domains with `enforce_sso=true`
  - [ ] `org_super_admin` can bypass enforcement

  **QA Scenarios**:

  ```
  Scenario: Password login blocked when SSO enforced
    Tool: Bash (curl)
    Preconditions: SSO provider with enforce_sso=true for example.com
    Steps:
      1. curl -X POST "$API_URL/private/sso/check-enforcement" \
         -d '{"email":"user@example.com","auth_type":"password"}'
    Expected Result: allowed: false, reason: 'sso_enforced'
    Evidence: .sisyphus/evidence/task-7-enforced-block.txt

  Scenario: Super admin can bypass enforcement
    Tool: Bash (curl)
    Preconditions: User with org_super_admin role for SSO-enforced domain
    Steps:
      1. Authenticate as super_admin
      2. Call check-enforcement endpoint
    Expected Result: allowed: true (bypass granted)
    Evidence: .sisyphus/evidence/task-7-superadmin-bypass.txt
  ```

  **Commit**: YES
  - Message: `feat(api): add SSO enforcement check endpoint`
  - Files: `supabase/functions/_backend/private/sso/check-enforcement.ts`


- [ ] 8. Org Plan Validation Helper

  **What to do**:
  - Create `supabase/functions/_backend/utils/plan-gating.ts`
  - Implement `requireEnterprisePlan(orgId, c)`:
    1. Call `get_current_plan_name_org(orgId)`
    2. Check if plan is 'Enterprise' (or higher if future plans added)
    3. If not Enterprise: throw `quickError(403, 'SSO requires Enterprise plan')`
  - Implement `hasFeature(orgId, feature)` for future extensibility

  **Must NOT do**:
  - Do NOT hardcode plan names (use constants)
  - Do NOT cache plan data (plans can change)

  **Recommended Agent Profile**:
  - **Category**: `quick` — Simple utility function
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Blocks**: Task 5, 13
  - **Blocked By**: None

  **References**:
  - `utils/plans.ts:163-176` — `planToInt()` function
  - `get_current_plan_name_org()` RPC function

  **Acceptance Criteria**:
  - [ ] Helper correctly validates Enterprise plan

  **QA Scenarios**:

  ```
  Scenario: Enterprise plan passes validation
    Tool: Bash (bun test)
    Steps:
      1. Call requireEnterprisePlan('ent-org-id', mockContext)
    Expected Result: No error thrown
    Evidence: .sisyphus/evidence/task-8-enterprise-pass.txt

  Scenario: Team plan fails validation
    Tool: Bash (bun test)
    Steps:
      1. Call requireEnterprisePlan('team-org-id', mockContext)
    Expected Result: Error thrown with 403 status
    Evidence: .sisyphus/evidence/task-8-team-fail.txt
  ```

  **Commit**: YES
  - Message: `feat(utils): add Enterprise plan validation helper`
  - Files: `supabase/functions/_backend/utils/plan-gating.ts`



- [ ] 9. Redesign login.vue to Two-Step Flow

  **What to do**:
  - Modify `src/pages/login.vue`:
    1. Step 1: Email input + Continue button only
       - Validate email format
       - On Continue: call `/private/sso/check-domain`
       - Store email in component state
    2. Step 2: Conditional UI based on domain check result
       - If `has_sso=true`: Show 'Continue with SSO' button (calls `signInWithSSO({ domain })`)
       - If `has_sso=false`: Show password field + Submit button
    3. Add transition animation between steps (follow MFA pattern)
    4. Keep existing: Turnstile captcha, 'Forgot password?' link, magic link option
  - Use existing `useSupabase()` composable
  - Handle loading states and errors

  **Must NOT do**:
  - Do NOT remove existing login functionality (keep backward compatible)
  - Do NOT show both password and SSO simultaneously (confusing UX)
  - Do NOT break magic link flow

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — UI/UX redesign with Vue 3
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3)
  - **Blocks**: Task 10, 11, 12
  - **Blocked By**: Task 3 (domain check endpoint)

  **References**:
  - `src/pages/login.vue` — Current implementation
  - `src/pages/login.vue` MFA section — Two-step pattern to follow
  - `src/services/supabase.ts` — `signInWithSSO()` usage

  **Acceptance Criteria**:
  - [ ] Two-step flow working: email → Continue → SSO or password

  **QA Scenarios**:

  ```
  Scenario: SSO domain shows SSO button
    Tool: Playwright
    Preconditions: SSO provider active for test.com
    Steps:
      1. Navigate to /login
      2. Enter email: user@test.com
      3. Click Continue button
    Expected Result: SSO button visible ('Continue with SSO'), password field hidden
    Evidence: .sisyphus/evidence/task-9-sso-domain.png (screenshot)

  Scenario: Non-SSO domain shows password field
    Tool: Playwright
    Steps:
      1. Navigate to /login
      2. Enter email: user@nodomain.com
      3. Click Continue button
    Expected Result: Password field visible, no SSO button
    Evidence: .sisyphus/evidence/task-9-password-domain.png
  ```

  **Commit**: YES
  - Message: `feat(ui): redesign login to two-step flow with SSO routing`
  - Files: `src/pages/login.vue`


- [ ] 10. SSO Callback Page (exchangeCodeForSession)

  **What to do**:
  - Create `src/pages/sso-callback.vue`:
    1. On mount: parse URL for `?code=<auth_code>`
    2. Call `supabase.auth.exchangeCodeForSession(code)`
    3. Handle response:
       - Success: Check if user needs auto-provisioning (first SSO login)
       - If first login: redirect to auto-provisioning flow
       - If existing user: redirect to dashboard
       - Error: Show error message with 'Try Again' button
    4. Add loading state during code exchange
  - Add route: `/sso-callback` in router config
  - This is separate from `confirm-signup.vue` (which has specific redirect guardrails)

  **Must NOT do**:
  - Do NOT reuse `confirm-signup.vue` (different flow, specific guardrails in AGENTS.md)
  - Do NOT use `detectSessionInUrl: true` (would break existing login flow)
  - Do NOT forget to handle error states

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — New page with auth flow
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3)
  - **Blocks**: Task 21
  - **Blocked By**: Task 9 (login flow must exist)

  **References**:
  - `src/services/supabase.ts:154` — Current `autoAuth()` pattern (only handles refresh_token)
  - Supabase docs: `exchangeCodeForSession()` for PKCE/code flow
  - `src/pages/confirm-signup.vue` — Auth callback pattern (but DON'T reuse)

  **Acceptance Criteria**:
  - [ ] SSO callback exchanges code for session

  **QA Scenarios**:

  ```
  Scenario: Valid code creates session
    Tool: Playwright
    Preconditions: User initiated SSO login, IdP returned to /sso-callback?code=valid
    Steps:
      1. Navigate to /sso-callback?code=VALID_CODE
    Expected Result: Session created, redirected to /dashboard
    Evidence: .sisyphus/evidence/task-10-valid-code.png

  Scenario: Invalid code shows error
    Tool: Playwright
    Steps:
      1. Navigate to /sso-callback?code=INVALID
    Expected Result: Error message displayed, 'Try Again' button visible
    Evidence: .sisyphus/evidence/task-10-invalid-code.png
  ```

  **Commit**: YES
  - Message: `feat(ui): add SSO callback page with code exchange`
  - Files: `src/pages/sso-callback.vue`, router config


- [ ] 11. Domain-Based Routing Logic

  **What to do**:
  - Create `src/composables/useSSORouting.ts`:
    - `checkDomain(email): Promise<{ has_sso: boolean, provider_id?: string }>`
      - Call `/private/sso/check-domain` endpoint
      - Cache result for session (avoid repeated API calls)
    - `isSSOEnabledForDomain(domain): boolean` (cached)
  - Integrate into login flow:
    - After Step 1 (email), call `checkDomain`
    - Store result in component state for Step 2 rendering
  - Add loading state during domain check

  **Must NOT do**:
  - Do NOT call domain check on every keystroke (debounce)
  - Do NOT cache across sessions (domain status can change)

  **Recommended Agent Profile**:
  - **Category**: `quick` — Simple composable with API call
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3)
  - **Blocks**: Task 12
  - **Blocked By**: Task 9

  **References**:
  - `src/composables/` — Existing composables pattern
  - `src/services/supabase.ts` — API call patterns

  **Acceptance Criteria**:
  - [ ] Composable correctly checks domain and caches result

  **QA Scenarios**:

  ```
  Scenario: Domain check returns correct result
    Tool: Playwright + browser console
    Steps:
      1. In browser console: const result = await checkDomain('user@test.com')
    Expected Result: { has_sso: true/false } based on domain
    Evidence: .sisyphus/evidence/task-11-domain-check.txt
  ```

  **Commit**: YES
  - Message: `feat(composables): add domain-based SSO routing logic`
  - Files: `src/composables/useSSORouting.ts`


- [ ] 12. Auto-Provisioning on First SSO Login

  **What to do**:
  - Create `src/composables/useSSOProvisioning.ts`:
    - `handleFirstSSOLogin(user, provider_id): Promise<void>`
      1. Check if user already in `public.users` (should be via pre-linking)
      2. If not in `public.users`: create row following `accept_invitation.ts` pattern
      3. Check if user in `org_users` for SSO org
      4. If not: add to org with 'read' role (follow `accept_invitation.ts:240-280`)
      5. Add to `role_bindings` if RBAC enabled
  - Call from `sso-callback.vue` after successful code exchange
  - Show loading state during provisioning
  - On completion: redirect to dashboard

  **Must NOT do**:
  - Do NOT create duplicate users (pre-linking should prevent this)
  - Do NOT assign admin role (default to 'read')
  - Do NOT skip org join (required for SSO to work)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Complex user/org provisioning logic
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3)
  - **Blocks**: Task 21
  - **Blocked By**: Task 6 (pre-linking), Task 9, Task 11

  **References**:
  - `accept_invitation.ts:173-280` — User creation + org join pattern
  - `src/services/supabase.ts` — Supabase client usage

  **Acceptance Criteria**:
  - [ ] First SSO login auto-creates user and joins org

  **QA Scenarios**:

  ```
  Scenario: First SSO login provisions user
    Tool: Playwright + psql
    Preconditions: Pre-linked user (auth.users exists), no public.users row
    Steps:
      1. Login via SSO for first time
      2. Query public.users for user's UUID
    Expected Result: Row exists with correct email
    Evidence: .sisyphus/evidence/task-12-user-created.txt

  Scenario: First SSO login joins org
    Tool: Playwright + psql
    Steps:
      1. After first SSO login
      2. Query org_users for user's UUID and SSO org
    Expected Result: Row exists with 'read' role
    Evidence: .sisyphus/evidence/task-12-org-joined.txt
  ```

  **Commit**: YES
  - Message: `feat(auth): add auto-provisioning for first SSO login`
  - Files: `src/composables/useSSOProvisioning.ts`



- [ ] 13. SsoConfiguration.vue Component

  **What to do**:
  - Create `src/components/organizations/SsoConfiguration.vue`:
    - **Enterprise Plan Gate**: If org not Enterprise, show upgrade CTA
    - **SSO Status Display**: Current provider status (pending/verified/active/disabled)
    - **Domain Input**: Field for domain (e.g., 'company.com')
    - **Metadata URL Input**: SAML metadata URL from IdP
    - **DNS Verification Section**:
      - Show generated DNS TXT record: `_capgo-sso.{domain}` = `{token}`
      - 'Verify DNS' button to trigger verification check
      - Display verification status
    - **Create Provider Button**: POST to `/private/sso/providers`
    - **Provider List**: If provider exists, show details + edit/delete buttons
    - Use `computedAsync` for permission check (`org.manage_sso`)
    - Use `useOrganization()` store for org data

  **Must NOT do**:
  - Do NOT inline in Security.vue (keep as separate component per Metis directive)
  - Do NOT allow configuration on non-Enterprise plans
  - Do NOT expose `dns_verification_token` in UI (show instructions only)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — Complex form component with multiple states
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 4)
  - **Blocks**: Task 14
  - **Blocked By**: Task 5 (CRUD endpoints), Task 8 (plan validation)

  **References**:
  - `Security.vue:342-408` — Toggle-with-confirmation pattern
  - `Security.vue:86-91` — `computedAsync` permission check
  - `src/components/` — Vue component patterns

  **Acceptance Criteria**:
  - [ ] Component allows SSO configuration (Enterprise orgs only)

  **QA Scenarios**:

  ```
  Scenario: Enterprise org sees SSO configuration
    Tool: Playwright
    Preconditions: Enterprise org, admin with manage_sso permission
    Steps:
      1. Navigate to /settings/organization/security
      2. Look for SSO Configuration section
    Expected Result: Domain input, metadata URL input, Create button visible
    Evidence: .sisyphus/evidence/task-13-enterprise-ui.png

  Scenario: Team org sees upgrade CTA
    Tool: Playwright
    Preconditions: Team org
    Steps:
      1. Navigate to /settings/organization/security
    Expected Result: 'Upgrade to Enterprise for SSO' message, no configuration UI
    Evidence: .sisyphus/evidence/task-13-team-upgrade.png
  ```

  **Commit**: YES
  - Message: `feat(ui): add SSO configuration component`
  - Files: `src/components/organizations/SsoConfiguration.vue`


- [ ] 14. Integrate SSO Config into Security.vue

  **What to do**:
  - Modify `src/pages/settings/organization/Security.vue`:
    1. Import `SsoConfiguration.vue` component
    2. Add new section: 'Single Sign-On (SSO)' (below API Key Policy)
    3. Render `<SsoConfiguration />` within the section
    4. Follow existing section styling (DaisyUI card pattern)
  - Keep existing sections intact (2FA, Password Policy, Encrypted Bundles, API Key Policy)

  **Must NOT do**:
  - Do NOT remove existing security sections
  - Do NOT change existing section order (add SSO at bottom)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — Simple component integration
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 4)
  - **Blocks**: Task 15
  - **Blocked By**: Task 13

  **References**:
  - `Security.vue` — Current structure
  - DaisyUI card patterns used in file

  **Acceptance Criteria**:
  - [ ] SSO Configuration section visible in Security settings

  **QA Scenarios**:

  ```
  Scenario: SSO section visible in Security page
    Tool: Playwright
    Steps:
      1. Navigate to /settings/organization/security
      2. Scroll to bottom
    Expected Result: 'Single Sign-On (SSO)' section visible
    Evidence: .sisyphus/evidence/task-14-security-section.png
  ```

  **Commit**: YES
  - Message: `feat(ui): integrate SSO config into Security settings`
  - Files: `src/pages/settings/organization/Security.vue`


- [ ] 15. SSO Enforcement Toggle + Break-Glass

  **What to do**:
  - Extend `SsoConfiguration.vue`:
    1. Add 'Enforce SSO' toggle (only when provider status='active')
    2. Toggle PATCHes provider with `enforce_sso: true/false`
    3. Add confirmation dialog: 'This will force all users with @domain.com to use SSO. Continue?' (follow Security.vue:342-408 pattern)
    4. Add 'Break-glass Override' info: explain that org_super_admin can bypass
  - Add info box: 'Users with org_super_admin role can always log in via password (emergency access)'

  **Must NOT do**:
  - Do NOT allow enforcement on unverified providers
  - Do NOT forget confirmation dialog (destructive setting)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Toggle with confirmation and implications
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 4)
  - **Blocks**: Task 16
  - **Blocked By**: Task 14

  **References**:
  - `Security.vue:342-408` — Toggle-with-confirmation pattern
  - `Security.vue` — Warning/info box patterns

  **Acceptance Criteria**:
  - [ ] Enforcement toggle working with confirmation dialog

  **QA Scenarios**:

  ```
  Scenario: Enforcement toggle shows confirmation
    Tool: Playwright
    Preconditions: Active SSO provider
    Steps:
      1. Click 'Enforce SSO' toggle
    Expected Result: Confirmation dialog appears
    Evidence: .sisyphus/evidence/task-15-confirmation.png

  Scenario: Break-glass info visible
    Tool: Playwright
    Steps:
      1. Look for info box about org_super_admin
    Expected Result: Info text visible explaining bypass
    Evidence: .sisyphus/evidence/task-15-breakglass-info.png
  ```

  **Commit**: YES
  - Message: `feat(ui): add SSO enforcement toggle with break-glass info`
  - Files: `src/components/organizations/SsoConfiguration.vue`


- [ ] 16. Auth Guard SSO Enforcement Check

  **What to do**:
  - Modify `src/modules/auth.ts`:
    1. After user authenticates (JWT validated), check if they used password or SSO
    2. If password: extract domain from `user.email`
    3. Call `/private/sso/check-enforcement` with email + auth_type='password'
    4. If `allowed=false`:
       - Check if user has `org_super_admin` role (call `/private/roles/check`)
       - If not super_admin: redirect to `/login?reason=sso_required`
       - Show message: 'Your organization requires SSO. Please log in via SSO.'
    5. If `allowed=true` or super_admin: proceed normally

  **Must NOT do**:
  - Do NOT block SSO-authenticated users (they already passed IdP)
  - Do NOT run check on every route change (cache result in auth store)

  **Recommended Agent Profile**:
  - **Category**: `quick` — Auth guard modification
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 4)
  - **Blocks**: Task 21
  - **Blocked By**: Task 7 (check-enforcement endpoint), Task 15

  **References**:
  - `src/modules/auth.ts` — Current auth guard
  - Use `lsp_find_references` to map all callers before modifying

  **Acceptance Criteria**:
  - [ ] Auth guard enforces SSO for password logins when enabled

  **QA Scenarios**:

  ```
  Scenario: Password login blocked when SSO enforced
    Tool: Playwright
    Preconditions: SSO enforced for example.com, user logged in via password
    Steps:
      1. Navigate to any protected page
    Expected Result: Redirected to /login with 'sso_required' message
    Evidence: .sisyphus/evidence/task-16-guard-block.png

  Scenario: Super admin bypasses enforcement
    Tool: Playwright
    Preconditions: SSO enforced, user has org_super_admin
    Steps:
      1. Log in via password as super_admin
      2. Navigate to protected page
    Expected Result: Page loads normally (bypass successful)
    Evidence: .sisyphus/evidence/task-16-superadmin-bypass.png
  ```

  **Commit**: YES
  - Message: `feat(auth): add SSO enforcement check to auth guard`
  - Files: `src/modules/auth.ts`


- [ ] 17. Environment Config (SUPABASE_MANAGEMENT_API_TOKEN)

  **What to do**:
  - Add to environment configuration:
    1. `supabase/functions/.env.example`: Add `SUPABASE_MANAGEMENT_API_TOKEN=`
    2. `configs.json`: Add entry for `SUPABASE_MANAGEMENT_API_TOKEN`
    3. `scripts/utils.mjs`: Ensure token is available via `getRightKey()`
  - Add validation: if token missing, log warning but don't crash (SSO endpoints will fail gracefully)
  - Update deployment docs: explain how to obtain Management API token from Supabase dashboard

  **Must NOT do**:
  - Do NOT commit actual token (only example placeholder)
  - Do NOT hardcode token in source

  **Recommended Agent Profile**:
  - **Category**: `quick` — Environment configuration
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 4)
  - **Blocks**: Task 5, 13 (Management API calls)
  - **Blocked By**: None

  **References**:
  - `supabase/functions/.env.example` — Current env template
  - `configs.json` — Config structure
  - `scripts/utils.mjs` — `getRightKey()` function

  **Acceptance Criteria**:
  - [ ] Environment config includes Management API token placeholder

  **QA Scenarios**:

  ```
  Scenario: Environment variable present
    Tool: Bash
    Steps:
      1. cat supabase/functions/.env.example | grep SUPABASE_MANAGEMENT_API_TOKEN
    Expected Result: Line present with placeholder
    Evidence: .sisyphus/evidence/task-17-env-config.txt
  ```

  **Commit**: YES
  - Message: `chore(env): add SUPABASE_MANAGEMENT_API_TOKEN configuration`
  - Files: `supabase/functions/.env.example`, `configs.json`, `scripts/utils.mjs`



- [ ] 18. Backend Tests for SSO Endpoints

  **What to do**:
  - Create `tests/sso-endpoints.test.ts`:
    - Test `POST /private/sso/providers`: Enterprise only, permission checks, validation
    - Test `GET /private/sso/providers/:orgId`: Returns correct providers
    - Test `PATCH /private/sso/providers/:id`: Updates allowed fields only
    - Test `DELETE /private/sso/providers/:id`: Deletes provider + Management API
    - Test `POST /private/sso/check-domain`: Returns correct has_sso status
    - Test `POST /private/sso/check-enforcement`: Blocks/enforces correctly, super_admin bypass
    - Test `POST /private/sso/prelink-users`: Pre-links existing users
  - Use isolated seed data (per AGENTS.md test isolation rules)
  - Add dedicated test users in `supabase/seed.sql`

  **Must NOT do**:
  - Do NOT use shared test data (test@capgo.app) for provider CRUD
  - Do NOT forget to clean up test providers in afterAll

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Comprehensive backend test suite
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 5)
  - **Blocks**: Task 21
  - **Blocked By**: Task 5, 6, 7

  **References**:
  - `tests/` — Existing test patterns
  - `tests/test-utils.ts` — Endpoint routing, auth helpers
  - AGENTS.md "Test Isolation for Parallel Execution" section

  **Acceptance Criteria**:
  - [ ] All SSO endpoints have test coverage

  **QA Scenarios**:

  ```
  Scenario: All backend tests pass
    Tool: Bash (bun test)
    Steps:
      1. bun test tests/sso-endpoints.test.ts
    Expected Result: All tests pass, 0 failures
    Evidence: .sisyphus/evidence/task-18-backend-tests.txt
  ```

  **Commit**: YES
  - Message: `test(backend): add SSO endpoints test suite`
  - Files: `tests/sso-endpoints.test.ts`, `supabase/seed.sql` (test data)


- [ ] 19. Playwright E2E for SSO Flow

  **What to do**:
  - Create `playwright/e2e/sso-login.spec.ts`:
    - Test: User with SSO domain sees SSO button, clicks it, redirects to IdP (mock)
    - Test: User with non-SSO domain sees password field, logs in normally
    - Test: SSO callback exchanges code and redirects to dashboard
    - Test: First SSO login auto-provisions user
  - Use `skill_mcp` with playwright skill for browser automation
  - Mock IdP redirect (since we can't test real SAML flow)

  **Must NOT do**:
  - Do NOT test against real IdP (use mocks)
  - Do NOT use hardcoded waits (use Playwright's auto-waiting)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Playwright E2E tests
  - **Skills**: [`playwright`]
    - `playwright`: Required for browser automation, page navigation, form filling, assertions

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 5)
  - **Blocks**: Task 21
  - **Blocked By**: Task 10, 12

  **References**:
  - `playwright/e2e/` — Existing E2E test patterns
  - `playwright.config.ts` — Playwright configuration

  **Acceptance Criteria**:
  - [ ] Playwright tests cover SSO login flow

  **QA Scenarios**:

  ```
  Scenario: SSO login flow E2E test
    Tool: Playwright (skill_mcp)
    Steps:
      1. Run: bun test:front playwright/e2e/sso-login.spec.ts
    Expected Result: All scenarios pass
    Evidence: .sisyphus/evidence/task-19-playwright-results.txt
  ```

  **Commit**: YES
  - Message: `test(e2e): add Playwright tests for SSO login flow`
  - Files: `playwright/e2e/sso-login.spec.ts`


- [ ] 20. Playwright E2E for Admin Configuration

  **What to do**:
  - Create `playwright/e2e/sso-admin.spec.ts`:
    - Test: Enterprise org admin can open SSO config section
    - Test: Create provider flow (domain input, metadata URL, DNS verification)
    - Test: Plan gating (Team org sees upgrade CTA)
    - Test: Enforcement toggle with confirmation dialog
    - Test: Permission gating (non-admin cannot see config)

  **Must NOT do**:
  - Do NOT test real DNS verification (mock API response)
  - Do NOT test real Management API (mock responses)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Playwright E2E tests
  - **Skills**: [`playwright`]
    - `playwright`: Required for UI interaction, form filling, assertions

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 5)
  - **Blocks**: Task 21
  - **Blocked By**: Task 14, 15

  **References**:
  - `playwright/e2e/` — Existing E2E patterns

  **Acceptance Criteria**:
  - [ ] Playwright tests cover admin SSO configuration

  **QA Scenarios**:

  ```
  Scenario: Admin SSO configuration E2E test
    Tool: Playwright (skill_mcp)
    Steps:
      1. Run: bun test:front playwright/e2e/sso-admin.spec.ts
    Expected Result: All scenarios pass
    Evidence: .sisyphus/evidence/task-20-admin-tests.txt
  ```

  **Commit**: YES
  - Message: `test(e2e): add Playwright tests for SSO admin configuration`
  - Files: `playwright/e2e/sso-admin.spec.ts`


- [ ] 21. Integration Test (Full SSO Login → Dashboard)

  **What to do**:
  - Create integration test covering complete flow:
    1. Enterprise org with SSO provider configured
    2. User with pre-linked identity (password removed, SSO linked)
    3. User visits login page, enters email, clicks Continue
    4. User sees SSO button, clicks it
    5. Mock IdP authentication (simulate SAML response)
    6. Callback exchanges code for session
    7. User redirected to dashboard
    8. Verify user can access protected resources
  - Test both success and failure paths

  **Must NOT do**:
  - Do NOT rely on real IdP (mock SAML assertions)
  - Do NOT skip verification of session validity

  **Recommended Agent Profile**:
  - **Category**: `deep` — Complex integration test spanning multiple systems
  - **Skills**: [`playwright`]
    - `playwright`: For full browser flow simulation

  **Parallelization**:
  - **Can Run In Parallel**: NO (Wave 5 sequential - final integration task)
  - **Blocks**: F1-F4 (final verification)
  - **Blocked By**: Task 10, 12, 16, 18, 19, 20

  **References**:
  - `tests/test-utils.ts` — Integration test helpers
  - `playwright/e2e/` — E2E patterns

  **Acceptance Criteria**:
  - [ ] Full integration test passes end-to-end

  **QA Scenarios**:

  ```
  Scenario: Full SSO integration test
    Tool: Bash (bun test) + Playwright
    Steps:
      1. Setup: Create enterprise org + SSO provider + pre-linked user
      2. Run: bun test tests/sso-integration.test.ts
    Expected Result: Test passes - user logs in via SSO, accesses dashboard
    Evidence: .sisyphus/evidence/task-21-integration-pass.txt
  ```

  **Commit**: YES
  - Message: `test(integration): add full SSO login flow integration test`
  - Files: `tests/sso-integration.test.ts`



---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `bun lint:fix && bun lint && bun typecheck`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Types [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (features working together, not isolation). Test edge cases: empty state, invalid input, rapid actions. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

Waves 1-4 commit per task (or grouped where logical). Wave 5 commits test files. Final verification has no commits (review only).

| Task | Commit Message | Files |
|------|----------------|-------|
| 1 | `feat(db): add sso_providers table with RBAC permission` | `supabase/migrations/YYYYMMDDHHMMSS_add_sso_providers.sql` |
| 2 | `feat(backend): add Supabase Management API utility module` | `supabase/functions/_backend/utils/supabase-management.ts` |
| 3 | `feat(api): add domain check endpoint for SSO routing` | `supabase/functions/_backend/private/sso/check-domain.ts` |
| 4 | `feat(utils): add DNS TXT verification via DoH` | `supabase/functions/_backend/utils/dns-verification.ts` |
| 5 | `feat(api): add SSO provider CRUD endpoints` | `supabase/functions/_backend/private/sso/index.ts` |
| 6 | `feat(api): add pre-linking endpoint for SSO migration` | `supabase/functions/_backend/private/sso/prelink.ts` |
| 7 | `feat(api): add SSO enforcement check endpoint` | `supabase/functions/_backend/private/sso/check-enforcement.ts` |
| 8 | `feat(utils): add Enterprise plan validation helper` | `supabase/functions/_backend/utils/plan-gating.ts` |
| 9 | `feat(ui): redesign login to two-step flow with SSO routing` | `src/pages/login.vue` |
| 10 | `feat(ui): add SSO callback page with code exchange` | `src/pages/sso-callback.vue` + router |
| 11 | `feat(composables): add domain-based SSO routing logic` | `src/composables/useSSORouting.ts` |
| 12 | `feat(auth): add auto-provisioning for first SSO login` | `src/composables/useSSOProvisioning.ts` |
| 13 | `feat(ui): add SSO configuration component` | `src/components/organizations/SsoConfiguration.vue` |
| 14 | `feat(ui): integrate SSO config into Security settings` | `src/pages/settings/organization/Security.vue` |
| 15 | `feat(ui): add SSO enforcement toggle with break-glass info` | `src/components/organizations/SsoConfiguration.vue` |
| 16 | `feat(auth): add SSO enforcement check to auth guard` | `src/modules/auth.ts` |
| 17 | `chore(env): add SUPABASE_MANAGEMENT_API_TOKEN configuration` | `.env.example`, `configs.json`, `scripts/utils.mjs` |
| 18 | `test(backend): add SSO endpoints test suite` | `tests/sso-endpoints.test.ts` |
| 19 | `test(e2e): add Playwright tests for SSO login flow` | `playwright/e2e/sso-login.spec.ts` |
| 20 | `test(e2e): add Playwright tests for SSO admin configuration` | `playwright/e2e/sso-admin.spec.ts` |
| 21 | `test(integration): add full SSO login flow integration test` | `tests/sso-integration.test.ts` |

---

## Success Criteria

### Verification Commands

```bash
# 1. Database migration applied
bunx supabase db reset

# 2. All tests pass
bun test:all
bun test:front

# 3. Lint and typecheck clean
bun lint && bun typecheck

# 4. SSO domain check endpoint
curl -X POST "$API_URL/private/sso/check-domain" \
  -H "Authorization: Bearer $JWT" \
  -d '{"email":"user@enterprise.com"}' | jq '.has_sso'

# 5. Login page two-step flow
# (Playwright test: user@sso-domain.com → SSO button visible)

# 6. SSO callback exchanges code
# (Playwright test: /sso-callback?code=XXX → session → dashboard)

# 7. Enterprise plan gating
curl -X POST "$API_URL/private/sso/providers" \
  -H "Authorization: Bearer $TEAM_JWT" \
  -d '{"org_id":"team-org","domain":"test.com"}'
# Expected: HTTP 403

# 8. SSO enforcement blocks password
curl -X POST "$API_URL/private/sso/check-enforcement" \
  -d '{"email":"user@enforced.com","auth_type":"password"}'
# Expected: allowed: false
```

### Final Checklist

- [ ] All "Must Have" present and working
- [ ] All "Must NOT Have" absent from codebase
- [ ] All backend tests pass (`bun test:backend`)
- [ ] All Playwright tests pass (`bun test:front`)
- [ ] No lint errors (`bun lint`)
- [ ] No type errors (`bun typecheck`)
- [ ] Evidence files exist for all QA scenarios
- [ ] Final verification wave: ALL agents APPROVE
- [ ] PR marked with "(AI generated)" sections per AGENTS.md

---

*Plan generated by Prometheus. Ready for `/start-work` execution.*

