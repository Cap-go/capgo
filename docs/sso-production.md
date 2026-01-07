# SSO Production Deployment Guide

## Prerequisites Checklist

Before deploying SSO to production, ensure all requirements are met:

### ✅ Supabase Pro Plan

- [ ] **Plan Upgrade**: Upgrade from Free to Pro plan
  - Cost: $25/month base + $0.015 per SSO MAU
  - Upgrade at: https://supabase.com/dashboard/project/_/settings/billing
- [ ] **Billing Configured**: Valid payment method on file
- [ ] **Pro Features Enabled**: Verify Pro badge in dashboard

### ✅ Environment Variables

- [ ] **SUPABASE_SERVICE_ROLE_KEY**: Set in production environment
  - Location: Supabase Dashboard → Settings → API → service_role key
  - Must have full database access for SSO operations
  - Store securely (environment variables, secrets manager)

```bash
# Cloudflare Workers (.env or wrangler.toml)
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Supabase Edge Functions (internal/supabase/.env.production)
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

- [ ] **SUPABASE_URL**: Production Supabase project URL
  - Format: `https://YOUR_PROJECT_ID.supabase.co`
- [ ] **SUPABASE_ANON_KEY**: Public anon key for frontend

### ✅ Database Migrations

- [ ] **Migrations Applied**: All SSO migrations deployed to production
  ```bash
  # Apply migrations to production
  supabase db push --linked
  ```

- [ ] **Verify Tables Created**:
  ```sql
  -- Verify SSO tables exist
  SELECT table_name FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name IN ('org_saml_connections', 'saml_domain_mappings', 'sso_audit_logs');
  ```

- [ ] **RLS Policies Active**:
  ```sql
  -- Check RLS is enabled
  SELECT tablename, rowsecurity FROM pg_tables 
  WHERE schemaname = 'public' 
  AND tablename IN ('org_saml_connections', 'saml_domain_mappings', 'sso_audit_logs');
  ```

### ✅ Backend Deployment

- [ ] **SSO Endpoints Deployed**:
  - Cloudflare Workers: `bun deploy:cloudflare:api:prod`
  - Supabase Functions: `bun deploy:supabase:prod`

- [ ] **Verify Endpoints Accessible**:
  ```bash
  # Test SSO status endpoint
  curl -H "apisecret: YOUR_API_SECRET" \
    "https://api.capgo.app/private/sso/status?orgId=TEST_ORG_ID"
  ```

- [ ] **Environment-Specific Config**: Verify production config in `internal/cloudflare/.env.production`

### ✅ Frontend Deployment

- [ ] **SSO UI Deployed**: `src/pages/settings/organization/sso.vue` in production
- [ ] **SSO Detection Active**: `useSSODetection` composable working
- [ ] **Login Flow Updated**: SSO banner appears for configured domains

### ✅ Supabase CLI Access

- [ ] **CLI Installed**: `supabase --version` returns v1.0.0+
- [ ] **Project Linked**: `supabase link --project-ref YOUR_PROJECT_ID`
- [ ] **Auth Configured**: Service role key available for CLI

```bash
# Verify CLI can execute SSO commands
supabase sso list --project-ref YOUR_PROJECT_ID
```

---

## Upgrade Process: Free → Pro Plan

### Step 1: Upgrade Supabase Plan

1. Go to https://supabase.com/dashboard/project/_/settings/billing
2. Click **Upgrade to Pro**
3. Add payment method
4. Confirm upgrade

**Expected Changes:**
- Pro badge appears in dashboard
- SSO menu item appears in Auth settings
- Service role key gains SSO permissions

### Step 2: Verify Pro Features

```bash
# Test SSO CLI access
supabase sso list --project-ref YOUR_PROJECT_ID

# Expected output:
# No SSO providers configured (this is normal initially)
```

If you see "SSO is only available on the Pro plan" error, wait 5 minutes for upgrade to propagate.

### Step 3: Configure Environment

Update production environment variables:

```bash
# Cloudflare Workers
cd internal/cloudflare
cp .env.production.example .env.production
# Edit .env.production with SUPABASE_SERVICE_ROLE_KEY

# Deploy with updated env
cd ../../
bun deploy:cloudflare:api:prod
```

### Step 4: Deploy Database Migrations

```bash
# Link to production project
supabase link --project-ref YOUR_PROJECT_ID

# Push SSO migrations
supabase db push --linked

# Verify migrations applied
supabase migration list --linked
```

---

## Security Configuration

### Service Role Key Management

**⚠️ CRITICAL: Service role key bypasses RLS policies**

1. **Storage**:
   - Use environment variables or secrets manager
   - Never commit to version control
   - Rotate every 90 days

2. **Access Control**:
   - Only accessible to backend services
   - Never expose to frontend
   - Monitor usage in audit logs

3. **Rotation Process**:
   ```bash
   # Generate new service role key in Supabase dashboard
   # Update environment variables
   # Redeploy all services
   # Verify old key no longer works
   # Update documentation with rotation date
   ```

### IdP Certificate Management

