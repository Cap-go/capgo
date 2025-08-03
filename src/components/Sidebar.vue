<script setup lang="ts">
import type { Tab } from './comp_def'
import { onClickOutside } from '@vueuse/core'
import { useI18n } from 'petite-vue-i18n'
import { ref, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import IconDoc from '~icons/gg/loadbar-doc'
import IconDiscord from '~icons/ic/round-discord'
import IconDashboard from '~icons/ic/round-space-dashboard'
// import FluentLive20Filled from '~icons/fluent/live-20-filled'
import IconApiKey from '~icons/mdi/shield-key'
import DropdownProfile from '../components/dashboard/DropdownProfile.vue'

const props = defineProps <{
  sidebarOpen: boolean
}>()

const emit = defineEmits(['closeSidebar'])
const main = useMainStore()
const router = useRouter()
const { t } = useI18n()
const sidebar = useTemplateRef('sidebar')
const route = useRoute()

onClickOutside(sidebar, () => emit('closeSidebar'))

function isTabActive(tab: string) {
  return route.path.includes(tab)
}
function openTab(tab: Tab) {
  if (tab.onClick)
    tab.onClick(tab.key)
  else
    router.push(tab.key)
  emit('closeSidebar')
}
const tabs = ref<Tab[]>([
  {
    label: 'dashboard',
    icon: shallowRef(IconDashboard),
    key: '/app',
  },
  {
    label: 'api-keys',
    icon: shallowRef(IconApiKey),
    key: '/apikeys',
  },
  // {
  //   label: t('live-reload'),
  //   icon: shallowRef(FluentLive20Filled),
  //   key: '/dashboard/livereload',
  // },
  {
    label: 'documentation',
    icon: shallowRef(IconDoc),
    key: '#',
    onClick: () => window.open('https://docs.capgo.app', '_blank', 'noopener,noreferrer'),
    redirect: true,
  },
  {
    label: 'discord',
    icon: shallowRef(IconDiscord),
    key: '#',
    onClick: () => window.open('https://discord.capgo.app', '_blank', 'noopener,noreferrer'),
    redirect: true,
  },
])
</script>

<template>
  <div>
    <!-- Sidebar backdrop (mobile only) -->
    <div
      class="fixed inset-0 z-60 transition-opacity duration-200 lg:hidden"
      :class="{
        'bg-slate-900/50': props.sidebarOpen,
        'bg-slate-900/0 pointer-events-none': !props.sidebarOpen,
      }"
      aria-hidden="true"
      @click="emit('closeSidebar')"
    />

    <!-- Sidebar -->
    <div
      id="sidebar"
      ref="sidebar"
      class="fixed z-60 left-4 top-16 h-[calc(100%-4rem)] w-64 flex shrink-0 flex-col bg-slate-800 transition-all duration-200 ease-in-out rounded-xl shadow-lg lg:static lg:left-0 lg:top-0 lg:w-64 lg:h-full lg:bg-slate-800 lg:rounded-none lg:shadow-none lg:translate-x-0"
      :class="{
        'translate-x-0': props.sidebarOpen,
        '-translate-x-[120%]': !props.sidebarOpen,
      }"
    >
      <!-- Sidebar header -->
      <div class="flex justify-between px-3 py-4 border-b border-slate-800 lg:px-6 lg:py-6 lg:border-b lg:border-slate-700 shrink-0">
        <router-link 
          class="flex items-center space-x-2 cursor-pointer lg:space-x-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-800 rounded-lg p-1" 
          to="/app"
          aria-label="Capgo - Go to dashboard"
        >
          <img src="/capgo.webp" alt="Capgo logo" class="w-8 h-8">
          <span class="text-xl font-semibold truncate transition duration-150 font-prompt text-slate-200 hover:text-white lg:text-slate-200 lg:hover:text-white">Capgo</span>
        </router-link>
      </div>

      <!-- Organization dropdown -->
      <div class="px-3 py-4 lg:px-6 lg:py-4 shrink-0">
        <dropdown-organization v-if="main.user" />
      </div>

      <!-- Navigation -->
      <div class="px-3 py-4 space-y-4 lg:px-6 lg:py-6 flex-1 overflow-y-auto">
        <div>
          <h3 class="mb-3 text-xs font-semibold uppercase text-slate-500 lg:text-slate-500 lg:tracking-wider lg:mb-4">
            {{ t('pages') }}
          </h3>
          <ul class="space-y-1 lg:space-y-2">
            <li v-for="tab, i in tabs" :key="i">
              <button
                class="flex items-center w-full p-3 transition duration-150 rounded-md text-slate-200 cursor-pointer hover:bg-slate-700/50 lg:p-3 lg:rounded-lg lg:text-slate-200 lg:hover:bg-slate-700/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-800 min-h-[44px]"
                :class="{
                  'hover:bg-slate-700/50 lg:hover:bg-slate-700/50': !isTabActive(tab.key),
                  'bg-slate-700 text-white lg:bg-slate-700 lg:text-white': isTabActive(tab.key),
                  'cursor-default': isTabActive(tab.key),
                }"
                :aria-label="tab.redirect ? t(tab.label) + ' (opens in new tab)' : t(tab.label)"
                :aria-current="isTabActive(tab.key) ? 'page' : undefined"
                @click="openTab(tab)"
              >
                <component :is="tab.icon" class="w-5 h-5 shrink-0 transition-colors duration-150" :class="{ 'text-blue-500 lg:text-blue-500': isTabActive(tab.key), 'text-slate-400 group-hover:text-slate-300 lg:text-slate-400 lg:group-hover:text-slate-300': !isTabActive(tab.key) }" />
                <span class="ml-3 text-sm font-medium first-letter:uppercase transition-colors duration-150 flex items-center" :class="{ 'text-blue-500 lg:text-blue-500': isTabActive(tab.key), 'text-slate-400 group-hover:text-slate-300 lg:text-slate-400 lg:group-hover:text-slate-300': !isTabActive(tab.key), 'underline': tab.redirect }">
                  {{ t(tab.label) }}
                  <svg v-if="tab.redirect" class="w-3 h-3 ml-1 opacity-60" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path fill-rule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clip-rule="evenodd"></path>
                    <path fill-rule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clip-rule="evenodd"></path>
                  </svg>
                </span>
              </button>
            </li>
          </ul>
        </div>
      </div>

      <!-- User menu -->
      <div class="pt-4 mt-auto lg:pt-6 lg:border-t lg:border-slate-700 lg:mt-0 shrink-0">
        <div v-if="main.user" class="flex items-center">
          <DropdownProfile class="w-full" />
        </div>
      </div>
    </div>
  </div>
</template>
