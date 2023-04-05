<script setup lang="ts">
import type { Tab } from './comp_def'

const props = defineProps<{
  tabs: Tab[]
  activeTab: string
  noWrap?: boolean
}>()
const emit = defineEmits(['update:activeTab'])
function activeTabColor(tab: string) {
  return {
    'border-transparent hover:text-gray-600 hover:border-gray-300 dark:hover:text-gray-300': props.activeTab !== tab,
    'text-blue-600 border-blue-600 border-b-2 rounded-t-lg active dark:text-blue-500 dark:border-blue-500': props.activeTab === tab,
  }
}
</script>

<template>
  <div class="border-b border-gray-200 dark:border-gray-700">
    <ul class="flex -mb-px text-sm font-medium text-center text-gray-500 dark:text-gray-400" :class="{ 'flex-wrap': !noWrap, 'flex-nowrap overflow-x-scroll no-scrollbar': noWrap }">
      <li v-for="(tab, i) in tabs" :key="i" class="mr-2">
        <button class="block p-2 rounded-t-lg group md:inline-flex md:p-4" :class="activeTabColor(tab.key)" @click="emit('update:activeTab', tab.key)">
          <component :is="tab.icon" class="mx-auto h-5 w-5 text-gray-400 transition-all duration-100 md:mr-2 group-hover:text-gray-600 md:-ml-0.5" />
          <span class="text-xs md:font-md">{{ tab.label }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>
