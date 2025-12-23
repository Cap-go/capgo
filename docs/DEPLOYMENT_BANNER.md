# Deployment Banner Feature

## Overview

The Deployment Banner is an intelligent UI component that automatically detects when a new bundle is available and ready to deploy to your production channel. It provides a one-click deployment experience with visual feedback and celebration animations.

**Key Features:**
- 🎯 **Smart Detection**: Automatically detects when new bundles are ready
- 🔒 **Admin-Only**: Only visible to users with admin or super_admin permissions
- ⚡ **One-Click Deploy**: Deploy to production with a single click
- 🎉 **Visual Feedback**: Confetti celebration on successful deployment
- 🔄 **Auto-Refresh**: Automatically updates after deployment
- 🌍 **Internationalized**: Full i18n support for multiple languages

## Security & Permissions

### Admin-Only Visibility

The banner is **only visible to organization admins and super_admins**. This ensures that:
- Only authorized personnel can deploy to production
- Regular users and read-only members don't see deployment controls
- Deployment decisions are made by qualified team members

### Permission Check Implementation

```typescript
// Component checks user's role for the app
const userRole = ref<string | null>(null)
const hasAdminPermission = computed(() => {
  return userRole.value 
    ? organizationStore.hasPermissionsInRole(userRole.value, ['admin', 'super_admin']) 
    : false
})

// Banner only shows if user has admin permissions
const showBanner = computed(() => {
  if (loading.value || !latestBundle.value || !productionChannel.value || !hasAdminPermission.value)
    return false
  
  // Show if latest bundle is not the production bundle
  return latestBundle.value.id !== productionChannel.value.version
})
```

### Permission Levels

| Permission Level | Can See Banner | Can Deploy |
|-----------------|----------------|------------|
| read            | ❌ No          | ❌ No      |
| write           | ❌ No          | ❌ No      |
| admin           | ✅ Yes         | ✅ Yes     |
| super_admin     | ✅ Yes         | ✅ Yes     |
| owner           | ✅ Yes         | ✅ Yes     |

## How It Works

### Automatic Detection

The banner appears when all of the following conditions are met:

1. **User has Admin Permissions**: User must have 'admin' or 'super_admin' role for the app
2. **Production Channel Exists**: Your app must have a channel named "production"
3. **Newer Bundle Available**: A newer bundle exists that isn't currently deployed to production
4. **Valid Bundle**: The latest bundle is not "unknown" or "builtin"

The banner continuously monitors these conditions and automatically shows/hides based on the current state.

### User Experience

When the banner appears:

1. **Visual Notification**: A prominent blue banner displays at the top of the app overview page with the message "A new bundle is available and ready to deploy to production"
2. **One-Click Action**: Users click the "Deploy Now" button
3. **Confirmation Dialog**: A safety dialog confirms the deployment with bundle details
4. **Deployment**: Upon confirmation, the banner deploys the latest bundle to production
5. **Celebration**: A confetti animation celebrates the successful deployment
6. **Auto-Refresh**: The page data refreshes to reflect the new deployment

## Technical Details

### Component Architecture

```
DeploymentBanner.vue
│
├── Props
│   └── appId: string (required) - The app identifier
│
├── State Management
│   ├── loading: boolean - Initial data loading state
│   ├── deploying: boolean - Deployment in progress
│   ├── userRole: string | null - User's permission level
│   ├── latestBundle: Bundle | null - Most recent bundle
│   └── productionChannel: Channel | null - Production channel config
│
├── Computed Properties
│   ├── hasAdminPermission - Checks if user has admin/super_admin role
│   └── showBanner - Determines if banner should be visible
│
├── Methods
│   ├── loadData() - Fetches channels, bundles, and user permissions
│   ├── handleDeploy() - Shows confirmation dialog
│   ├── executeDeployment() - Performs the deployment
│   └── showCelebration() - Displays confetti animation
│
└── Events
    └── @deployed - Emitted after successful deployment
```

### Component Location

