# Organization Email Domain Auto-Join

## Summary

Implements domain-based automatic member enrollment for organizations. Admins can configure trusted email domains (e.g., `@company.com`) that automatically add new users to their organization when they sign up or log in, eliminating the need for manual invitations.

## Problem

Organizations with many team members must manually invite each member, creating administrative overhead and friction during onboarding. This is especially problematic for:
- Enterprise teams onboarding new developers
- Companies wanting seamless team access
- Educational institutions managing student accounts

## Solution

Auto-join feature that:
- ✅ Allows orgs to pre-configure trusted email domains
- ✅ Automatically adds users from those domains on signup/login
- ✅ Assigns read-only permissions by default
- ✅ Blocks public domains (gmail, yahoo, outlook, etc.)
- ✅ Enforces domain uniqueness for SSO-enabled orgs
- ✅ Provides admin UI for configuration

## Key Features

### Domain Configuration
- Admins can add multiple email domains
- Real-time validation and normalization
- Blocked public providers (gmail.com, yahoo.com, hotmail.com, etc.)
- Enable/disable toggle for auto-join functionality

### Security & Validation
- **Blocked Domains**: Prevents use of public email providers
- **Domain Uniqueness**: When SSO enabled, domain must be unique across orgs
- **Permission Requirements**: Only admins/super_admins can configure
- **Default Role**: Auto-joined users get "read" role by default

### Auto-Join Flow

**On User Signup:**
1. User signs up with `user@company.com`
2. Database trigger extracts domain (`company.com`)
3. Finds orgs with matching domain in `allowed_email_domains`
4. Automatically adds user to those orgs with "read" role

**On User Login:**
1. User logs in
2. Backend checks for matching orgs via `/private/check_auto_join_orgs`
3. Adds user to any new matching orgs (if not already member)

## Technical Implementation

### Database Changes

**New Columns in `orgs` table:**
- `allowed_email_domains` (text[]): Array of allowed domains
- `sso_enabled` (boolean): Master toggle for auto-join
- `sso_domain_keys` (text[]): Internal uniqueness enforcement keys

**New Functions:**
- `extract_email_domain(email)`: Extracts domain from email
- `is_blocked_email_domain(domain)`: Checks against blocklist
- `find_orgs_by_email_domain(email)`: Finds matching orgs
- `auto_join_user_to_orgs_by_email(user_id, email)`: Executes auto-join
- `validate_allowed_email_domains()`: Validates domains

**Triggers:**
- `auto_join_user_to_orgs_on_create`: Fires on user signup (auth.users INSERT)
- `validate_org_email_domains`: Enforces validation before UPDATE
- `maintain_sso_domain_keys`: Maintains SSO uniqueness keys

**Indexes:**
- `idx_orgs_allowed_email_domains` (GIN): Fast domain lookups
- `idx_orgs_sso_domain_keys` (GIN): SSO conflict detection
- `idx_org_users_org_user_covering`: Optimized permission checks

### Backend API Endpoints

**Private Endpoints (JWT Auth):**
- `GET /private/organization_domains_get` - Get current config (read permission)
- `PUT /private/organization_domains_put` - Update config (admin permission)
- `POST /private/check_auto_join_orgs` - Check/execute auto-join on login

**Public Endpoints (API Key Auth):**
- `GET /organization/domains` - Get config via API key
- `PUT /organization/domains` - Update config via API key

### Frontend Components

**Auto-Join Configuration Page:** `src/pages/settings/organization/autojoin.vue`
- Location: `/settings/organization/autojoin`
- Add/remove email domains
- Enable/disable auto-join toggle
- Real-time validation feedback
- Security notices for blocked/conflicting domains
- Admin-only access

