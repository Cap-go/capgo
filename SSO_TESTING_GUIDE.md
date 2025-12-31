# SSO SAML Testing Guide - Real Production Flow

## ✅ Prerequisites Checklist

Before testing, ensure:

- [ ] **Docker is running** - Required for local Supabase database
- [ ] **Okta Developer account configured** - SAML app created with metadata URL ready
- [ ] **Development Supabase has Pro plan** - Contact your boss to confirm
- [ ] **Super admin permissions** - Required to configure SSO

---

## 🚀 Quick Start: Test Real SAML Today

### Step 1: Start Local Database

```bash
# Make sure Docker is running
open -a Docker

# Start local Supabase (for database only)
cd /Users/jonthankabuya/work/capgo/project/capgo-new/capgo
supabase start

# Reset database with SSO tables
supabase db reset
```

**What this does:**
- ✅ Starts local PostgreSQL with SSO tables
- ✅ Seeds test data
- ❌ Does NOT provide SAML SSO (uses development Supabase for that)

### Step 2: Configure Okta for Development Environment

In your Okta SAML app, use these URLs:

```
Single sign-on URL (ACS):
https://aucsybvnhavogdmzwtcw.supabase.co/auth/v1/sso/saml/acs

Audience URI (Entity ID):
https://aucsybvnhavogdmzwtcw.supabase.co/auth/v1/sso/saml/metadata

Name ID format: EmailAddress
Application username: Email
```

**Attribute Statements:**
| Name | Name Format | Value |
|------|-------------|-------|
| `email` | Unspecified | `user.email` |
| `first_name` | Unspecified | `user.firstName` |
| `last_name` | Unspecified | `user.lastName` |

**Copy your Okta Metadata URL** - You'll need this in the wizard.

### Step 3: Start Frontend with Development Environment

```bash
# This connects to development Supabase (with real SAML support)
bun serve:dev

# App runs at: http://localhost:5173
# Supabase URL: https://aucsybvnhavogdmzwtcw.supabase.co
```

### Step 4: Configure SSO Using Your Wizard

1. **Login as super admin**:
   - Go to http://localhost:5173
   - Login with admin account

2. **Navigate to SSO Configuration**:
   - Click **Settings** → **Organization** → **SSO**
   - Or go directly: http://localhost:5173/settings/organization/sso

3. **Follow the Wizard**:

   **Step 1: Capgo SAML Metadata** (Display only)
   - Entity ID: `https://aucsybvnhavogdmzwtcw.supabase.co/auth/v1/sso/saml/metadata`
   - ACS URL: `https://aucsybvnhavogdmzwtcw.supabase.co/auth/v1/sso/saml/acs`
   - ✅ Click "Next"

   **Step 2: IdP Metadata** (Input)
   - Select "Metadata URL" tab
   - Paste your Okta Metadata URL
   - Example: `https://dev-12345.okta.com/app/abc123/sso/saml/metadata`
   - ✅ Click "Next"

   **Step 3: Configure Domains** (Input)
   - Enter your email domain (e.g., `yourcompany.com`)
   - This domain will use SSO for login
   - ✅ Click "Next"

   **Step 4: Test & Enable** (Test)
   - Click "Test Connection"
   - You'll be redirected to Okta
   - Login with your Okta test user
   - You'll be redirected back
   - ✅ If successful, toggle "Enable SSO"

### Step 5: Test Real SAML Login Flow

```bash
# Open SSO login page
# http://localhost:5173/sso-login
```

1. **Enter your test email**: `testuser@yourcompany.com`
2. **Click "Continue"**
3. **You'll be redirected to REAL Okta** 🎉
4. **Login at Okta**
5. **Okta redirects back to Capgo**
6. **You're logged in!** ✅

---

## 🔍 How It Works (Technical Flow)

### Environment Detection Logic

```typescript
// src/composables/useSSODetection.ts

// OLD (Wrong - used hostname):
const isLocalDev = window.location.hostname === 'localhost'
if (isLocalDev) { use mock } // ❌ Always true on localhost

// NEW (Correct - uses Supabase URL):
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const isLocalSupabase = supabaseUrl.includes('localhost')
if (isLocalSupabase) { use mock } // ✅ Only true when Supabase is local
```