- **File**: `src/components/dashboard/DeploymentBanner.vue`
- **Usage**: Integrated into `src/pages/app/[package].vue`
- **Dependencies**: 
  - `useOrganizationStore` - Permission checking
  - `useDialogV2Store` - Confirmation dialog
  - `useSupabase` - Database operations
  - `canvas-confetti` - Celebration animation

### Key Features

#### Smart Detection Logic

```typescript
const showBanner = computed(() => {
  if (loading.value || !latestBundle.value || !productionChannel.value)
    return false

  // Show banner if latest bundle is not the production bundle
  return latestBundle.value.id !== productionChannel.value.version
})
```

#### Deployment Process

1. Fetches the production channel (`name = 'production'`)
2. Fetches the latest non-deleted bundle (excluding 'unknown' and 'builtin')
3. Compares the latest bundle ID with the production channel's current version
4. Updates the channel's version field to deploy the new bundle

#### Celebration Animation

On successful deployment, the component creates a confetti effect with:
- 50 confetti particles
- Capgo brand colors (`#119eff`, `#515271`, etc.)
- 3-second animation with physics-based movement
- Automatic cleanup after animation completes

### Database Interactions

The banner interacts with two main tables:

1. **channels**: Reads production channel configuration and updates version on deployment
2. **app_versions**: Reads latest bundle information

```sql
-- Get production channel
SELECT * FROM channels 
WHERE app_id = :app_id 
  AND name = 'production'

-- Get latest bundle
SELECT * FROM app_versions 
WHERE app_id = :app_id 
  AND deleted = false 
  AND name != 'unknown' 
  AND name != 'builtin'
ORDER BY created_at DESC 
LIMIT 1

-- Deploy to production
UPDATE channels 
SET version = :new_version_id 
WHERE id = :channel_id 
  AND app_id = :app_id
```

### Events

The component emits a `deployed` event when deployment succeeds:

```vue
<DeploymentBanner :app-id="id" @deployed="refreshData" />
```

This allows parent components to refresh their data after deployment.

## Usage

### Basic Integration

```vue
<script setup lang="ts">
import DeploymentBanner from '~/components/dashboard/DeploymentBanner.vue'

const appId = ref('com.example.app')

function handleDeployment() {
  // Refresh your data
  console.log('Deployment completed!')
}
</script>

<template>
  <DeploymentBanner 
    :app-id="appId" 
    @deployed="handleDeployment" 
  />
</template>
```

### With Manual Refresh

The component exposes a `refresh` method to manually reload data:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import DeploymentBanner from '~/components/dashboard/DeploymentBanner.vue'

const banner = ref()

function manualRefresh() {
  banner.value?.refresh()
}
</script>

<template>
  <DeploymentBanner ref="banner" :app-id="appId" />
  <button @click="manualRefresh">Refresh Banner</button>
