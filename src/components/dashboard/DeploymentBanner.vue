<script setup lang="ts">
/**
 * DeploymentBanner Component
 *
 * An intelligent banner component that automatically detects when new bundles are available
 * and provides one-click deployment to production with proper permission checks.
 *
 * @component
 *
 * Features:
 * - Automatic detection of deployable bundles
 * - Admin-only visibility (enforces permission checks)
 * - One-click deployment with confirmation dialog
 * - Visual feedback with confetti animation on success
 * - Real-time state updates
 *
 * Security:
 * - Only visible to users with admin, super_admin, or owner roles
 * - Requires explicit confirmation before deployment
 * - Validates channel and bundle existence before showing
 *
 * @example
 * <DeploymentBanner :app-id="appId" @deployed="refreshData" />
 */

import type { Database } from '~/types/supabase.types'
import type { OrganizationRole } from '~/stores/organization'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import IconInfo from '~icons/lucide/info'
import { useSupabase } from '~/services/supabase'
import { useDialogV2Store } from '~/stores/dialogv2'
import { useOrganizationStore } from '~/stores/organization'

/**
 * Component props interface
 */
interface Props {
  /** The application identifier for which to show deployment status */
  appId: string
}

const props = defineProps<Props>()

/**
 * Component events
 * @event deployed - Emitted after successful deployment to production
 */
const emit = defineEmits<{
  deployed: []
}>()

// Initialize services and stores
const { t } = useI18n()
const supabase = useSupabase()
const dialogStore = useDialogV2Store()
const organizationStore = useOrganizationStore()

// Component state
/** Indicates if initial data is being loaded */
const loading = ref(true)
/** Indicates if a deployment is currently in progress */
const deploying = ref(false)
/** User's role for the current app (determines permission level) */
const userRole = ref<OrganizationRole | null>(null)
/** The most recent bundle available for deployment */
const latestBundle = ref<Database['public']['Tables']['app_versions']['Row'] | null>(null)
/** The production channel configuration */
const productionChannel = ref<Database['public']['Tables']['channels']['Row'] | null>(null)

/**
 * Computed property that checks if the user has admin-level permissions.
 * Only users with admin, super_admin, or owner roles can see and use the banner.
 *
 * @returns {boolean} True if user has admin permissions, false otherwise
 */
const hasAdminPermission = computed(() => {
  return userRole.value ? organizationStore.hasPermissionsInRole(userRole.value, ['admin', 'super_admin']) : false
})

/**
 * Computed property that determines if the banner should be visible.
 * Banner appears when:
 * 1. Data has finished loading
 * 2. A production channel exists
 * 3. A latest bundle exists
 * 4. User has admin permissions
 * 5. Latest bundle differs from production channel's current version
 *
 * @returns {boolean} True if banner should be shown, false otherwise
 */
const showBanner = computed(() => {
  // Don't show banner during initial load or if data is missing
  if (loading.value || !latestBundle.value || !productionChannel.value || !hasAdminPermission.value)
    return false

  // Show banner only if there's a newer bundle available than what's currently in production
  // This is the core detection logic: compare bundle IDs to determine if deployment is needed
  return latestBundle.value.id !== productionChannel.value.version
})

/**
 * Loads necessary data for the deployment banner.
 *
 * This function performs three main queries:
 * 1. Fetches the user's role/permission level for the app
 * 2. Retrieves the production channel configuration
 * 3. Gets the latest deployable bundle
 *
 * The banner will only show if all three pieces of data are available
 * and the user has sufficient permissions.
 *
 * @async
 * @returns {Promise<void>}
 */
