# Bento Configuration for Email Preferences

This document describes the Bento setup required to support the granular per-user email notification preferences system.

## Overview

The email preferences system uses Bento tags to control which users receive specific email types. When a user disables a preference, a `_disabled` tag is added to their Bento profile. Bento automations should be configured to exclude users with these disabled tags.

## Disabled Tags

The following tags are automatically synced to Bento when users update their email preferences:

| Preference Key | Bento Tag (when disabled) | Description |
|----------------|---------------------------|-------------|
| `usage_limit` | `usage_limit_disabled` | Plan usage threshold alerts (50%, 70%, 90%) |
| `credit_usage` | `credit_usage_disabled` | Credit usage threshold alerts (50%, 75%, 90%, 100%) |
| `onboarding` | `onboarding_disabled` | Onboarding reminder emails |
| `weekly_stats` | `weekly_stats_disabled` | Weekly statistics emails |
| `monthly_stats` | `monthly_stats_disabled` | Monthly creation statistics |
| `deploy_stats_24h` | `deploy_stats_24h_disabled` | 24-hour deploy install statistics |
| `bundle_created` | `bundle_created_disabled` | New bundle upload notifications |
| `bundle_deployed` | `bundle_deployed_disabled` | Bundle deployment notifications |
| `device_error` | `device_error_disabled` | Device update error notifications |

## How It Works

1. **When user DISABLES a preference**: The corresponding `_disabled` tag is ADDED to their Bento profile
2. **When user ENABLES a preference**: The corresponding `_disabled` tag is REMOVED from their Bento profile
3. **Default behavior**: All preferences default to enabled (no disabled tags)

## Bento Automation Configuration

For each email automation in Bento, you need to add a filter to exclude users with the corresponding disabled tag.

### Step-by-Step Setup

For each automation listed below, add a segment filter:

#### 1. Usage Limit Alerts (50%, 70%, 90%)

**Events**: `user:usage_50_percent_of_plan`, `user:usage_70_percent_of_plan`, `user:usage_90_percent_of_plan`, `user:upgrade_to_*`

**Filter to add**:
```
Tag does NOT contain: usage_limit_disabled
```

#### 2. Credit Usage Alerts

**Events**: `org:credits_usage_50_percent`, `org:credits_usage_75_percent`, `org:credits_usage_90_percent`, `org:credits_usage_100_percent`

**Filter to add**:
```
Tag does NOT contain: credit_usage_disabled
```

#### 3. Onboarding Emails

**Events**: `user:need_onboarding`

**Filter to add**:
```
Tag does NOT contain: onboarding_disabled
```

#### 4. Weekly Statistics

**Events**: `user:weekly_stats`

**Filter to add**:
```
Tag does NOT contain: weekly_stats_disabled
```

#### 5. Monthly Statistics

**Events**: `org:monthly_create_stats`

**Filter to add**:
```
Tag does NOT contain: monthly_stats_disabled
```

#### 6. Deploy Install Statistics (24h)

**Events**: `bundle:install_stats_24h`

**Filter to add**:
```
Tag does NOT contain: deploy_stats_24h_disabled
```

#### 7. Bundle Created Notifications

**Events**: `bundle:created`

**Filter to add**:
```
Tag does NOT contain: bundle_created_disabled
```

#### 8. Bundle Deployed Notifications

**Events**: `bundle:deployed`

**Filter to add**:
```
Tag does NOT contain: bundle_deployed_disabled
```

#### 9. Device Error Notifications

**Events**: `user:update_fail`

**Filter to add**:
```
Tag does NOT contain: device_error_disabled
```

## Verification Checklist

After configuring Bento, verify the following:

- [ ] Each automation has the correct exclusion filter for its disabled tag
- [ ] Test by disabling a preference for a test user and confirming they don't receive that email type
- [ ] Test by re-enabling the preference and confirming they DO receive that email type
- [ ] Verify existing users without the `email_preferences` column still receive emails (tags default to not present = enabled)

## Legacy Tags (Still Active)

The following legacy tags continue to work alongside the new granular preferences:

| Tag | Description |
|-----|-------------|
| `notifications_opt_in` | General notifications toggle (from `enable_notifications` column) |
| `newsletter_opt_in` | Newsletter subscription (from `opt_for_newsletters` column) |

## Technical Notes

- Tags are synced via `syncUserPreferenceTags()` in `user_preferences.ts`
- The sync happens whenever a user record is updated
- Tag operations use `addTagBento()` which handles both adding and removing tags
- The backend also checks preferences before sending emails as a fallback (defense in depth)

## Troubleshooting

### User not receiving emails they should receive
1. Check if the user has the `_disabled` tag in Bento
2. Verify the user's `email_preferences` in the database
3. Check the automation filter is set to "does NOT contain" (not "contains")

### User receiving emails they disabled
1. Verify the `_disabled` tag was added to their Bento profile
2. Check the automation has the correct exclusion filter
3. Ensure the filter is using the exact tag name (case-sensitive)

### Tags not syncing
1. Check the `syncUserPreferenceTags` function is being called on user updates
2. Verify Bento API credentials are correct
3. Check for errors in the cloudlog output
