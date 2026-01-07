# SSO Setup Guide

## Overview

Capgo supports SAML 2.0 Single Sign-On (SSO) for enterprise organizations. This guide covers configuring SSO with popular Identity Providers (IdPs) including Okta, Azure AD, and Google Workspace.

## Prerequisites

- **Supabase Pro Plan**: SSO requires a Supabase Pro subscription ($25/month + $0.015 per SSO MAU)
- **Super Admin Access**: Only users with `super_admin` role can configure SSO
- **Verified Email Domain**: Domain must be owned by your organization

## Quick Start

1. Navigate to **Settings** → **Organization** → **SSO**
2. Copy the **Capgo SAML metadata** (Entity ID and ACS URL)
3. Configure your IdP using the metadata
4. Enter your IdP's metadata URL or XML in Capgo
5. Add email domains for auto-enrollment
6. Test the connection
7. Enable SSO for your organization

---

## Identity Provider Guides

### Okta

#### 1. Create SAML Application

1. In Okta Admin Console, go to **Applications** → **Applications**
2. Click **Create App Integration**
3. Select **SAML 2.0** and click **Next**
4. Enter application name (e.g., "Capgo")

#### 2. Configure SAML Settings

**General Settings:**
- **Single sign-on URL**: Use ACS URL from Capgo SSO page
  - Example: `https://YOUR_PROJECT_ID.supabase.co/auth/v1/sso/saml/acs`
- **Audience URI (SP Entity ID)**: Use Entity ID from Capgo SSO page
  - Example: `https://YOUR_PROJECT_ID.supabase.co/auth/v1/sso/saml/metadata`
- **Name ID format**: `EmailAddress`
- **Application username**: `Email`

**Attribute Statements:**
| Name | Name Format | Value |
|------|-------------|-------|
| `email` | Unspecified | `user.email` |
| `first_name` | Unspecified | `user.firstName` |
| `last_name` | Unspecified | `user.lastName` |

#### 3. Get Metadata

1. After saving, go to **Sign On** tab
2. Copy the **Metadata URL** (or download XML)
3. Paste into Capgo SSO configuration step 2

#### 4. Assign Users

1. Go to **Assignments** tab
2. Click **Assign** → **Assign to People** or **Assign to Groups**
3. Add users who should access Capgo

#### 5. Complete Setup

1. In Capgo, add your email domains (e.g., `yourcompany.com`)
2. Click **Test Connection**
3. If successful, enable SSO

---

### Azure AD (Microsoft Entra ID)

#### 1. Create Enterprise Application

1. In Azure Portal, go to **Microsoft Entra ID** → **Enterprise applications**
2. Click **New application**
3. Click **Create your own application**
4. Name it "Capgo" and select **Integrate any other application (Non-gallery)**

#### 2. Configure SSO

1. In the application, go to **Single sign-on**
2. Select **SAML**
3. Click **Edit** on **Basic SAML Configuration**

**Configuration:**
- **Identifier (Entity ID)**: Use Entity ID from Capgo
  - Example: `https://YOUR_PROJECT_ID.supabase.co/auth/v1/sso/saml/metadata`
- **Reply URL (Assertion Consumer Service URL)**: Use ACS URL from Capgo
  - Example: `https://YOUR_PROJECT_ID.supabase.co/auth/v1/sso/saml/acs`
- **Sign on URL**: `https://capgo.app/login`

#### 3. Configure Attributes & Claims

Default claims should work, but verify:
| Claim Name | Value |
|------------|-------|
| `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress` | `user.mail` |
| `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname` | `user.givenname` |
| `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname` | `user.surname` |

#### 4. Get Metadata

1. In **SAML Certificates** section, copy **App Federation Metadata URL**
2. Paste into Capgo SSO configuration step 2

#### 5. Assign Users

1. Go to **Users and groups**
2. Click **Add user/group**
3. Select users who should access Capgo

#### 6. Complete Setup

1. In Capgo, add your email domains (e.g., `yourcompany.com`)
2. Click **Test Connection**
3. If successful, enable SSO

---

### Google Workspace

#### 1. Create Custom SAML App

1. In Google Admin Console, go to **Apps** → **Web and mobile apps**
2. Click **Add app** → **Add custom SAML app**
3. Enter app name (e.g., "Capgo")

#### 2. Download Google IdP Information

1. Copy or download the **SSO URL** and **Certificate**
2. Download the **Metadata file** (XML)
3. Click **Continue**

#### 3. Configure Service Provider Details

**Configuration:**
- **ACS URL**: Use ACS URL from Capgo SSO page
  - Example: `https://YOUR_PROJECT_ID.supabase.co/auth/v1/sso/saml/acs`
- **Entity ID**: Use Entity ID from Capgo SSO page
  - Example: `https://YOUR_PROJECT_ID.supabase.co/auth/v1/sso/saml/metadata`
- **Name ID format**: `EMAIL`
- **Name ID**: `Basic Information > Primary email`

#### 4. Configure Attribute Mapping