</template>
```

## Internationalization

The component uses the following i18n keys:

| Key | Usage | Example |
|-----|-------|---------|
| `new-bundle-ready-banner` | Banner message | "A new bundle is available and ready to deploy to production" |
| `deploy-now-button` | Deploy button text | "Deploy Now" |
| `deploying` | Loading state | "Deploying..." |
| `deploy-to-production-title` | Dialog title | "Deploy to Production" |
| `deploy-to-production-description` | Confirmation message | "Are you sure you want to deploy bundle {bundle} to production?" |
| `deploy-to-production-confirm` | Confirm button | "Deploy to Production" |
| `deployment-success` | Success toast | "Successfully deployed {bundle} to production!" |
| `deployment-failed` | Error toast | "Deployment failed" |

### Adding Translations

To add translations for other languages, add these keys to `messages/{locale}.json`:

```json
{
  "new-bundle-ready-banner": "Un nouveau bundle est disponible...",
  "deploy-now-button": "Déployer maintenant",
  "deploying": "Déploiement en cours...",
  ...
}
```

## Requirements

### Channel Setup

The banner requires a channel named "production" to function. Create one if it doesn't exist:

```bash
npx @capgo/cli channel add production
```

Or via the web interface:
1. Navigate to your app
2. Go to Channels tab
3. Click "Create Channel"
4. Name it "production"

### Permissions

Users must have appropriate permissions to:
- Read channels and bundles
- Update channel versions

The component handles permission errors gracefully and displays appropriate error messages.

## Troubleshooting

### Banner Not Appearing

**Issue**: The banner doesn't show even though I have a new bundle.

**Possible Causes & Solutions**:

1. **Insufficient Permissions** (Most Common)
   - User must have `admin`, `super_admin`, or `owner` role
   - Check your role:
     ```sql
     SELECT user_right FROM org_users 
     WHERE user_id = '<user_id>' AND org_id = '<org_id>';
     ```
   - Solution: Contact organization owner to upgrade your permissions

2. **Production Channel Missing**
   - Verify a "production" channel exists (name must be exactly "production")
   - Create via CLI: `npx @capgo/cli channel add production`
   - Or via web interface: Channels tab → Create Channel → Name: "production"

3. **Bundle Already Deployed**
   - Ensure the latest bundle is not already deployed to production
   - Check: Bundles tab vs Production channel version - IDs must differ

4. **Invalid Bundle Name**
   - Check that the latest bundle is not named "unknown" or "builtin"
   - These special names are excluded from deployment

5. **Data Loading Failure**
   - Open browser console and look for `[DeploymentBanner]` logs
   - Check for API errors or network issues
   - Verify Supabase connection status

### Deployment Fails

**Issue**: Clicking deploy shows an error.

**Possible Causes & Solutions**:

1. **Permission Changed Mid-Session**
   - Your role was downgraded after page load
   - Solution: Refresh the page to re-check permissions

2. **Database Connectivity**
   - Check browser console for detailed error messages
   - Verify Supabase connection in Network tab
   - Check for any ongoing service disruptions

3. **Channel Deleted**
   - Ensure the production channel hasn't been deleted during your session
   - Solution: Create production channel again or refresh page

4. **Concurrent Deployment**
   - Another user may have deployed simultaneously
   - Solution: Refresh page and try again

### Console Logging

The component includes comprehensive logging for debugging. All logs are prefixed with `[DeploymentBanner]`:

**Data Loading Phase**:
```javascript
console.log('[DeploymentBanner] Loading data for app:', appId)
console.log('[DeploymentBanner] Production channel:', prodChannel)
console.log('[DeploymentBanner] Latest bundle:', bundles?.[0])
```

**Deployment Phase**:
```javascript
console.log('[DeploymentBanner] Starting deployment:', {
  bundleId: latestBundle.value.id,
  channelId: productionChannel.value.id,
  hasPermission: hasAdminPermission.value
})
console.log('[DeploymentBanner] Deployment result:', { data, error })
```

**Permission Checks**:
```javascript
console.log('[DeploymentBanner] User role:', userRole.value)
console.log('[DeploymentBanner] Has admin permission:', hasAdminPermission.value)
```

**Tip**: Filter your console by `[DeploymentBanner]` to isolate all component logs.

## Code Examples

### Permission Check Implementation

The banner uses `organizationStore.hasPermissionsInRole()` to verify admin access:

```typescript
import { useOrganizationStore } from '~/stores/organization'

const organizationStore = useOrganizationStore()
const userRole = ref<string | null>(null)

// Computed property for permission check
const hasAdminPermission = computed(() => 
  userRole.value 
    ? organizationStore.hasPermissionsInRole(userRole.value, ['admin', 'super_admin']) 
    : false
)