### When Mock SSO is Used vs Real SAML

| Command | Supabase URL | SAML Mode |
|---------|-------------|-----------|
| `bun serve:local` | `http://localhost:54321` | ❌ Mock (no SAML) |
| `bun serve:dev` | `https://aucsybvnhavogdmzwtcw.supabase.co` | ✅ **Real SAML** |
| `bun serve:preprod` | `https://xvwzpoazmxkqosrdewyv.supabase.co` | ✅ **Real SAML** |
| Production | `https://xvwzpoazmxkqosrdewyv.supabase.co` | ✅ **Real SAML** |

### Full SAML Authentication Flow

```
User enters email → Frontend checks SSO via database
         ↓
SSO available? → Yes → Click "Continue with SSO"
         ↓
Frontend calls: supabase.auth.signInWithSSO({
  provider: 'saml',
  options: { providerId: 'okta-provider-id' }
})
         ↓
Supabase returns SSO URL → Redirect to Okta
         ↓
User authenticates at Okta
         ↓
Okta generates SAML assertion
         ↓
Okta POSTs to: https://[PROJECT].supabase.co/auth/v1/sso/saml/acs
         ↓
Supabase validates SAML assertion
         ↓
Supabase creates session tokens
         ↓
Supabase redirects to: http://localhost:5173/#access_token=...
         ↓
Frontend extracts tokens → User is logged in ✅
         ↓
Auth triggers execute → User auto-joins organization
```

---

## 🧪 Testing Checklist (Following PR_CHECKLIST.md)

### Before Creating PR:

```bash
# 1. Code Quality
bun lint:fix                    # ✅ Fix linting
bun lint                        # ✅ Verify no errors
bun typecheck                   # ✅ Type checking

# 2. Testing
bun test:backend                # ✅ Backend tests pass
bun test:front                  # ✅ Frontend E2E tests pass

# 3. Manual Testing
bun serve:dev                   # ✅ Test with development environment

# Test these scenarios:
# - Configure SSO via wizard ✅
# - Test SSO connection ✅
# - Login with SSO email ✅
# - Verify Okta redirect ✅
# - Verify return to app ✅
# - Verify user auto-joins org ✅
# - Verify permissions ✅
# - Try non-SSO domain (should use password) ✅
# - Disable SSO and verify fallback ✅

# 4. Git Workflow
git fetch origin                # ✅ Get latest
git rebase origin/main          # ✅ Stay up to date
git status                      # ✅ Check changes

# 5. Check PR Diff
# - Go to GitHub PR
# - Check "Files changed" tab
# - ❌ Look for unwanted deletions
# - ✅ Verify only SSO files changed

# 6. No Unwanted Changes
# ✅ No CHANGELOG.md changes
# ✅ No package.json version changes
# ✅ No committed migrations edited
# ✅ No console.log statements left
# ✅ No TODO comments added
```

### PR Description Requirements:

```markdown
## Summary
Implemented SAML SSO authentication with Okta for enterprise organizations.

## Problem
Organizations need SSO for secure, centralized authentication and auto-enrollment.

## Solution
- Step-by-step SSO configuration wizard
- Okta SAML 2.0 integration via Supabase Auth
- Domain-based SSO detection
- Auto-enrollment on successful authentication
- Audit logging for SSO events

## Test Plan
### Environment Setup
1. Started local Supabase: `supabase start && supabase db reset`
2. Configured Okta SAML app with development Supabase ACS URL
3. Ran frontend with: `bun serve:dev`

### Manual Testing Steps
1. ✅ Configured SSO via wizard at `/settings/organization/sso`
   - Added Okta metadata URL
   - Configured domain: `yourcompany.com`
   - Tested connection successfully
   - Enabled SSO

2. ✅ Tested SSO login flow at `/sso-login`
   - Entered email: `testuser@yourcompany.com`
   - Redirected to Okta login page
   - Authenticated with Okta credentials
   - Redirected back to Capgo dashboard
   - User successfully logged in

3. ✅ Verified auto-enrollment
   - New SSO user automatically joined organization
   - Received correct default permissions
   - Audit log created

4. ✅ Tested edge cases
   - Non-SSO domain uses password auth
   - Disabled SSO falls back to password
   - Invalid metadata shows error
   - Public domains (gmail.com) skip SSO check

### Automated Tests
- ✅ `bun test:backend` - All backend tests pass
- ✅ `bun test:front` - All E2E tests pass
- ✅ `bun lint` - No linting errors

## Screenshots
[Include screenshots of]:
- SSO wizard configuration steps
- Okta login page redirect
- Successful authentication
- Dashboard after SSO login

## Files Changed
- `src/composables/useSSODetection.ts` - Fixed environment detection logic
- `src/pages/settings/organization/sso.vue` - SSO configuration wizard UI
- `src/pages/sso-login.vue` - SSO login page
- [Other relevant files]

## Technical Implementation
- Uses Supabase `signInWithSSO()` method with SAML provider
- Auto-detects SSO availability via database RPC
- Properly differentiates local vs hosted Supabase for mock/real flow
- Implements proper error handling and user feedback
```