| Google Directory attribute | App attribute |
|----------------------------|---------------|
| Primary email | `email` |
| First name | `first_name` |
| Last name | `last_name` |

#### 5. Upload Metadata to Capgo

1. Use the metadata XML file downloaded in step 2
2. In Capgo SSO configuration, select **Metadata XML** tab
3. Paste the XML content

#### 6. Turn on the App

1. In Google Admin, go to **User access**
2. Select **ON for everyone** or specific organizational units
3. Click **Save**

#### 7. Complete Setup

1. In Capgo, add your Google Workspace domains
2. Click **Test Connection**
3. If successful, enable SSO

---

## Domain Management

### Adding Domains

1. In SSO configuration step 3, enter email domains
2. Domains should be in format: `yourcompany.com` (no `@` prefix)
3. Multiple domains can be added for multi-domain organizations
4. Domains are automatically verified through SSO authentication

### Domain Priority

When multiple domains are configured:
- SSO providers take priority over email domain auto-join
- If a domain has SSO, users must use SSO to join
- Users authenticating via SSO are automatically enrolled with `read` permission

### Removing Domains

1. Click the **X** next to a domain to remove it
2. Removing a domain does NOT remove existing users
3. New users from that domain will no longer auto-enroll

---

## Testing SSO

### Before Enabling

1. Click **Test Connection** in step 4
2. This opens your IdP login in a new window
3. Authenticate with a test user
4. Verify successful authentication
5. Check that user attributes are correctly mapped

### Common Test Issues

**Issue**: "Invalid SSO provider"
- **Cause**: Metadata URL is incorrect or unreachable
- **Fix**: Verify metadata URL is publicly accessible

**Issue**: "Audience validation failed"
- **Cause**: Entity ID mismatch between Capgo and IdP
- **Fix**: Ensure Entity ID matches exactly in both systems

**Issue**: "ACS URL mismatch"
- **Cause**: Reply URL in IdP doesn't match ACS URL
- **Fix**: Update IdP configuration with correct ACS URL

---

## Security Best Practices

### Metadata Security

- **Use HTTPS**: Always use HTTPS metadata URLs
- **Verify Certificates**: Ensure IdP certificates are valid
- **Rotate Regularly**: Update IdP certificates before expiration

### SSRF Protection

Capgo blocks metadata URLs pointing to:
- `localhost`, `127.0.0.1`
- Private IP ranges (`10.x`, `172.16-31.x`, `192.168.x`)
- AWS metadata endpoint (`169.254.169.254`)
- Internal infrastructure endpoints

### XML Security

Capgo rejects metadata XML containing:
- `<!DOCTYPE` declarations (prevents XXE attacks)
- `<!ENTITY` declarations (prevents entity expansion)
- Excessive file sizes (prevents DoS)

### Access Control

- Only `super_admin` users can configure SSO
- SSO configuration changes are audit logged
- IP addresses and user agents are tracked
- All actions include event metadata

---

## User Experience

### Login Flow

1. User enters email on Capgo login page
2. If email domain has SSO, blue banner appears: **"SSO available for your organization"**
3. User clicks **"Continue with SSO"**
4. User is redirected to IdP for authentication
5. After successful authentication, user is returned to Capgo
6. User is automatically enrolled in organization with `read` permission

### Fallback Authentication

- Password authentication remains available
- Users can still use **"Sign in with password"** option
- MFA and password recovery work independently of SSO

### First-Time Users

- New users signing up with SSO email are auto-enrolled
- Existing users logging in with SSO for the first time are auto-enrolled
- Auto-enrollment grants `read` permission by default
- Admins can upgrade permissions after enrollment

---

## Troubleshooting

### "SSO not detected for my email domain"

**Possible Causes:**
1. Domain not added to SSO configuration
2. SSO not enabled
3. Email domain is public (Gmail, Yahoo, Outlook)
4. Browser cache issues

**Solutions:**
1. Verify domain in SSO settings
2. Ensure SSO is enabled (green status banner)
3. Public domains are not supported for SSO
4. Clear browser cache and try again

### "Invalid SAML response"

**Possible Causes:**
1. Clock skew between IdP and Supabase
2. Expired SAML assertion
3. Invalid signature

**Solutions:**
1. Ensure IdP and Supabase clocks are synchronized
2. Check IdP assertion validity period
3. Verify certificate matches metadata

### "User not found after SSO login"

**Possible Causes:**
1. Email attribute not mapped correctly
2. User email doesn't match domain
3. Auto-enrollment failed

**Solutions:**
1. Check attribute mapping in IdP
2. Verify user email matches configured domain
3. Check audit logs for enrollment errors

### "Permission denied accessing SSO page"

**Possible Causes:**
1. User is not `super_admin`
2. User is not member of organization

**Solutions:**
1. Request `super_admin` permission from organization owner
2. Ensure user is added to organization

---

## Monitoring & Audit Logs

### Audit Events

All SSO operations are logged in `sso_audit_logs` table:

| Event Type | Description |
|------------|-------------|
| `sso_config_created` | SSO configuration created |
| `sso_config_updated` | Metadata or settings updated |
| `sso_config_enabled` | SSO enabled for organization |
| `sso_config_disabled` | SSO disabled for organization |
| `sso_config_deleted` | SSO configuration removed |
| `sso_domains_updated` | Email domains modified |
| `sso_config_viewed` | SSO settings page viewed |
| `sso_test_initiated` | Test connection clicked |

### Audit Log Fields

- **Timestamp**: When event occurred
- **User ID**: Who performed action
- **Email**: User's email address
- **IP Address**: Source IP (from `cf-connecting-ip`, `x-forwarded-for`)
- **User Agent**: Browser/client information
- **Metadata**: Event-specific details (domains, provider ID, etc.)

### Accessing Logs

```sql
-- View recent SSO events for organization
SELECT 
  event_type,
  email,
  ip_address,
  metadata,
  created_at
FROM sso_audit_logs
WHERE org_id = 'YOUR_ORG_ID'
ORDER BY created_at DESC
LIMIT 50;
```

---

## Cost Estimation

### Supabase Pro Plan

- **Base Cost**: $25/month
- **SSO MAU Cost**: $0.015 per Monthly Active User using SSO
- **Included**: 100,000 MAU (covers ~6,667 SSO users)

### Example Costs

| SSO Users | Monthly Cost |
|-----------|--------------|
| 10 | $25.15 |
| 50 | $25.75 |
| 100 | $26.50 |
| 500 | $32.50 |
| 1,000 | $40.00 |

### Cost Optimization

- SSO MAU only counts users who authenticate via SSO
- Password-based logins don't count toward SSO MAU
- Inactive users (not logging in) don't incur SSO charges

---

## API Reference

### Configure SSO

```http
POST /private/sso/configure
Authorization: Bearer SUPER_ADMIN_API_KEY
Content-Type: application/json

{
  "orgId": "org_uuid",
  "metadataUrl": "https://idp.example.com/metadata",
  "domains": ["example.com", "example.net"]
}
```

### Update SSO

```http
PUT /private/sso/update
Authorization: Bearer SUPER_ADMIN_API_KEY
Content-Type: application/json

{
  "orgId": "org_uuid",
  "enabled": true,
  "domains": ["example.com"]
}
```

### Get SSO Status

```http
GET /private/sso/status?orgId=org_uuid
Authorization: Bearer API_KEY
```

### Remove SSO

```http
DELETE /private/sso/remove
Authorization: Bearer SUPER_ADMIN_API_KEY
Content-Type: application/json

{
  "orgId": "org_uuid",
  "providerId": "provider_uuid"
}
```

---

## Production Deployment

### Environment Variables

Ensure these are set in production:

```bash
# Supabase Pro Plan Required
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Optional: Custom SSO URLs
SUPABASE_SSO_ENTITY_ID=https://your-project.supabase.co/auth/v1/sso/saml/metadata
SUPABASE_SSO_ACS_URL=https://your-project.supabase.co/auth/v1/sso/saml/acs
```

### Health Checks

Monitor these endpoints:

```bash
# Check SSO status for organization
curl -H "Authorization: Bearer API_KEY" \
  https://api.capgo.app/private/sso/status?orgId=ORG_ID

# Verify audit logging
psql $DATABASE_URL -c "SELECT COUNT(*) FROM sso_audit_logs WHERE created_at > NOW() - INTERVAL '1 day';"
```

### Backup & Recovery

1. **Backup SSO Configuration:**
   ```sql
   -- Export SSO connections
   COPY (
     SELECT * FROM org_saml_connections
   ) TO '/tmp/sso_connections_backup.csv' CSV HEADER;
   
   -- Export domain mappings
   COPY (
     SELECT * FROM saml_domain_mappings
   ) TO '/tmp/sso_domains_backup.csv' CSV HEADER;
   ```

2. **Restore from Backup:**
   ```sql
   -- Restore SSO connections
   COPY org_saml_connections FROM '/tmp/sso_connections_backup.csv' CSV HEADER;
   
   -- Restore domain mappings
   COPY saml_domain_mappings FROM '/tmp/sso_domains_backup.csv' CSV HEADER;
   ```

---

## Support

### Documentation

- [Supabase SSO Documentation](https://supabase.com/docs/guides/auth/enterprise-sso/auth-sso-saml)
- [SAML 2.0 Specification](https://docs.oasis-open.org/security/saml/Post2.0/sstc-saml-tech-overview-2.0.html)

### Common Resources

- **Capgo Dashboard**: https://capgo.app
- **Support Email**: support@capgo.app
- **Status Page**: https://status.capgo.app

### Getting Help

For SSO-specific issues:
1. Check audit logs for error details
2. Verify IdP configuration matches Capgo metadata
3. Test with a new user account
4. Contact support with:
   - Organization ID
   - IdP provider (Okta, Azure AD, etc.)
   - Error messages from audit logs
   - Screenshot of IdP configuration