// Visibility condition combines all requirements
const showBanner = computed(() => 
  !loading.value &&               // Data loaded
  latestBundle.value &&            // Bundle exists
  productionChannel.value &&       // Production channel exists
  hasAdminPermission.value &&      // User has admin permission
  latestBundle.value.id !== productionChannel.value.version  // Versions differ
)
```

### Loading User Role

Role is fetched from `org_users` table during component initialization:

```typescript
async function loadData() {
  loading.value = true
  
  try {
    // Fetch user's role in organization
    const { data: userData } = await supabase
      .from('org_users')
      .select('user_right')
      .eq('user_id', supabase.auth.user()?.id)
      .eq('org_id', currentOrgId)
      .single()
    
    userRole.value = userData?.user_right || null
    
    // ... load channels and bundles
  } catch (error) {
    console.error('[DeploymentBanner] Load error:', error)
  } finally {
    loading.value = false
  }
}
```

### Deployment Execution

The deploy action updates the production channel with optimistic UI updates:

```typescript
async function executeDeployment() {
  if (!latestBundle.value || !productionChannel.value || !hasAdminPermission.value) {
    return
  }
  
  deploying.value = true
  
  try {
    const { data, error } = await supabase
      .from('channels')
      .update({ 
        version: latestBundle.value.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', productionChannel.value.id)
      .select()
      .single()
    
    if (error) throw error
    
    // Success: show celebration and emit event
    showCelebration()
    emit('deployed')
    
    // Refresh to hide banner
    await loadData()
  } catch (error) {
    console.error('[DeploymentBanner] Deployment failed:', error)
    // Show error toast to user
  } finally {
    deploying.value = false
  }
}
```

### Integration Example with Parent Component

Example from `src/pages/app/[package].vue`:

```vue
<script setup lang="ts">
import DeploymentBanner from '~/components/dashboard/DeploymentBanner.vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const appId = computed(() => route.params.package as string)

// Refresh data after deployment
function handleDeploymentComplete() {
  // Reload channels, bundles, or other dependent data
  loadChannels()
  loadBundles()
  
  // Optional: Show success notification
  showToast('Production channel updated successfully!')
}
</script>

<template>
  <div class="app-dashboard">
    <!-- Banner appears at top when conditions met -->
    <DeploymentBanner 
      :app-id="appId" 
      @deployed="handleDeploymentComplete" 
    />
    
    <!-- Rest of dashboard content -->
    <div class="dashboard-content">
      <!-- ... -->
    </div>
  </div>
</template>
```

### Permission-Based UI Patterns

Example showing different UI for admins vs regular users:

```vue
<script setup lang="ts">
import { useOrganizationStore } from '~/stores/organization'

const organizationStore = useOrganizationStore()
const currentRole = ref<string>('read')

const isAdmin = computed(() => 
  organizationStore.hasPermissionsInRole(currentRole.value, ['admin', 'super_admin'])
)

const canDeploy = computed(() => 
  organizationStore.hasPermissionsInRole(currentRole.value, ['write', 'admin', 'super_admin'])
)
</script>

<template>
  <div>
    <!-- Deployment banner - admin only -->
    <DeploymentBanner v-if="isAdmin" :app-id="appId" />
    
    <!-- Manual deploy button - write access or higher -->
    <button v-if="canDeploy" @click="handleManualDeploy">
      Deploy to Production
    </button>
    
    <!-- View-only message for read users -->
    <p v-if="!canDeploy" class="text-muted">
      You have read-only access. Contact admin to deploy.
    </p>
  </div>
</template>
```

## Best Practices

### 1. Always Use Production Channel Name

The banner specifically looks for a channel named "production". Don't rename your production channel without updating the component logic.

### 2. Test Before Production

Test the deployment flow in a development/staging environment before relying on it in production.

### 3. Monitor Deployments

The banner updates the `deploy_history` table automatically (via database triggers). Monitor this table to track all production deployments.

### 4. Handle Concurrent Deployments

The banner includes protection against concurrent deployments through the `deploying` flag. Don't bypass this by modifying the component.

## Future Enhancements

Potential improvements for the banner:

- [ ] Support for custom channel names (not just "production")
- [ ] Deployment scheduling (deploy at specific time)
- [ ] Rollback quick-action
- [ ] Deployment notes/changelog entry
- [ ] Multi-channel deployment (deploy to production + beta)
- [ ] Deployment approval workflow for team environments

## Related Documentation

- [Channel Management](https://capgo.app/docs/webapp/channels/)
- [Bundle Management](https://capgo.app/docs/webapp/bundles/)
- [Deployment History](https://capgo.app/docs/webapp/deployments/)
- [CLI Documentation](https://capgo.app/docs/cli/)