async function loadData() {
  loading.value = true
  console.log('[DeploymentBanner] Loading data for app:', props.appId)

  try {
    // Step 1: Get user's role for this app from the organization store
    // This determines if the user has permission to see and use the banner
    userRole.value = await organizationStore.getCurrentRoleForApp(props.appId)

    // Step 2: Get production channel configuration
    // The banner specifically looks for a channel named "production"
    // Using maybeSingle() instead of single() to avoid errors if channel doesn't exist
    const { data: prodChannel } = await supabase
      .from('channels')
      .select('*')
      .eq('app_id', props.appId)
      .eq('name', 'production')
      .maybeSingle()

    console.log('[DeploymentBanner] Production channel:', prodChannel)

    if (prodChannel) {
      productionChannel.value = prodChannel
    }

    // Step 3: Get latest bundle (excluding special bundle types)
    // We filter out 'unknown' and 'builtin' bundles as these are not deployable
    // Only fetch non-deleted bundles ordered by creation date (newest first)
    const { data: bundles } = await supabase
      .from('app_versions')
      .select('*')
      .eq('app_id', props.appId)
      .eq('deleted', false)
      .neq('name', 'unknown')
      .neq('name', 'builtin')
      .order('created_at', { ascending: false })
      .limit(1)

    console.log('[DeploymentBanner] Latest bundle:', bundles?.[0])

    if (bundles && bundles.length > 0) {
      latestBundle.value = bundles[0]
    }
  }
  catch (error) {
    // Errors are logged but don't block the UI
    // The banner simply won't show if data loading fails
    console.error('[DeploymentBanner] Error loading data:', error)
  }
  finally {
    // Always reset loading state, even if errors occurred
    loading.value = false
  }
}

/**
 * Executes the actual deployment to production.
 *
 * This is the core deployment function that:
 * 1. Updates the production channel's version field to point to the latest bundle
 * 2. Updates local state for immediate UI feedback (optimistic update)
 * 3. Shows success animation and notification
 * 4. Emits event for parent component to refresh data
 * 5. Reloads banner data in background to hide the banner
 *
 * The deployment is essentially a simple database update that changes which bundle
 * the production channel points to. All actual deployment logic (distributing updates
 * to devices) happens automatically through existing channel mechanisms.
 *
 * @async
 * @returns {Promise<void>}
 */
async function executeDeployment() {
  // Safety check: validate required data is present
  if (!latestBundle.value || !productionChannel.value)
    return

  deploying.value = true

  try {
    console.log('[DeploymentBanner] Starting deployment:', {
      bundleId: latestBundle.value.id,
      bundleName: latestBundle.value.name,
      channelId: productionChannel.value.id,
    })

    // Perform the deployment by updating the channel's version field
    // This is the critical database operation that changes which bundle is "live"
    const { data, error } = await supabase
      .from('channels')
      .update({ version: latestBundle.value.id })
      .eq('id', productionChannel.value.id)
      .eq('app_id', props.appId) // Extra safety: ensure we're updating the right channel
      .select()
      .single()

    console.log('[DeploymentBanner] Deployment result:', { data, error })

    if (error) {
      // Deployment failed - show error and return early
      console.error('[DeploymentBanner] Deployment failed:', error)
      toast.error(t('deployment-failed'))
      return
    }

    // Success! Update local state immediately (optimistic update)
    // This hides the banner instantly without waiting for data reload
    if (productionChannel.value)
      productionChannel.value.version = latestBundle.value.id

    // Show success feedback to user
    toast.success(t('deployment-success'))
    showCelebration()

    // Notify parent component that deployment occurred
    emit('deployed')

    // Reload data in background to ensure banner stays hidden
    await loadData()
  }
  catch (err) {
    console.error('[DeploymentBanner] Deploy error:', err)
    toast.error(t('deployment-failed'))
  }
  finally {
    deploying.value = false
  }
}

/**
 * Handles the deploy button click by showing a confirmation dialog.
 *
 * This is the first step in the deployment flow. It validates that we have
 * the necessary data (bundle and channel) and then shows a confirmation dialog
 * to prevent accidental deployments.
 *
 * The dialog uses the 'danger' role for the confirm button to emphasize
 * that this is a production deployment action.
 *
 * @async
 * @returns {Promise<void>}
 */
async function handleDeploy() {
  // Safety check: ensure we have both bundle and channel data
  // This should always be true if the banner is visible, but we check defensively
  if (!latestBundle.value || !productionChannel.value)
    return

  const bundleName = latestBundle.value.name

  // Open confirmation dialog with deployment details
  // User must explicitly confirm before deployment proceeds
  dialogStore.openDialog({
    title: t('deploy-to-production-title'),
    description: t('deploy-to-production-description', { bundle: bundleName }),
    buttons: [
      {
        text: t('cancel'),
        role: 'cancel',
      },
      {
        text: t('deploy-confirm'),
        role: 'danger',
        handler: executeDeployment,
      },
    ],
  })
}

