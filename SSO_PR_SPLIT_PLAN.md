# SSO Feature - PR Split Plan

## Problem Analysis

Your boss is right: this branch combines ~10k LOC across 61 files into a single "mega-PR" that's impossible to review properly. The branch has:

- 13 separate migration files (should be 1 editable migration)
- 6 backend endpoints totaling 67KB
- Large frontend pages (1.3k+ lines each)
- Docs, tests, mocks, scripts, and infrastructure changes all mixed together

## Split Strategy (5 PRs, Sequential Landing)

### PR #1: Database Schema Foundation

**Branch:** `feature/sso-01-schema`
**Base:** `main`
**Size:** ~1 file, 600 lines

**Files to include:**

```
supabase/migrations/20260107210800_sso_saml_complete.sql
```

**What to do:**

1. Create ONE consolidated migration by merging these 13 files in chronological order:
   - `20251224022658_add_sso_saml_infrastructure.sql`
   - `20251224033604_add_sso_login_trigger.sql`
   - `20251226121026_fix_sso_domain_auto_join.sql`
   - `20251226121702_enforce_sso_signup.sql`
   - `20251226133424_fix_sso_lookup_function.sql`
   - `20251226182000_fix_sso_auto_join_trigger.sql`
   - `20251227010100_allow_sso_metadata_signup_bypass.sql`
   - `20251231000002_add_sso_saml_authentication.sql`
   - `20251231175228_add_auto_join_enabled_to_sso.sql`
   - `20251231191232_fix_auto_join_check.sql`
   - `20260104064028_enforce_single_sso_per_org.sql`
   - `20260106000000_fix_auto_join_allowed_domains.sql`

2. Remove duplicate CREATE TABLE statements (keep only the final evolved version)
3. Keep all indexes, triggers, functions, RLS policies in final form
4. Update `supabase/schemas/prod.sql` if needed
5. Generate types: `bun types`

**Schema should include:**

- Tables: `org_saml_connections`, `saml_domain_mappings`, `sso_audit_logs`
- Functions: `check_org_sso_configured`, `lookup_sso_provider_for_email`, `auto_join_user_to_org_via_sso`
- Triggers: `auto_join_sso_user_trigger`, `check_sso_domain_on_signup_trigger`
- RLS policies for all tables
- Indexes for performance

**Minimal test checklist:**

```bash
# 1. Migration applies cleanly
supabase db reset
# Should complete without errors

# 2. Types generate
bun types
# Should update supabase.types.ts

# 3. Tables exist
psql $POSTGRES_URL -c "\dt org_saml_connections saml_domain_mappings sso_audit_logs"
# All 3 tables should be listed

# 4. Functions exist
psql $POSTGRES_URL -c "\df check_org_sso_configured"
# Function should be listed

# 5. Lint passes
bun lint:backend
```

---

### PR #2: Backend SSO Endpoints

