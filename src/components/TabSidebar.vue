<script setup lang="ts">
import type { Tab } from './comp_def'
import { useI18n } from 'petite-vue-i18n'
import { watch } from 'vue'
import { useRouter } from 'vue-router'

const props = defineProps<{
  tabs: Tab[]
  activeTab: string
  noRoute?: boolean
}>()

const emit = defineEmits(['update:activeTab'])
const router = useRouter()
const { t } = useI18n()

function openLink(link: string) {
  emit('update:activeTab', link)
}
function isActive(to: string) {
  return router.currentRoute.value.path === to
}

function findTab(key: string) {
  return props.tabs.find(t => t.key === key)
}

watch(props, (p) => {
  // console.log('activeTab', p.activeTab)
  const tab = findTab(p.activeTab)
  if (!tab || props.noRoute)
    return
  if (tab.onClick) {
    tab.onClick(p.activeTab)
  }
  else {
    router.push(tab.key)
  }
})
watch(router.currentRoute, (p) => {
  emit('update:activeTab', p.path)
})
onMounted(() => {
  if (props.activeTab && props.activeTab !== router.currentRoute.value.path) {
    console.log('activeTab', props.activeTab)
    openLink(props.activeTab)
  }
})
</script>

<template>
  <div>
    <!-- Content -->
    <div class="h-full mb-8 bg-white rounded-lg shadow-lg dark:bg-gray-800">
      <div class="flex flex-col h-full md:flex-row md:-mr-px">
        <div class="hidden px-3 py-6 overflow-x-scroll border-b no-scrollbar min-w-60 flex-nowrap border-slate-300 md:flex md:overflow-auto md:border-b-0 md:border-r md:space-y-3">
          <!-- Group 1 -->
          <div class="w-full">
            <ul class="flex mr-3 flex-nowrap md:mr-0 md:block">
              <li v-for="(m, i) in tabs" :key="i" class="mr-0.5 md:mb-0.5 md:mr-0 w-full" @click="openLink(m.key)">
                <button :id="`tab-${m.label}`" class="flex items-center whitespace-nowrap rounded-sm px-2.5 py-2 hover:bg-gray-400 w-full first-letter:uppercase cursor-pointer" :class="{ 'text-blue-600 hover:text-blue-800': isActive(m.key), 'text-slate-400 hover:text-slate-100': !isActive(m.key) }">
                  <component :is="m.icon" class="w-4 h-4 mr-2 fill-current shrink-0" />
                  <span class="hidden text-sm font-medium md:block first-letter:uppercase">{{ t(m.label) }}</span>
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
