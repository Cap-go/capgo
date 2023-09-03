<script setup lang="ts">
import { ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { onClickOutside } from '@vueuse/core'
import type { Tab } from './comp_def'
import IconDashboard from '~icons/ic/round-space-dashboard'

// import FluentLive20Filled from '~icons/fluent/live-20-filled'
import IconApiKey from '~icons/mdi/shield-key'
import IconDiscord from '~icons/ic/round-discord'
import IconDoc from '~icons/gg/loadbar-doc'
import IconExpand from '~icons/mdi/arrow-expand-right'

const props = defineProps < {
  sidebarOpen: boolean
}>()

const emit = defineEmits(['closeSidebar'])

const router = useRouter()
const { t } = useI18n()
const sidebar = ref(null)
const route = useRoute()

onClickOutside(sidebar, () => emit('closeSidebar'))

const storedSidebarExpanded = localStorage.getItem('sidebar-expanded')
const sidebarExpanded = ref(storedSidebarExpanded === null ? false : storedSidebarExpanded === 'true')

watch(sidebarExpanded, () => {
  localStorage.setItem('sidebar-expanded', sidebarExpanded.value.toString())
  if (sidebarExpanded.value)
    document.querySelector('body')!.classList.add('sidebar-expanded')
  else
    document.querySelector('body')!.classList.remove('sidebar-expanded')
})
function isTabActive(tab: string) {
  return route.path.includes(tab)
}
function openTab(tab: Tab) {
  if (tab.onClick)
    tab.onClick(tab.key)
  else
    router.push(tab.key)
}
const tabs = ref<Tab[]>([
  {
    label: t('dashboard'),
    icon: shallowRef(IconDashboard),
    key: '/app/home',
  },
  {
    label: t('api-keys'),
    icon: shallowRef(IconApiKey),
    key: '/dashboard/apikeys',
  },
  // {
  //   label: t('live-reload'),
  //   icon: shallowRef(FluentLive20Filled),
  //   key: '/dashboard/livereload',
  // },
  {
    label: t('documentation'),
    icon: shallowRef(IconDoc),
    key: '#',
    onClick: () => window.open('https://docs.capgo.app', '_blank'),
  },
  {
    label: t('discord'),
    icon: shallowRef(IconDiscord),
    key: '#',
    onClick: () => window.open('https://discord.gg/VnYRvBfgA6', '_blank'),
  },
])
</script>

<template>
  <div>
    <!-- Sidebar backdrop (mobile only) -->
    <div class="fixed z-40 transition-opacity duration-200 inset-0-safe bg-slate-900 bg-opacity-30 lg:z-auto lg:hidden" :class="props.sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'" aria-hidden="true" />

    <!-- Sidebar -->
    <div
      id="sidebar"
      ref="sidebar"
      class="left-0-safe top-0-safe no-scrollbar lg:sidebar-expanded:!w-64 absolute z-40 h-full min-h-screen w-64 flex shrink-0 flex-col overflow-y-auto bg-slate-800 transition-all duration-200 ease-in-out lg:static lg:left-auto lg:top-auto lg:w-14 lg:translate-x-0 lg:overflow-y-auto 2xl:!w-64"
      :class="props.sidebarOpen ? 'translate-x-0' : '-translate-x-64'"
    >
      <!-- Sidebar header -->
      <div class="flex justify-between px-3 mt-4 mb-10 sidebar-expanded:mx-10 sm:px-2">
        <!-- Logo -->
        <router-link class="flex flex-row items-center space-x-2" to="/app/home">
          <img src="/capgo.webp" alt="logo" class="h-[32px] w-[32px]">
          <span class="text-xl font-medium truncate transition duration-150 lg:sidebar-expanded:block font-prompt text-slate-200 2xl:block lg:hidden hover:text-white">Capgo</span>
        </router-link>
      </div>

      <!-- Links -->
      <div class="space-y-8">
        <!-- Pages group -->
        <div>
          <h3 class="pl-3 text-xs font-semibold uppercase text-slate-500">
            <span class="hidden w-6 text-center lg:sidebar-expanded:hidden lg:block 2xl:hidden" aria-hidden="true">•••</span>
            <span class="lg:sidebar-expanded:block 2xl:block lg:hidden">{{ t('pages') }}</span>
          </h3>
          <ul class="mt-3">
            <li v-for="tab, i in tabs" :key="i" class="mb-0.5 rounded-sm px-3 py-2 last:mb-0">
              <button class="block truncate transition duration-150 text-slate-200 hover:text-white" :class="{ 'hover:text-slate-200': isTabActive(tab.key) }" @click="openTab(tab)">
                <div class="flex items-center justify-between">
                  <div class="flex items-center">
                    <component :is="tab.icon" class="w-6 h-6 fill-current" :class="{ 'text-blue-600': isTabActive(tab.key), 'text-slate-400': !isTabActive(tab.key) }" />
                    <span class="ml-3 text-sm font-medium duration-200 lg:sidebar-expanded:opacity-100 2xl:opacity-100 lg:opacity-0" :class="{ 'text-blue-600': isTabActive(tab.key), 'text-slate-400': !isTabActive(tab.key) }">{{ tab.label }}</span>
                  </div>
                </div>
              </button>
            </li>
          </ul>
        </div>
      </div>

      <!-- Expand / collapse button -->
      <div class="justify-end hidden pt-3 mt-auto 2xl:hidden lg:inline-flex">
        <div class="px-3 py-2">
          <button @click.prevent="sidebarExpanded = !sidebarExpanded">
            <span class="sr-only">Expand / collapse sidebar</span>
            <IconExpand class="w-6 h-6 fill-current sidebar-expanded:rotate-180" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
