<script setup lang="ts">
import type { Tab } from '~/components/comp_def'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Tabs from '~/components/Tabs.vue'
import { appTabs } from '~/constants/appTabs'

const router = useRouter()
const route = useRoute()

// Get the app ID from the route
const appId = computed(() => {
  const match = route.path.match(/^\/app\/([^/]+)/)
  return match ? match[1] : ''
})

// Generate tabs with relative paths for the current app
const tabs = computed<Tab[]>(() => {
  if (!appId.value)
    return appTabs

  // Map the base tabs with relative paths to full paths for this specific app
  return appTabs.map(tab => ({
    ...tab,
    key: tab.key ? `/app/${appId.value}${tab.key}` : `/app/${appId.value}`,
  }))
})

const activeTab = computed(() => {
  const path = route.path.replace(/\/$/, '')

  if (!appId.value)
    return tabs.value[0]?.key ?? ''

  // If on a specific resource detail page (bundle/channel/device), keep parent tab active
  const tabPath = path.replace(`/app/${appId.value}`, '') || ''

  // Check if we're on a detail page and return the appropriate list tab
  const bundleMatch = tabPath.match(/^\/bundle\//)
  if (bundleMatch)
    return `/app/${appId.value}/bundles`

  const channelMatch = tabPath.match(/^\/channel\//)
  if (channelMatch)
    return `/app/${appId.value}/channels`

  const deviceMatch = tabPath.match(/^\/device\//)
  if (deviceMatch)
    return `/app/${appId.value}/devices`

  const buildMatch = tabPath.startsWith('/build/')
  if (buildMatch)
    return `/app/${appId.value}/builds`

  // Match the full path to a tab
  const tab = tabs.value.find((t) => {
    const tabKey = t.key.replace(/\/$/, '')
    return path === tabKey
  })

  return tab?.key ?? `/app/${appId.value}`
})

function handleTab(key: string) {
  const tab = tabs.value.find(t => t.key === key)
  if (tab?.onClick) {
    tab.onClick(key)
    return
  }
  router.push(key)
}
</script>

<template>
  <div class="flex flex-col flex-1 h-full min-h-0 overflow-hidden">
    <Tabs
      :tabs="tabs"
      :active-tab="activeTab"
      no-wrap
      @update:active-tab="handleTab"
    />
    <main class="flex flex-1 w-full min-h-0 mt-0 overflow-hidden bg-blue-50 dark:bg-[#1a2744]">
      <div class="flex-1 w-full min-h-0 mx-auto overflow-y-auto">
        <RouterView class="w-full" />
      </div>
    </main>
  </div>
</template>