---

## 🚫 Common Issues & Solutions

### Issue: "SSO not working - still using mock"

**Cause**: Using `bun serve:local` instead of `bun serve:dev`

**Solution**:
```bash
# Use development environment
bun serve:dev

# Verify Supabase URL in browser console
console.log(import.meta.env.VITE_SUPABASE_URL)
# Should be: https://aucsybvnhavogdmzwtcw.supabase.co
# NOT: http://localhost:54321
```

### Issue: "Supabase start fails - Docker not running"

**Solution**:
```bash
# Start Docker Desktop
open -a Docker

# Wait for Docker to start, then try again
supabase start
```

### Issue: "SAML provider not found"

**Cause**: Development Supabase doesn't have Pro plan or SSO not configured

**Solution**:
1. Ask your boss to verify development Supabase has Pro plan
2. Ensure SSO configuration was saved successfully
3. Check database directly:
```sql
SELECT * FROM org_saml_connections WHERE org_id = 'YOUR_ORG_ID';
SELECT * FROM saml_domain_mappings WHERE domain = 'yourcompany.com';
```

### Issue: "Test connection fails"

**Possible causes**:
- Okta metadata URL is incorrect
- Okta app not assigned to test user
- Supabase ACS URL mismatch in Okta config

**Solution**:
1. Verify Okta metadata URL is accessible
2. Check user is assigned in Okta app
3. Verify Okta ACS URL matches: `https://aucsybvnhavogdmzwtcw.supabase.co/auth/v1/sso/saml/acs`

---

## 📊 Verification Commands

```bash
# Check Supabase is running
supabase status

# Check database has SSO tables
supabase db diff

# Check frontend environment
bun serve:dev
# Open browser console and run:
console.log(import.meta.env.VITE_SUPABASE_URL)

# Expected output for development:
# https://aucsybvnhavogdmzwtcw.supabase.co
```

---

## 🎯 Ready to Test Checklist

Before you start testing, verify:

- [ ] Docker is running (`docker ps` works)
- [ ] Supabase is running (`supabase status` shows services)
- [ ] Database is reset (`supabase db reset` completed)
- [ ] Frontend is using development env (`bun serve:dev`)
- [ ] Browser shows development Supabase URL in network tab
- [ ] Okta SAML app is configured with development ACS URL
- [ ] You have Okta metadata URL ready
- [ ] You have super admin account credentials
- [ ] Test user exists in Okta with email matching your domain

✅ **All green? You're ready to test REAL SAML SSO!**

---

## 💡 Pro Tips

1. **Keep browser console open** - Watch for SSO detection logs
2. **Use Incognito mode** - Avoid cached auth states
3. **Test multiple scenarios** - New users, existing users, disabled SSO
4. **Document everything** - Screenshots for PR description
5. **Ask for help early** - If development Supabase doesn't have Pro, your boss needs to enable it

---

**Last updated**: 31 December 2025
**Environment**: Development (`aucsybvnhavogdmzwtcw.supabase.co`)
**SAML Provider**: Okta
**Testing Mode**: Real Production SAML Flow ✅