/**
 * Shows a celebratory confetti animation after successful deployment.
 *
 * Creates 50 colored particles that fall from the top of the screen
 * with random horizontal movement and rotation. Uses Capgo brand colors
 * for visual consistency.
 *
 * The animation is purely cosmetic and provides positive feedback to the user.
 * All particles are automatically cleaned up after 3 seconds to prevent memory leaks.
 *
 * @returns {void}
 */
function showCelebration() {
  const confettiCount = 50
  // Capgo brand colors + complementary colors for visual appeal
  const colors = ['#119eff', '#515271', '#FF6B6B', '#4ECDC4', '#FFE66D']

  // Create multiple confetti particles with random colors
  for (let i = 0; i < confettiCount; i++) {
    const randomColor = colors[Math.floor(Math.random() * colors.length)]
    createConfetti(randomColor)
  }
}

/**
 * Creates a single confetti particle element and animates it.
 *
 * The particle:
 * - Starts at the top of the viewport (outside visible area)
 * - Falls to the bottom with CSS transitions
 * - Moves horizontally with random drift
 * - Rotates randomly for realistic effect
 * - Fades out as it falls
 * - Is automatically removed from DOM after animation completes
 *
 * Uses CSS transitions for smooth, GPU-accelerated animation.
 *
 * @param {string} color - The hex color code for the confetti particle
 * @returns {void}
 */
function createConfetti(color: string) {
  // Create a small circular div element
  const confetti = document.createElement('div')
  confetti.style.position = 'fixed'
  confetti.style.width = '10px'
  confetti.style.height = '10px'
  confetti.style.backgroundColor = color
  confetti.style.left = `${Math.random() * 100}vw` // Random horizontal start position
  confetti.style.top = '-10px' // Start just above viewport
  confetti.style.borderRadius = '50%' // Make it circular
  confetti.style.pointerEvents = 'none' // Don't interfere with mouse events
  confetti.style.zIndex = '9999' // Show above all other content
  confetti.style.opacity = '1'
  confetti.style.transition = 'all 3s cubic-bezier(0.25, 0.46, 0.45, 0.94)' // Smooth easing

  // Add particle to DOM
  document.body.appendChild(confetti)

  // Trigger animation on next frame (allows CSS transition to work)
  requestAnimationFrame(() => {
    confetti.style.top = '100vh' // Fall to bottom
    confetti.style.left = `${Number.parseFloat(confetti.style.left) + (Math.random() - 0.5) * 100}vw` // Drift horizontally
    confetti.style.opacity = '0' // Fade out
    confetti.style.transform = `rotate(${Math.random() * 360}deg)` // Spin randomly
  })

  // Clean up: remove particle from DOM after animation completes
  // This prevents memory leaks from accumulating DOM elements
  setTimeout(() => {
    confetti.remove()
  }, 3000) // Match transition duration
}

// Lifecycle: Load data when component mounts
onMounted(() => {
  loadData()
})

/**
 * Expose public methods for parent component access.
 *
 * This allows parent components to programmatically refresh the banner
 * if needed (e.g., after manual channel updates).
 */
defineExpose({
  refresh: loadData,
})
</script>

<template>
  <!--
    Deployment Banner

    Conditionally rendered banner that appears when:
    - User has admin permissions
    - Production channel exists
    - Latest bundle differs from production channel's current version

    The banner provides:
    - Visual notification (info icon + message)
    - One-click deploy action
    - Loading state during deployment
   -->
  <div
    v-if="showBanner"
    class="mb-4 flex items-center justify-between px-4 py-3 bg-blue-900/60 dark:bg-blue-900/70 rounded-lg border border-blue-800/100 dark:border-blue-700/100 animate-fade-in"
  >
    <!-- Left side: Info icon and message -->
    <div class="flex items-center gap-3">
      <IconInfo class="flex-shrink-0 w-5 h-5 text-blue-400" />
      <span class="text-sm text-gray-200 dark:text-gray-100">
        {{ t('new-bundle-ready-banner') }}
      </span>
    </div>

    <!-- Right side: Deploy action button -->
    <button
      :disabled="deploying"
      class="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
      @click="handleDeploy"
    >
      <!-- Button text changes during deployment -->
      <span>{{ deploying ? t('deploying') : t('deploy-now-button') }}</span>
    </button>
  </div>
</template>

<style scoped>
@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in {
  animation: fade-in 0.3s ease-out;
}
</style>
