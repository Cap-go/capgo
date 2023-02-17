<script setup lang="ts">
import type { Tab } from './comp_def'

const props = defineProps<{
  tabs: Tab[]
  activeTab: string
}>()
const emit = defineEmits(['update:activeTab'])
const activeTabColor = (tab: string) => ({
  'border-transparent hover:text-gray-600 hover:border-gray-300 dark:hover:text-gray-300': props.activeTab !== tab,
  'text-blue-600 border-blue-600 border-b-2 rounded-t-lg active dark:text-blue-500 dark:border-blue-500': props.activeTab === tab,
})
</script>

<template>
  <div class="border-b border-gray-200 dark:border-gray-700">
    <ul class="flex flex-wrap -mb-px text-sm font-medium text-center text-gray-500 dark:text-gray-400">
      <li v-for="(tab, i) in tabs" :key="i" class="mr-2">
        <button class="inline-flex p-4 rounded-t-lg group" :class="activeTabColor(tab.key)" @click="emit('update:activeTab', tab.key)">
          <component :is="tab.icon" class="-ml-0.5 mr-2 text-gray-400 h-5 w-5 group-hover:text-gray-600 transition-all duration-100" />
          <span class="hidden md:block">{{ tab.label }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>

</style>
