# Mock SSO Testing Guide

This mock SSO endpoint simulates Okta's SAML authentication flow for local development. It replicates the exact behavior you'll see in production with real Okta SAML SSO.

## How It Works

### Production SAML Flow (with Okta)
1. User enters email → Frontend checks if SSO is configured
2. User clicks "Continue with SSO" → Redirects to Okta login page
3. User authenticates at Okta → Okta generates SAML assertion
4. Okta POSTs SAML response to Supabase ACS URL (`/auth/v1/sso/saml/acs`)
5. Supabase validates SAML, creates session, redirects back to app with tokens

### Local Mock Flow (simulated)
1. User enters email → Frontend checks if SSO is configured ✅ (uses real database)
2. User clicks "Continue with SSO" → Redirects to **mock endpoint** instead of Okta
3. Mock endpoint validates SSO config ✅ (queries real database)
4. Mock creates/authenticates user ✅ (uses Supabase admin API)
5. Mock generates session tokens and redirects back to app ✅ (same as production)

**The only difference:** Steps 2-4 are simulated locally instead of going to Okta. Everything else is identical to production.

## Prerequisites

1. **Supabase running locally:**
   ```bash
   supabase start
   ```

2. **Database seeded with SSO configuration:**
   ```bash
   supabase db reset
   ```

3. **SSO domain configured** (from your SSO setup in the UI):
   - Domain: `congocmc.com`
   - Provider ID: Generated when you created the config
   - Enabled: `true`
   - Verified: `true`

## Testing Steps

### 1. Start the Frontend
```bash
bun serve:local
```

### 2. Navigate to SSO Login
Go to: http://localhost:5173/sso-login

### 3. Enter a Test Email
Use an email with a domain that has SSO configured:
```
nathank@congocmc.com
```

### 4. Click "Continue"
The page will:
- Detect it's running locally
- Redirect to the mock endpoint: 
  ```
  http://localhost:54321/functions/v1/mock-sso-callback?email=nathank@congocmc.com&RelayState=/dashboard
  ```

### 5. Mock Endpoint Processes
The mock endpoint will:
1. ✅ Validate SSO is configured for `congocmc.com` domain
2. ✅ Check if user `nathank@congocmc.com` exists (creates if not)
3. ✅ Generate access & refresh tokens via Supabase admin API
4. ✅ Show success page with 2-second countdown
5. ✅ Redirect to app with tokens in URL hash

### 6. Auto-Join Triggers Execute
After redirect, the auth trigger automatically:
- ✅ Checks if user's email domain has `allow_all_subdomains` enabled
- ✅ Finds "Admin org" with `allow_all_subdomains: true` for `congocmc.com`
- ✅ Adds user to "Admin org" with role from `default_role`
- ✅ User is logged in and org membership is automatic

### 7. Verify Success
- User is logged in ✅
- Dashboard loads ✅
- User has access to "Admin org" ✅

## Test Scenarios

### Test 1: First-Time SSO User
```
Email: newuser@congocmc.com
Expected: 
  - User created automatically
  - Logged in successfully  
  - Added to "Admin org"
```

### Test 2: Existing SSO User
```
Email: nathank@congocmc.com (if already created)
Expected:
  - User authenticated
  - Logged in successfully
  - Existing org membership preserved
```

### Test 3: Non-SSO Domain
```
Email: test@gmail.com
Expected:
  - SSO detection fails
  - Error: "SSO is not configured for this email domain"
```

### Test 4: Unverified Domain
Modify database to set `verified = false`:
```sql
UPDATE saml_domain_mappings SET verified = false WHERE domain = 'congocmc.com';
```
Expected:
  - Mock returns error
  - Error: "SSO is not configured for domain: congocmc.com"

## Debugging

### Check Mock Endpoint Logs
```bash
docker logs -f supabase_edge_runtime_capgo-app
```

### Check Database State
```bash
# Check SSO configuration
docker exec -it supabase_db_capgo-app psql -U postgres -d postgres -c "
  SELECT d.domain, d.verified, c.enabled, c.provider_id 
  FROM saml_domain_mappings d 
  JOIN org_saml_connections c ON d.connection_id = c.id 
  WHERE d.domain = 'congocmc.com';
"

# Check user was created/authenticated
docker exec -it supabase_db_capgo-app psql -U postgres -d postgres -c "
  SELECT id, email, created_at, raw_user_meta_data->>'sso_provider' as sso_provider
  FROM auth.users 
  WHERE email LIKE '%@congocmc.com';
"

# Check org membership
docker exec -it supabase_db_capgo-app psql -U postgres -d postgres -c "
  SELECT ou.user_id, ou.org_id, ou.user_right, o.name as org_name
  FROM org_users ou
  JOIN orgs o ON o.id = ou.org_id
  WHERE ou.user_id IN (
    SELECT id FROM auth.users WHERE email LIKE '%@congocmc.com'
  );
"
```

### Common Issues

**Issue:** "SSO is not configured for domain"
- **Fix:** Verify domain is in `saml_domain_mappings` with `verified = true`
- **Check:** Connection is `enabled = true` in `org_saml_connections`

**Issue:** User created but not added to org
- **Fix:** Check `allow_all_subdomains = true` in org settings
- **Verify:** Trigger `auto_join_user_to_orgs_on_create` exists and is enabled

**Issue:** Mock endpoint returns 500
- **Fix:** Check Supabase logs for detailed error
- **Verify:** Service role key is configured correctly

## Production vs Mock Comparison

| Aspect | Production (Okta) | Mock (Local) |
|--------|-------------------|--------------|
| SSO detection | ✅ Real DB | ✅ Real DB |
| User authentication | Okta SAML page | Simulated success |
| User creation | Supabase auto | ✅ Same (admin API) |
| Token generation | Supabase | ✅ Same (magic link) |
| Auto-join trigger | ✅ Executed | ✅ Executed |
| Session management | ✅ Real | ✅ Real |
| Redirect with tokens | ✅ Real | ✅ Real |

**What's mocked:** Only the Okta authentication page (user typing password)
**What's real:** Everything else - database, triggers, Supabase auth, session management

## Transitioning to Production

When deploying to production with real Okta:

1. **No frontend code changes needed** - The check for `localhost` will use real SSO
2. **Update Okta configuration** with your production URLs:
   - ACS URL: `https://yourapp.com/auth/v1/sso/saml/acs`
   - Entity ID: Your Supabase project URL
3. **Enable SAML in Supabase Dashboard** (available on Pro plan+)
4. **Test with real Okta credentials**

The mock endpoint can remain in your codebase - it won't be used in production because the hostname check will fail.

## Mock Implementation Details

The mock endpoint (`/functions/v1/mock-sso-callback`) accurately simulates:

1. **SAML Response Validation** - Checks domain mapping and provider status
2. **User Attributes** - Extracts email, firstName, lastName (from email)
3. **Session Creation** - Uses same token generation as production
4. **RelayState Handling** - Preserves redirect URL through the flow
5. **Error Responses** - Same error messages as production
6. **Success Page** - Visual feedback matching production UX

This ensures your local testing experience matches production behavior exactly.
