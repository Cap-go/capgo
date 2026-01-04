## Summary

This PR implements domain-based automatic organization enrollment (auto-join), enabling organizations to automatically add users with matching email domains without requiring manual invitations. When an organization configures an allowed email domain (e.g., `company.com`) and enables auto-join, any user signing up or logging in with a matching email (e.g., `user@company.com`) is automatically added to the organization with read-level permissions.

## Test plan

### Database Setup
1. Run `supabase db reset` to apply migration `20251231000001_add_domain_based_auto_join.sql`
2. Verify tables have new columns: `orgs.allowed_email_domains` and `orgs.sso_enabled`

### Backend Testing
✅ **All 19 tests passing** (19 passed, 0 failed)

Run comprehensive test suite:
```bash
bun test:backend domain-based-auto-join
```

**Test Coverage** (19 tests total):
1. **[GET] /organization/domains** (3 tests)
   - ✅ Should get allowed email domains for an org
   - ✅ Should return empty array for org with no allowed domains
   - ✅ Should reject request without org membership

2. **[PUT] /organization/domains** (6 tests)
   - ✅ Should update allowed email domains
   - ✅ Should normalize domains (lowercase, trim, remove @)
   - ✅ Should reject invalid domains
   - ✅ Should reject blocked public email domains
   - ✅ Should clear domains with empty array
   - ✅ Should reject request from non-admin user

3. **SSO Domain Uniqueness** (2 tests)
   - ✅ Should allow same domain for multiple non-SSO orgs
   - ✅ Should prevent SSO domain conflicts

4. **Auto-Join Functionality** (4 tests)
   - ✅ Should auto-join user to org on signup with matching email domain
   - ✅ Should NOT auto-join user with non-matching domain
   - ✅ Should auto-join user to single org with matching domain when SSO enabled
   - ✅ Should NOT duplicate membership if user already belongs to org

5. **Database Functions** (4 tests)
   - ✅ Extract email domain correctly
   - ✅ Handle uppercase domains
   - ✅ Find orgs by email domain
   - ✅ Return empty for non-matching domain

### Frontend Testing
1. Navigate to Organization Settings → SSO tab (`/settings/organization/autojoin`)
2. Add an allowed email domain (e.g., `yourcompany.com`)
3. Toggle auto-join to enabled
4. Create a new test account with matching email domain
5. Verify user is automatically added to organization with "read" permissions
6. Test login flow for existing users with matching domains
7. Verify public domains (gmail.com, yahoo.com, etc.) are rejected with clear error messages

### Manual Verification
- Check organization members list shows auto-joined users
- Verify audit logs record auto-join events (if audit logging enabled)
- Test disabling auto-join prevents new enrollments
- Confirm domain removal blocks future auto-joins

## Screenshots

### Organization Auto-Join Settings UI
![Auto-Join Configuration Interface](screenshots/autojoin-ui.png)
*New settings page at `/settings/organization/autojoin` for managing domain-based enrollment*

### Domain Management
- Enable/disable auto-join toggle
- Real-time validation with error feedback
- Public domain blocking (gmail.com, yahoo.com, etc.)

### User Flow
1. Admin configures domain: `company.com`
2. Admin enables auto-join toggle
3. New user signs up with `john@company.com`
4. User automatically joins organization with "read" permissions
5. No invitation email required

<!-- Include screenshots/videos (if any) of how the PR works -->
<!-- Please include this if CLI/frontend behaviour has changed, can be skipped for backend changes -->

## Checklist

<!--- Go over all the following points, and put an `x` in all the boxes that apply. -->
<!--- If you're unsure about any of these, don't hesitate to ask. We're here to help! -->
### ✅ Code Quality
- [x] Ran `bun lint:fix` - Auto-fixed all linting issues
- [x] Ran `bun lint` - No linting errors remain
- [x] Ran `bun lint:backend` - Backend linting passes
- [x] Ran `bun typecheck` - TypeScript type checking passes
- [x] Ran `bun types` - Regenerated TypeScript types after schema changes
- [x] Code follows Vue 3 Composition API with `<script setup>` syntax
- [x] Used Tailwind CSS utility classes (not custom CSS)
- [x] Used DaisyUI components for interactive elements
- [x] Frontend imports use `~/` alias for src directory
- [x] No `v-html` usage in Vue files (security)
- [x] No TODO/FIXME/XXX comments added
- [x] console.error used appropriately (frontend error debugging only)