1. **Certificate Expiration Monitoring**:
   - Set up alerts 30 days before expiration
   - Test renewal process in staging
   - Update metadata before expiration

2. **Certificate Validation**:
   ```bash
   # Verify certificate not expired
   openssl x509 -in certificate.pem -noout -enddate
   ```

### HTTPS Enforcement

- [ ] All metadata URLs use HTTPS
- [ ] IdP endpoints use valid SSL certificates
- [ ] No mixed content warnings in browser

---

## Monitoring & Alerting

### Health Checks

Create monitoring for these metrics:

```sql
-- Daily SSO authentication count
SELECT 
  DATE(created_at) as date,
  COUNT(*) as sso_logins
FROM sso_audit_logs
WHERE event_type = 'sso_config_viewed'
AND created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Failed SSO attempts (check application logs)
-- Active SSO organizations
SELECT COUNT(DISTINCT org_id) as active_sso_orgs
FROM org_saml_connections
WHERE enabled = true;

-- SSO MAU estimate (for billing)
SELECT COUNT(DISTINCT user_id) as sso_mau
FROM sso_audit_logs
WHERE created_at > NOW() - INTERVAL '30 days';
```

### Alert Thresholds

Set up alerts for:

| Metric | Threshold | Action |
|--------|-----------|--------|
| Failed SSO logins | > 10/hour | Investigate IdP issues |
| Certificate expiration | < 30 days | Renew certificate |
| SSO MAU | > 80% of budget | Review costs, optimize |
| Service role key usage | > 1000/hour | Check for abuse |

### Log Aggregation

Forward SSO audit logs to monitoring service:

```javascript
// Cloudflare Workers logging
export default {
  async fetch(request, env) {
    // ... SSO logic ...
    
    // Send to logging service
    await fetch('https://logs.yourcompany.com/ingest', {
      method: 'POST',
      body: JSON.stringify({
        event: 'sso_audit',
        timestamp: new Date().toISOString(),
        org_id: orgId,
        event_type: eventType,
        ip_address: request.headers.get('cf-connecting-ip'),
        user_agent: request.headers.get('user-agent')
      })
    })
  }
}
```

---

## Cost Management

### Baseline Costs

| Component | Cost | Frequency |
|-----------|------|-----------|
| Supabase Pro Plan | $25 | Monthly |
| SSO MAU (first 100,000) | $0 | Included |
| SSO MAU (additional) | $0.015 | Per user/month |

### Cost Estimation

**Formula**: `$25 + (SSO_MAU * $0.015)`

| SSO Users | Monthly Cost | Annual Cost |
|-----------|--------------|-------------|
| 50 | $25.75 | $309 |
| 100 | $26.50 | $318 |
| 250 | $28.75 | $345 |
| 500 | $32.50 | $390 |
| 1,000 | $40.00 | $480 |
| 5,000 | $100.00 | $1,200 |

### Cost Optimization Strategies

1. **Hybrid Authentication**:
   - Keep password auth enabled
   - Only critical users via SSO
   - Monitor MAU usage weekly

2. **Domain Segmentation**:
   - Enable SSO for premium customers only
   - Regular customers use password auth
   - Tier-based SSO access

3. **Session Management**:
   - Increase session duration to reduce auth frequency
   - Use refresh tokens efficiently
   - Cache authentication state

4. **Monitoring**:
   ```sql
   -- Track SSO vs password usage
   SELECT 
     provider,
     COUNT(*) as login_count
   FROM auth.sessions
   WHERE created_at > NOW() - INTERVAL '30 days'
   GROUP BY provider;
   ```

---

## Disaster Recovery

### Backup Strategy

1. **Database Backups**:
   ```bash
   # Backup SSO configuration
   pg_dump $DATABASE_URL \
     --table=org_saml_connections \
     --table=saml_domain_mappings \
     --table=sso_audit_logs \
     > sso_backup_$(date +%Y%m%d).sql
   ```

2. **Configuration Backup**:
   ```bash
   # Export SSO providers via CLI
   supabase sso list --project-ref YOUR_PROJECT_ID --format json \
     > sso_providers_$(date +%Y%m%d).json
   ```

3. **Backup Schedule**:
   - Daily: Automated database backups (Supabase includes)
   - Weekly: Export SSO configuration to S3/R2
   - Monthly: Full disaster recovery test

### Recovery Procedures

**Scenario 1: SSO Configuration Deleted**

```bash
# Restore from SQL backup
psql $DATABASE_URL < sso_backup_20240101.sql

# Verify restoration
psql $DATABASE_URL -c "SELECT COUNT(*) FROM org_saml_connections;"
```

**Scenario 2: IdP Metadata Changed**

```bash
# Re-add SSO provider via CLI
supabase sso add \
  --project-ref YOUR_PROJECT_ID \
  --metadata-url https://idp.example.com/metadata \
  --domains example.com
```

**Scenario 3: Service Role Key Compromised**

1. Generate new service role key in Supabase dashboard
2. Update all environment variables immediately
3. Redeploy all services (API, plugins, files workers)
4. Monitor audit logs for unauthorized access
5. Revoke old key
6. Force re-authentication for all users

