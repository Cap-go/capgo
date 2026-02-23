# Enterprise SSO - Decisions

## [2026-02-23] Initial Decisions

### Architecture
- SSO endpoints live under `supabase/functions/_backend/private/sso/`
- Management API utility: `supabase/functions/_backend/utils/supabase-management.ts`
- DNS verification utility: `supabase/functions/_backend/utils/dns-verification.ts`
- Plan gating utility: `supabase/functions/_backend/utils/plan-gating.ts`
- Frontend composables: `src/composables/useSSORouting.ts`, `src/composables/useSSOProvisioning.ts`
- SSO config component: `src/components/organizations/SsoConfiguration.vue` (NOT inline in Security.vue)

### Database
- New table: `public.sso_providers` (no changes to `public.orgs`)
- RBAC permission: `org.manage_sso`
- Status flow: pending_verification → verified → active → disabled
- Domain uniqueness: UNIQUE constraint on domain column

### Security
- `dns_verification_token` NOT returned in LIST endpoint
- Management API token never logged/exposed
- SSO enforcement only on active providers (not pending/verified)
