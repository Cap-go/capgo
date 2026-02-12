<script setup lang="ts">
import type { Tab } from '~/components/comp_def'
import type { Organization } from '~/stores/organization'
import { computed, ref, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PaymentRequiredModal from '~/components/PaymentRequiredModal.vue'
import Tabs from '~/components/Tabs.vue'
import { appTabs as baseAppTabs } from '~/constants/appTabs'
import { bundleTabs } from '~/constants/bundleTabs'
import { channelTabs } from '~/constants/channelTabs'
import { deviceTabs } from '~/constants/deviceTabs'
import { useOrganizationStore } from '~/stores/organization'

const router = useRouter()
const route = useRoute()
const organizationStore = useOrganizationStore()

// Get the app ID from the route
const appId = computed(() => {
  const match = route.path.match(/^\/app\/([^/]+)/)
  return match ? match[1] : ''
})

// Get organization for the current app (not currentOrganization which may be wrong in app context)
const appOrganization = ref<Organization | null>(null)

watchEffect(async () => {
  if (appId.value) {
    await organizationStore.awaitInitialLoad()
    appOrganization.value = organizationStore.getOrgByAppId(appId.value) ?? null
  }
})

// Compute tabs dynamically based on RBAC settings
const appTabs = computed<Tab[]>(() => {
  const useNewRbac = appOrganization.value?.use_new_rbac

  if (useNewRbac) {
    return baseAppTabs
  }

  return baseAppTabs.filter(t => t.label !== 'access')
})

// Check if org payment has failed - only show info tab in this case
const isOrgUnpaid = computed(() => {
  return organizationStore.currentOrganizationFailed
})

// Check if we're on the info page (which should not show the payment modal)
const isOnInfoPage = computed(() => {
  return route.path.endsWith('/info')
})

// Show payment overlay only when org is unpaid AND not on info page
const showPaymentOverlay = computed(() => {
  return isOrgUnpaid.value && !isOnInfoPage.value
})

// Detect resource type from route (channel, device, or bundle)
const resourceType = computed(() => {
  if (route.path.includes('/channel/'))
    return 'channel'
  if (route.path.includes('/device/'))
    return 'device'
  if (route.path.includes('/bundle/'))
    return 'bundle'
  return null
})

const resourceId = computed(() => {
  if (!resourceType.value)
    return ''
  const match = route.path.match(new RegExp(`\\/${resourceType.value}\\/([^/]+)`))
  return match ? match[1] : ''
})

// Generate tabs with full paths for the current app
const tabs = computed<Tab[]>(() => {
  if (!appId.value)
    return appTabs.value

  // Filter tabs when org is unpaid - only show info tab
  const availableTabs = isOrgUnpaid.value
    ? appTabs.value.filter(tab => tab.key === '/info')
    : appTabs.value

  return availableTabs.map(tab => ({
    ...tab,
    key: tab.key ? `/app/${appId.value}${tab.key}` : `/app/${appId.value}`,
  }))
})

// Get appropriate secondary tabs based on resource type
const tabsConfig: Record<string, Tab[]> = {
  channel: channelTabs,
  device: deviceTabs,
  bundle: bundleTabs,
}

// Generate secondary tabs with full paths for the current resource
const secondaryTabs = computed<Tab[]>(() => {
  if (!appId.value || !resourceId.value || !resourceType.value)
    return []

  const baseTabs = tabsConfig[resourceType.value] || []

  return baseTabs.map(tab => ({
    ...tab,
    key: tab.key
      ? `/app/${appId.value}/${resourceType.value}/${resourceId.value}${tab.key}`
      : `/app/${appId.value}/${resourceType.value}/${resourceId.value}`,
  }))
})

// Parent tab mapping for each resource type
const parentTabMap: Record<string, string> = {
  channel: 'channels',
  device: 'devices',
  bundle: 'bundles',
}

const activeTab = computed(() => {
  const path = route.path.replace(/\/$/, '')

  if (!appId.value)
    return tabs.value[0]?.key ?? ''

  // If on a resource detail page (bundle/channel/device), keep parent tab active
  if (resourceType.value) {
    const parentTab = parentTabMap[resourceType.value]
    return `/app/${appId.value}/${parentTab}`
  }

  // Prefer exact match.
  const exactTab = tabs.value.find((t) => {
    const tabKey = t.key.replace(/\/$/, '')
    return path === tabKey
  })

  if (exactTab)
    return exactTab.key

  // Fallback: nested pages under a tab should keep the parent tab active.
  // Example: `/app/:id/bundles/new` should keep `/app/:id/bundles` active.
  const prefixMatch = tabs.value
    .map(t => ({ t, tabKey: t.key.replace(/\/$/, '') }))
    .filter(({ tabKey }) => path.startsWith(`${tabKey}/`))
    .sort((a, b) => b.tabKey.length - a.tabKey.length)[0]

  return prefixMatch?.t.key ?? `/app/${appId.value}`
})

const activeSecondaryTab = computed(() => {
  const path = route.path.replace(/\/$/, '')

  // Match the full path to a secondary tab
  const tab = secondaryTabs.value.find((t) => {
    const tabKey = t.key.replace(/\/$/, '')
    return path === tabKey
  })

  return tab?.key ?? `/app/${appId.value}/${resourceType.value}/${resourceId.value}`
})

function handleTab(key: string) {
  router.push(key)
}

function handleSecondaryTab(key: string) {
  router.push(key)
}
</script>

<template>
  <div class="flex flex-col flex-1 h-full min-h-0 overflow-hidden">
    <Tabs
      :tabs="tabs"
      :active-tab="activeTab"
      :secondary-tabs="secondaryTabs"
      :secondary-active-tab="activeSecondaryTab"
      no-wrap
      @update:active-tab="handleTab"
      @update:secondary-active-tab="handleSecondaryTab"
    />
    <main class="relative flex flex-1 w-full min-h-0 mt-0 overflow-hidden bg-blue-50 dark:bg-slate-800/40">
      <div
        class="flex-1 w-full min-h-0 mx-auto overflow-y-auto"
        :class="{ 'blur-sm pointer-events-none select-none': showPaymentOverlay }"
      >
        <RouterView class="w-full" />
      </div>
      <PaymentRequiredModal v-if="showPaymentOverlay" />
    </main>
  </div>
</template>