### Testing Recovery

```bash
# Quarterly DR test procedure
1. Export production SSO config
2. Create staging environment
3. Import config to staging
4. Test SSO login flow
5. Verify audit logging
6. Document recovery time
```

---

## Rollback Plan

If SSO causes issues in production:

### Immediate Actions

1. **Disable SSO for Organization**:
   ```sql
   UPDATE org_saml_connections 
   SET enabled = false 
   WHERE org_id = 'AFFECTED_ORG_ID';
   ```

2. **Notify Users**:
   - Send email to organization admins
   - Update status page
   - Provide password reset links

3. **Switch to Password Auth**:
   - Users can use "Sign in with password"
   - Password reset flow available
   - MFA still works

### Complete Rollback

If SSO needs to be completely removed:

```bash
# 1. Backup current state
pg_dump $DATABASE_URL > pre_rollback_backup.sql

# 2. Disable all SSO configurations
psql $DATABASE_URL -c "UPDATE org_saml_connections SET enabled = false;"

# 3. Optionally remove SSO data (CAUTION)
psql $DATABASE_URL <<EOF
DELETE FROM saml_domain_mappings;
DELETE FROM org_saml_connections;
-- Keep audit logs for compliance
EOF

# 4. Remove SSO UI from frontend
git checkout main~1 -- src/pages/settings/organization/sso.vue
git commit -m "Rollback SSO UI"

# 5. Deploy rollback
bun deploy:cloudflare:api:prod
```

---

## Compliance & Legal

### Data Retention

- **Audit Logs**: Retained for 90 days minimum
- **SSO Configuration**: Retained until manually deleted
- **User Authentication Data**: Subject to Supabase retention policy

### GDPR Compliance

- SSO audit logs contain PII (email, IP address)
- Users can request data deletion
- Implement data export for GDPR requests:

```sql
-- Export user's SSO audit history
SELECT * FROM sso_audit_logs 
WHERE user_id = 'USER_ID' 
OR email = 'user@example.com';
```

### SOC 2 / ISO 27001

SSO audit logging supports compliance with:
- Access control monitoring
- Authentication event tracking
- Change management (config updates)
- Security incident investigation

### Data Processing Agreement

Ensure DPA with Supabase covers:
- SSO authentication data
- SAML assertions processing
- Audit log storage
- Geographic data residency

---

## Production Checklist

### Pre-Launch

- [ ] Supabase Pro plan active
- [ ] SUPABASE_SERVICE_ROLE_KEY configured
- [ ] All migrations applied to production
- [ ] SSO endpoints deployed and tested
- [ ] Frontend SSO UI deployed
- [ ] IdP test accounts created
- [ ] End-to-end SSO flow tested
- [ ] Audit logging verified
- [ ] Monitoring dashboards created
- [ ] Alert thresholds configured

### Launch Day

- [ ] Enable SSO for pilot organization
- [ ] Monitor audit logs for first logins
- [ ] Verify auto-enrollment working
- [ ] Check SSO MAU count
- [ ] Collect user feedback
- [ ] Document any issues

### Post-Launch

- [ ] Roll out to additional organizations
- [ ] Monitor costs weekly
- [ ] Review audit logs for anomalies
- [ ] Optimize based on feedback
- [ ] Update documentation with learnings
- [ ] Schedule quarterly DR test

---

## Support Escalation

### L1 Support (First Response)

Common issues users can resolve:
- Clear browser cache
- Try different browser
- Verify email domain
- Use "Sign in with password" fallback

### L2 Support (Technical)

Requires access to audit logs:
- Check `sso_audit_logs` for error details
- Verify IdP metadata still valid
- Test SSO connection manually
- Review RLS policy violations

### L3 Support (Engineering)

Requires database access:
- Fix RLS policy issues
- Update SSO configuration directly
- Rotate compromised keys
- Deploy hotfixes

### Contact Points

| Level | Contact | SLA |
|-------|---------|-----|
| L1 | support@capgo.app | 24h |
| L2 | tech@capgo.app | 8h |
| L3 | eng@capgo.app | 4h critical |

---

## Summary

### Key Production Requirements

1. ✅ **Supabase Pro Plan** ($25/month + SSO MAU)
2. ✅ **SUPABASE_SERVICE_ROLE_KEY** in all environments
3. ✅ **Migrations Deployed** to production database
4. ✅ **Monitoring Configured** for health checks
5. ✅ **Backup Strategy** implemented
6. ✅ **Rollback Plan** documented and tested

### Success Metrics

- **Uptime**: 99.9% SSO availability
- **Latency**: < 2s SSO authentication flow
- **Error Rate**: < 0.1% failed SSO attempts
- **User Satisfaction**: > 90% positive feedback

### Next Steps After Deployment

1. Monitor first 24 hours closely
2. Collect feedback from early adopters
3. Iterate on UX based on feedback
4. Document edge cases encountered
5. Train support team on SSO troubleshooting
6. Plan rollout to remaining organizations

For detailed setup instructions, see [SSO Setup Guide](./sso-setup.md).