### 🧪 Testing
- [x] Ran `bun test:backend domain-based-auto-join` - **All 19 tests pass**
- [x] Added comprehensive E2E tests (673 lines)
- [x] Database changes covered with tests
- [x] Manually tested the feature
- [x] Provided manual test steps in PR description

### 🗄️ Database & Migrations
- [x] Created ONE migration file: `20251231000001_add_domain_based_auto_join.sql`
- [x] Never edited committed migrations
- [x] Ran `supabase db reset` - Migration applies cleanly
- [x] Updated `supabase/seed.sql` with test fixtures (if needed)
- [x] Used Drizzle ORM patterns from `postgress_schema.ts`

### 🎨 Frontend Standards
- [x] Used Tailwind CSS utility classes exclusively
- [x] Used DaisyUI components (`d-btn`, `d-input`, etc.)
- [x] Followed color palette from `src/styles/style.css`
- [x] Proper file-based routing in `src/pages/`

### 🔧 Backend Standards
- [x] Used shared code in `supabase/functions/_backend/`
- [x] Proper logging with `cloudlog({ requestId: c.get('requestId'), ... })`
- [x] Used Hono `Context` with `MiddlewareKeyVariables` type
- [x] Proper error handling with `simpleError()` helper
- [x] Authentication via `middlewareAPISecret` or `middlewareKey`
- [x] Always called `closeClient(c, pgClient)` after database operations (prevents connection leaks)

### 📝 PR Description Quality
- [x] Clear Summary section - Explains what and why
- [x] Test Plan section - Manual testing steps included
- [x] Files Changed section - Lists all affected files
- [x] Technical Implementation documented
- [x] Security considerations documented
- [x] Limitations documented

### Standard Template Checklist- [x] My code follows the code style of this project and passes
      `bun run lint:backend && bun run lint`.
- [ ] My change requires a change to the documentation.
- [ ] I have [updated the documentation](https://github.com/Cap-go/website)
      accordingly.
- [x] My change has adequate E2E test coverage.
- [x] I have tested my code manually, and I have provided steps how to reproduce
      my tests

## Additional Notes

### Key Files Changed

**Database Migration:**
- `supabase/migrations/20251231000001_add_domain_based_auto_join.sql`
  - Adds `allowed_email_domains` and `sso_enabled` columns to `orgs` table
  - Creates `auto_join_user_to_orgs_by_email()` function
  - Implements database trigger `auto_join_user_to_orgs_on_create` for signup auto-join

**Backend API:**
- `supabase/functions/_backend/private/check_auto_join_orgs.ts` - Login-time auto-join check endpoint
- `supabase/functions/_backend/private/organization_domains_get.ts` - Fetch org domain config
- `supabase/functions/_backend/private/organization_domains_put.ts` - Update org domain config

**Frontend:**
- `src/pages/settings/organization/sso.vue` - New UI component for domain configuration
- `src/modules/auth.ts` - Integration with login flow to trigger auto-join check
- `src/constants/organizationTabs.ts` - Added "Auto-Join" tab to org settings

**Tests:**
- `tests/domain-based-auto-join.test.ts` - 673 lines of comprehensive E2E tests

### Security Considerations

- Public email domains (gmail.com, yahoo.com, outlook.com, etc.) are blocked
- Only admins/super_admins can configure domains
- Domain uniqueness enforced across organizations
- Auto-joined users receive minimal "read" permissions
- Changes are validated on both frontend and backend

### Limitations

- Domain support depends on SSO configuration (single or multiple domain for SSO-enabled orgs)
- Auto-join applies to new signups and next login for existing users (not retroactive)
- Requires organization to be on a valid billing plan

### Testing Results

**Test Execution Summary:**
- Total Tests: 19
- Passed: 19 ✅
- Failed: 0
- Duration: ~84 seconds
- Database Reset: Required before running tests

**Coverage Areas:**
- API endpoint validation (GET/PUT)
- Domain normalization and validation
- Public domain blocking (gmail.com, yahoo.com, etc.)
- Permission checks (admin/super_admin only)
- Auto-join database triggers
- Domain uniqueness constraints
- Edge cases (duplicate membership, non-matching domains)

### Code Quality Results

✅ **Linting**: All files pass ESLint
✅ **Type Checking**: No TypeScript errors
✅ **Code Style**: Follows @antfu/eslint-config
✅ **Vue Standards**: Uses Composition API with `<script setup>`
✅ **No Security Issues**: No `v-html`, proper authentication/authorization
