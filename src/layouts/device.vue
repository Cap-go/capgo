<script setup lang="ts">
import type { Tab } from '~/components/comp_def'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Tabs from '~/components/Tabs.vue'
import { appTabs } from '~/constants/appTabs'
import { deviceTabs } from '~/constants/deviceTabs'

const router = useRouter()
const route = useRoute()

// Get the app ID and device ID from the route
const appId = computed(() => {
  const match = route.path.match(/^\/app\/([^/]+)/)
  return match ? match[1] : ''
})

const deviceId = computed(() => {
  const match = route.path.match(/\/device\/([^/]+)/)
  return match ? match[1] : ''
})

// Generate tabs with full paths for the current app
const tabs = computed<Tab[]>(() => {
  if (!appId.value)
    return appTabs

  return appTabs.map(tab => ({
    ...tab,
    key: tab.key ? `/app/${appId.value}${tab.key}` : `/app/${appId.value}`,
  }))
})

// Generate secondary tabs with full paths for the current device
const secondaryTabs = computed<Tab[]>(() => {
  if (!appId.value || !deviceId.value)
    return deviceTabs

  return deviceTabs.map(tab => ({
    ...tab,
    key: tab.key ? `/app/${appId.value}/device/${deviceId.value}${tab.key}` : `/app/${appId.value}/device/${deviceId.value}`,
  }))
})

const activeTab = computed(() => {
  if (!appId.value)
    return tabs.value[0]?.key ?? ''

  return `/app/${appId.value}/devices`
})

const activeSecondaryTab = computed(() => {
  const path = route.path.replace(/\/$/, '')

  // Match the full path to a secondary tab
  const tab = secondaryTabs.value.find((t) => {
    const tabKey = t.key.replace(/\/$/, '')
    return path === tabKey
  })

  return tab?.key ?? `/app/${appId.value}/device/${deviceId.value}`
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
    <main class="flex flex-1 w-full min-h-0 mt-0 overflow-hidden bg-blue-50 dark:bg-[#1a2744]">
      <div class="flex-1 w-full min-h-0 mx-auto overflow-y-auto">
        <RouterView class="w-full" />
      </div>
    </main>
  </div>
</template>