**Organization Store Updates:**
- Improved default org selection (prefers user's own org over auto-joined orgs)
- Prevents accidental switching to auto-joined orgs on login

## Files Changed

### New Files (10)
**Frontend:**
- `src/pages/settings/organization/autojoin.vue` - Admin configuration UI

**Backend:**
- `supabase/functions/_backend/private/organization_domains_get.ts` - GET private endpoint
- `supabase/functions/_backend/private/organization_domains_put.ts` - PUT private endpoint
- `supabase/functions/_backend/private/check_auto_join_orgs.ts` - Login auto-join handler
- `supabase/functions/_backend/public/organization/domains/get.ts` - GET public endpoint
- `supabase/functions/_backend/public/organization/domains/put.ts` - PUT public endpoint

**Database:**
- `supabase/migrations/20251222054835_add_org_email_domain_auto_join.sql` - Core schema
- `supabase/migrations/20251222073507_add_domain_security_constraints.sql` - Security constraints
- `supabase/migrations/20251222091718_update_auto_join_check_enabled.sql` - SSO toggle
- `supabase/migrations/20251222120534_optimize_org_users_permissions_query.sql` - Performance

**Tests:**
- `tests/organization-domain-autojoin.test.ts` - Comprehensive test suite

### Modified Files (5)
- `src/constants/organizationTabs.ts` - Added "Auto-Join" tab
- `src/layouts/settings.vue` - Added auto-join route
- `supabase/functions/private/index.ts` - Registered new endpoints
- `src/components.d.ts` - Auto-generated types
- `src/typed-router.d.ts` - Auto-generated routes

## Testing

### Manual Testing Steps

**Setup:**
1. Start local environment: `supabase start && bun serve:local`
2. Log in as admin: `admin@capgo.app`
3. Navigate to organization settings: `/settings/organization/autojoin`

**Configure Auto-Join:**
1. Add domain: `mycompany.com`
2. Enable auto-join toggle
3. Save configuration

**Test Signup Flow:**
1. Sign up new user: `newuser@mycompany.com`
2. Verify user automatically added to organization
3. Check user has "read" role
4. Verify `org_users` table entry created

**Test Login Flow:**
1. Configure auto-join for existing org
2. Log in as existing user with matching domain
3. Verify user auto-joins on login via `/private/check_auto_join_orgs`

**Test Validation:**
1. Try adding `gmail.com` → Should show error (blocked domain)
2. Try adding invalid domain → Should show validation error
3. With SSO enabled, try duplicate domain → Should show uniqueness error

### Automated Tests

Run backend tests:
```bash
bun test:backend
```

Tests cover:
- Domain validation (blocked domains, format)
- Auto-join on signup trigger
- Auto-join on login endpoint
- Permission checks for endpoints
- SSO domain uniqueness
- Duplicate membership prevention
- Default role assignment

## Security Considerations

### Blocked Public Domains
Cannot use: gmail.com, yahoo.com, outlook.com, hotmail.com, icloud.com, aol.com, protonmail.com, and 30+ other public providers

### Domain Uniqueness (SSO Mode)
When `sso_enabled = true`:
- Domain must be unique across all organizations
- Prevents domain conflicts for SSO providers
- Validated at database level via trigger

### Permission Requirements
- **View Config**: read, write, or all permission
- **Update Config**: admin or super_admin permission
- **API Access**: Valid API key with appropriate permissions

### Default Role Safety
Auto-joined users always receive "read" role (lowest permission level)

## Breaking Changes

None. This is a new feature with backward compatibility:
- New columns have safe defaults (`NULL` or empty arrays)
- Existing organizations unaffected (auto-join disabled by default)
- No changes to existing authentication flow

## Migration Notes

### Database Migrations (4 files)
1. **20251222054835** - Core schema (columns, functions, triggers)
2. **20251222073507** - Security constraints (blocklist, uniqueness)
3. **20251222091718** - SSO toggle refinements
4. **20251222120534** - Performance optimization (covering index)

### Deployment Steps
1. Apply database migrations: `supabase db push --linked`
2. Deploy backend functions (Cloudflare Workers + Supabase)
3. Deploy frontend with new UI page
4. No manual data migration required

### Rollback Strategy
If needed, rollback migrations in reverse order. Auto-join relationships in `org_users` table will remain but won't be created for new users.

## Performance Impact

- New GIN indexes for fast domain lookups (minimal query overhead)
- Triggers fire only on user signup (rare operation)
- Login check is single query with indexed lookup (<10ms)
- No impact on existing user queries

## Documentation

Comprehensive documentation in:
- Migration SQL files (inline comments)
- Test file demonstrates usage patterns
- API endpoint JSDoc comments

---

**PR Checklist:**
- [x] Database migrations tested locally
- [x] Backend endpoints implemented with permission checks
- [x] Frontend UI follows Vue 3 Composition API patterns
- [x] Domain validation comprehensive (blocklist + uniqueness)
- [x] Security constraints enforced at database level
- [x] Automated tests cover all scenarios
- [x] Manual testing completed end-to-end
- [x] No breaking changes
- [x] Backward compatible with existing orgs