**Branch:** `feature/sso-02-backend`
**Base:** `feature/sso-01-schema` (after PR #1 merged, rebase to main)
**Size:** ~10 files, 2k lines

**Files to include:**

```
supabase/functions/_backend/private/sso_configure.ts
supabase/functions/_backend/private/sso_management.ts
supabase/functions/_backend/private/sso_remove.ts
supabase/functions/_backend/private/sso_status.ts
supabase/functions/_backend/private/sso_test.ts
supabase/functions/_backend/private/sso_update.ts
supabase/functions/private/index.ts (route additions)
supabase/functions/sso_check/index.ts
supabase/functions/mock-sso-callback/index.ts (mock endpoint)
supabase/functions/_backend/utils/cache.ts (Cache API fixes)
supabase/functions/_backend/utils/postgres_schema.ts (schema updates)
supabase/functions/_backend/utils/supabase.types.ts (type updates)
supabase/functions/_backend/utils/version.ts (version bump if needed)
cloudflare_workers/api/index.ts (SSO routes)
.env.test (SSO test vars if added)
```

**Route structure:**

- `/private/sso/configure` - Create SSO connection
- `/private/sso/update` - Update SSO config
- `/private/sso/remove` - Delete SSO connection
- `/private/sso/test` - Test SSO flow
- `/private/sso/status` - Get SSO status
- `/sso_check` - Public endpoint to check if email has SSO
- `/mock-sso-callback` - Mock IdP callback for testing

**Minimal test checklist:**

```bash
# 1. Lint passes
bun lint:backend
bun lint:fix

# 2. Backend tests pass
bun test:backend

# 3. SSO management tests pass
bun test tests/sso-management.test.ts

# 4. SSRF unit tests pass
bun test tests/sso-ssrf-unit.test.ts

# 5. All routes reachable
curl http://localhost:54321/functions/v1/private/sso/status
curl http://localhost:54321/functions/v1/sso_check
# Should return 401/403 (requires auth) not 404

# 6. Cloudflare Workers routing works
./scripts/start-cloudflare-workers.sh
curl http://localhost:8787/private/sso/status
# Should route correctly

# 7. Mock callback works
curl http://localhost:54321/functions/v1/mock-sso-callback
# Should return HTML page
```

**What NOT to include:**

- Frontend code
- E2E tests
- Documentation
- Helper scripts

---

### PR #3: Frontend SSO UI & Flows

**Branch:** `feature/sso-03-frontend`
**Base:** `feature/sso-02-backend` (after PR #2 merged, rebase to main)
**Size:** ~8 files, 2k lines

**Files to include:**

```
src/pages/settings/organization/sso.vue (SSO config wizard)
src/pages/sso-login.vue (SSO login flow)
src/pages/login.vue (SSO redirect detection)
src/composables/useSSODetection.ts (SSO detection logic)
src/layouts/settings.vue (layout updates for SSO tab)
src/constants/organizationTabs.ts (add SSO tab)
src/types/supabase.types.ts (frontend types)
src/auto-imports.d.ts (auto-import updates)
messages/en.json (i18n strings)
```

**Key features:**

- SSO configuration wizard in organization settings
- SSO login page with email detection
- Login page SSO redirect handling
- Composable for SSO detection/initiation
- Organization settings tab for SSO

**Minimal test checklist:**

```bash
# 1. Lint passes
bun lint
bun lint:fix

# 2. Type check passes
bun typecheck

# 3. Frontend builds
bun build
# Should complete without errors

# 4. Dev server runs
bun serve:local
# Navigate to /settings/organization/sso
# Should load without console errors

# 5. SSO wizard renders
# - Entity ID display
# - Metadata URL input
# - Domain configuration
# - Test connection button
# All sections should be visible

# 6. SSO login page works
# Navigate to /sso-login
# Enter email with @example.com
# Should show "Continue with SSO" button

# 7. Login page detects SSO
# Navigate to /login?from_sso=true
# Should show "Signing you in..." message
```

**What NOT to include:**

- E2E tests (next PR)
- Documentation (next PR)
- Helper scripts (next PR)

---

### PR #4: Testing Infrastructure

**Branch:** `feature/sso-04-tests`
**Base:** `feature/sso-03-frontend` (after PR #3 merged, rebase to main)
**Size:** ~5 files, 1k lines

**Files to include:**

```
tests/sso-management.test.ts (backend unit tests)
tests/sso-ssrf-unit.test.ts (SSRF protection tests)
tests/test-utils.ts (SSO test helpers)
playwright/e2e/sso.spec.ts (E2E tests)
vitest.config.ts (test config updates)
```

**Test coverage:**

- Backend SSO management API (configure, update, remove, test, status)
- SSRF protection (metadata URL validation)
- Frontend SSO wizard flow (Playwright)
- SSO login flow (Playwright)
- Auto-join trigger behavior
- Audit log creation

**Minimal test checklist:**

```bash
# 1. Backend tests pass
bun test tests/sso-management.test.ts
bun test tests/sso-ssrf-unit.test.ts

# 2. E2E tests pass
bun test:front playwright/e2e/sso.spec.ts

# 3. All tests pass together
bun test:backend
bun test:front

# 4. Cloudflare Workers tests pass
bun test:cloudflare:backend

# 5. Test coverage acceptable
bun test --coverage
# Should show >80% coverage for SSO files
```

---

### PR #5: Documentation & Utilities

**Branch:** `feature/sso-05-docs`
**Base:** `feature/sso-04-tests` (after PR #4 merged, rebase to main)
**Size:** ~10 files, 2k lines

**Files to include:**

```
docs/sso-setup.md (setup guide)
docs/sso-production.md (production deployment guide)
docs/MOCK_SSO_TESTING.md (testing guide)
restart-auth-with-saml.sh (reset script)
restart-auth-with-saml-v2.sh (alternate reset script)
verify-sso-routes.sh (route verification script)
temp-sso-trace.ts (debugging utility, can be .gitignore'd)
.gitignore (add temp files)
supabase/config.toml (SSO config if needed)
.github/workflows/build_and_deploy.yml (CI updates if needed)
```

**Documentation should cover:**

- How to configure SSO for an organization
- How to add SAML providers (Okta, Azure AD, Google)
- How to test SSO locally with mock callback
- How to verify SSO routes are working
- How to reset Supabase Auth SSO config
- Production deployment considerations
- Troubleshooting common issues

**Minimal test checklist:**

```bash
# 1. Scripts are executable
chmod +x restart-auth-with-saml.sh
chmod +x verify-sso-routes.sh

# 2. Verify routes script works
./verify-sso-routes.sh
# Should check all SSO endpoints

# 3. Documentation is complete
# Read through each doc file
# Verify all steps are clear
# Verify all commands work

# 4. Markdown lint passes (if configured)
markdownlint docs/sso-*.md docs/MOCK_SSO_TESTING.md
```

---

## Landing Sequence

### Before Any PR

1. Create feature branch from main: `git checkout -b feature/sso-01-schema main`
2. Run full test suite: `bun test:all`
3. Ensure main is passing

### PR #1: Schema

1. Create consolidated migration
2. Test: `supabase db reset && bun types`
3. Push PR, get review, merge to main
4. **Verify**: Schema deployed to development environment

### PR #2: Backend

1. Rebase on main: `git rebase main`
2. Copy backend files from original branch
3. Test: `bun test:backend && bun lint:backend`
4. Push PR, get review, merge to main
5. **Verify**: Backend endpoints work in development

### PR #3: Frontend

1. Rebase on main: `git rebase main`
2. Copy frontend files from original branch
3. Test: `bun lint && bun typecheck && bun build`
4. Push PR, get review, merge to main
5. **Verify**: UI renders in development

### PR #4: Tests

1. Rebase on main: `git rebase main`
2. Copy test files from original branch
3. Test: `bun test:all`
4. Push PR, get review, merge to main
5. **Verify**: All tests pass in CI

### PR #5: Docs

1. Rebase on main: `git rebase main`
2. Copy docs/scripts from original branch
3. Test: Run verification scripts
4. Push PR, get review, merge to main
5. **Verify**: Documentation is accessible

### Final Integration Test

After all 5 PRs are merged to main:

```bash
# 1. Fresh clone
git clone <repo> sso-integration-test
cd sso-integration-test

# 2. Database setup
supabase start
supabase db reset
bun types

# 3. Start all services
bun backend &
./scripts/start-cloudflare-workers.sh &
bun serve:local &

# 4. Full SSO flow test
# - Navigate to /settings/organization/sso as admin
# - Configure SSO with mock IdP
# - Test SSO login with test user
# - Verify user is created and enrolled in org
# - Check audit logs

# 5. Run full test suite
bun test:all
bun test:cloudflare:all
bun test:front
```

---

## Common Pitfalls to Avoid

### ❌ DON'T:

- Mix unrelated changes (formatting, refactoring) into PRs
- Include generated files (`src/typed-router.d.ts`) unless consistent
- Edit previously committed migrations
- Skip lint/type checks before pushing
- Chain PRs without rebasing on main first
- Batch multiple independent features into one PR

### ✅ DO:

- Keep each PR focused on one concern (schema, backend, frontend, tests, docs)
- Run `bun lint:fix` before every commit
- Rebase on main after each PR merge
- Update PR descriptions with testing steps
- Mark PRs as draft until CI passes
- Request review only when all checks are green
- Include "Closes #<issue>" in final PR

---

## Why This Works

1. **Reviewable size**: Each PR is 200-1k lines vs 10k lines
2. **Clear dependencies**: Schema → Backend → Frontend → Tests → Docs
3. **Incremental testing**: Each layer is tested before building on it
4. **Rollback safety**: Can revert individual PRs without breaking others
5. **Parallel review**: Multiple reviewers can work on different PRs
6. **Clear scope**: Each PR has one purpose, easy to verify
7. **Migration best practice**: Single consolidated migration, not 13 files

Your boss will be happy because:

- Each PR is immediately reviewable (not "contains another PR inside")
- Each PR passes lint/tests before review
- Each PR has clear acceptance criteria
- The feature can be reviewed layer-by-layer instead of all-at-once
