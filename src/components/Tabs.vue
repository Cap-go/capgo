<script setup lang="ts">
import type { Tab } from './comp_def'
import { useI18n } from 'petite-vue-i18n'

const props = defineProps<{
  tabs: Tab[]
  activeTab: string
  noWrap?: boolean
}>()

const emit = defineEmits(['update:activeTab'])

const { t } = useI18n()

function activeTabColor(tab: string) {
  return {
    'border-transparent hover:text-gray-600 hover:border-gray-300 dark:hover:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700': props.activeTab !== tab,
    'text-blue-600 border-blue-600 border-b-2 active dark:text-blue-500 dark:border-blue-500': props.activeTab === tab,
  }
}
</script>

<template>
  <div>
    <div class="bg-slate-200/60 dark:bg-slate-800/60">
      <ul class="flex -mb-px text-sm font-medium text-center text-gray-500 dark:text-gray-400" :class="{ 'flex-wrap': !noWrap, 'flex-nowrap overflow-x-scroll no-scrollbar': noWrap }">
        <li v-for="(tab, i) in tabs" :key="i" class="mr-2">
          <button class="block p-2 text-gray-500 group md:inline-flex md:p-4 cursor-pointer" :class="activeTabColor(tab.key)" @click="emit('update:activeTab', tab.key)">
            <component :is="tab.icon" class="mx-auto h-5 w-5 transition-all duration-100 md:mr-2 md:-ml-0.5" :class="{ 'group-hover:dark:text-gray-300 group-hover:text-gray-600': props.activeTab !== tab.key, 'text-blue-600': props.activeTab === tab.key }" />
            <span class="text-xs hidden md:block font-md transition-all duration-100 first-letter:uppercase" :class="{ 'group-hover:dark:text-gray-300 group-hover:text-gray-600': props.activeTab !== tab.key, 'text-blue-600': props.activeTab === tab.key }">{{ t(tab.label) }}</span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
