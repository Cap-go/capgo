<script setup lang="ts">
import { watch } from 'vue'
import { useRouter } from 'vue-router'
import type { Tab } from './comp_def'

const props = defineProps<{
  tabs: Tab[]
  activeTab: string
  noRoute?: boolean
}>()

const emit = defineEmits(['update:activeTab'])
const router = useRouter()

function openLink(link: string) {
  emit('update:activeTab', link)
}
function isActive(to: string) {
  return router.currentRoute.value.path.includes(to)
}

function findTab(key: string) {
  return props.tabs.find(t => t.key === key)
}

watch(props, (p) => {
  console.log('activeTab', p.activeTab)
  const tab = findTab(p.activeTab)
  if (!tab || props.noRoute)
    return
  if (tab.onClick)
    tab.onClick(p.activeTab)
  else
    router.push(tab.key)
})
</script>

<template>
  <div>
    <!-- Content -->
    <div class="mb-8 h-full rounded-sm bg-white shadow-lg dark:bg-gray-800">
      <div class="h-full flex flex-col md:flex-row md:-mr-px">
        <div class="no-scrollbar hidden min-w-60 flex-nowrap overflow-x-scroll border-b border-slate-200 px-3 py-6 md:block md:flex md:overflow-auto md:border-b-0 md:border-r md:space-y-3">
          <!-- Group 1 -->
          <div>
            <ul class="mr-3 flex flex-nowrap md:mr-0 md:block">
              <li v-for="(m, i) in tabs" :key="i" class="mr-0.5 md:mb-0.5 md:mr-0" @click="openLink(m.key)">
                <button class="flex items-center whitespace-nowrap rounded px-2.5 py-2">
                  <component :is="m.icon" class="mr-2 h-4 w-4 shrink-0 fill-current" :class="{ 'text-blue-600': isActive(m.key), 'text-slate-400': !isActive(m.key) }" />
                  <span class="hidden text-sm font-medium md:block" :class="{ 'text-blue-600': isActive(m.key), 'text-slate-400': !isActive(m.key) }">{{ m.label }}</span>
                </button>
              </li>
            </ul>
          </div>
        </div>
        <Tabs :active-tab="activeTab" class="block w-full md:hidden" no-wrap :tabs="tabs" @update:active-tab="openLink" />
        <slot class="h-full overflow-y-scroll" />
      </div>
    </div>
  </div>
</template>
