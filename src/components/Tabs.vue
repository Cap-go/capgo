<script setup lang="ts">
import type { Tab } from './comp_def'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  tabs: Tab[]
  activeTab: string
  secondaryTabs?: Tab[]
  secondaryActiveTab?: string
  noWrap?: boolean
}>()

const emit = defineEmits(['update:activeTab', 'update:secondaryActiveTab'])

const { t } = useI18n()
const hasSecondary = computed(() => !!props.secondaryTabs?.length)

function activeTabColor(tab: string, isSecondary = false) {
  const isActive = (isSecondary ? props.secondaryActiveTab : props.activeTab) === tab
  const secondaryPresent = hasSecondary.value
  if (isSecondary) {
    return {
      'border border-transparent text-slate-500/75 dark:text-slate-400/75 hover:bg-slate-50/70 hover:ring-0 dark:hover:bg-slate-800/40 hover:text-slate-700 dark:hover:text-slate-200 transition-colors duration-150':
        !isActive,
      'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/25 border border-blue-200/70 dark:border-blue-800 shadow-[0_1px_2px_rgba(0,0,0,0.06)] hover:ring-1 hover:ring-blue-200 dark:hover:ring-blue-700 hover:bg-blue-100/80 transition-colors duration-150':
        isActive,
    }
  }

  // primary row
  if (secondaryPresent) {
    return {
      'border border-transparent text-slate-500/75 dark:text-slate-400/75 hover:text-slate-700 dark:hover:text-slate-200 transition-colors duration-150':
        !isActive,
      'text-blue-500 dark:text-blue-300 bg-blue-50/60 dark:bg-blue-900/15 border border-blue-200/60 dark:border-blue-800/70 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:ring-1 hover:ring-blue-200 dark:hover:ring-blue-800 transition-colors duration-150':
        isActive,
    }
  }

  return {
    'border border-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-100 hover:ring-1 hover:ring-slate-200 dark:hover:bg-slate-800/70 dark:hover:ring-slate-700 hover:text-slate-800 dark:hover:text-slate-100 transition-colors duration-150':
      !isActive,
    'text-blue-600 dark:text-blue-400 bg-blue-50/70 dark:bg-blue-900/20 border border-blue-200/70 dark:border-blue-800 shadow-[0_1px_2px_rgba(0,0,0,0.06)] hover:ring-1 hover:ring-blue-200 dark:hover:ring-blue-700 hover:bg-blue-100/90 transition-colors duration-150':
      isActive,
  }
}

// Keep tabs corners square to match surrounding layout
const containerClass = 'bg-slate-200/60 dark:bg-slate-800/60'
const ulPrimaryClass = 'flex -mb-px text-xs md:text-sm font-medium text-center text-gray-500 dark:text-gray-300 gap-1 py-1'
const ulSecondaryClass = 'flex -mb-px text-sm font-medium text-center text-gray-600 dark:text-gray-200 gap-2 py-2'
const buttonPrimaryClass = 'inline-flex items-center gap-2 px-3 py-2 min-w-[42px] min-h-[38px] rounded-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 dark:focus-visible:ring-offset-slate-900 transition-all duration-200 group md:relative'
const buttonSecondaryClass = 'inline-flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 dark:focus-visible:ring-offset-slate-900 transition-colors duration-150 group'
const iconPrimaryClass = 'w-5 h-5 transition-colors duration-150'
const iconSecondaryClass = 'mx-auto w-5 h-5 md:mr-2 md:-ml-0.5 transition-colors duration-150'
const labelPrimaryClass = computed(() => hasSecondary.value
  ? 'hidden md:block md:text-xs md:font-medium md:text-slate-500 md:dark:text-slate-400'
  : 'hidden md:block md:text-xs md:font-medium md:text-slate-700 md:dark:text-slate-100')
const labelSecondaryClass = 'hidden md:block text-xs md:text-sm font-medium transition-colors duration-150 first-letter:uppercase'
</script>

<template>
  <div>
    <div :class="containerClass">
      <ul :class="[ulPrimaryClass, { 'flex-wrap': !noWrap, 'flex-nowrap overflow-x-scroll no-scrollbar px-1': noWrap }]">
        <li v-for="(tab, i) in tabs" :key="i" class="mr-2">
          <button :class="[buttonPrimaryClass, activeTabColor(tab.key)]" @click="emit('update:activeTab', tab.key)">
            <component
              :is="tab.icon"
              :class="[
                iconPrimaryClass,
                {
                  'text-blue-600': !hasSecondary && props.activeTab === tab.key,
                  'text-blue-500 dark:text-blue-300': hasSecondary && props.activeTab === tab.key,
                  'text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-100': hasSecondary && props.activeTab !== tab.key,
                  'text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-100': !hasSecondary && props.activeTab !== tab.key,
                },
              ]"
            />
            <span
              :class="[
                labelPrimaryClass,
                {
                  'text-blue-600': !hasSecondary && props.activeTab === tab.key,
                  'text-blue-500 dark:text-blue-300': hasSecondary && props.activeTab === tab.key,
                  'text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-100': hasSecondary && props.activeTab !== tab.key,
                  'text-slate-500 dark:text-slate-300 group-hover:text-slate-800 dark:group-hover:text-slate-100': !hasSecondary && props.activeTab !== tab.key,
                },
              ]"
            >{{ t(tab.label) }}</span>
          </button>
        </li>
      </ul>
    </div>
    <div v-if="secondaryTabs?.length" class="border-t border-slate-200/70 dark:border-slate-700/60">
      <div :class="containerClass">
        <ul :class="[ulSecondaryClass, { 'flex-wrap': !noWrap, 'flex-nowrap overflow-x-scroll no-scrollbar px-1': noWrap }]">
          <li v-for="(tab, i) in secondaryTabs" :key="i" class="mr-2">
            <button :class="[buttonSecondaryClass, activeTabColor(tab.key, true)]" @click="emit('update:secondaryActiveTab', tab.key)">
              <component
                :is="tab.icon"
                :class="[
                  iconSecondaryClass,
                  {
                    'text-blue-600': props.secondaryActiveTab === tab.key,
                    'text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-100': props.secondaryActiveTab !== tab.key,
                  },
                ]"
              />
              <span
                :class="[
                  labelSecondaryClass,
                  {
                    'text-blue-600': props.secondaryActiveTab === tab.key,
                    'text-slate-500 dark:text-slate-300 group-hover:text-slate-800 dark:group-hover:text-slate-100': props.secondaryActiveTab !== tab.key,
                  },
                ]"
              >{{ t(tab.label) }}</span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
