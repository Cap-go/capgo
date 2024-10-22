<script setup lang="ts">
import type { Tab } from './comp_def'
import { onClickOutside } from '@vueuse/core'
import IconDoc from '~icons/gg/loadbar-doc'
import IconDiscord from '~icons/ic/round-discord'
import IconDashboard from '~icons/ic/round-space-dashboard'

// import FluentLive20Filled from '~icons/fluent/live-20-filled'
import IconApiKey from '~icons/mdi/shield-key'
import { useI18n } from 'petite-vue-i18n'
import { ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import UserMenu from '../components/dashboard/DropdownProfile.vue'

const props = defineProps < {
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
    key: '/app/home',
  },
  {
    label: 'api-keys',
    icon: shallowRef(IconApiKey),
    key: '/dashboard/apikeys',
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
    onClick: () => window.open('https://docs.capgo.app', '_blank'),
    redirect: true,
  },
  {
    label: 'discord',
    icon: shallowRef(IconDiscord),
    key: '#',
    onClick: () => window.open('https://discord.gg/VnYRvBfgA6', '_blank'),
    redirect: true,
  },
])
</script>

<template>
  <div>
    <!-- Sidebar backdrop (mobile only) -->
    <div
      class="fixed inset-0 z-40 transition-opacity duration-200 bg-slate-900 bg-opacity-30 lg:hidden"
      :class="props.sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'"
      aria-hidden="true"
      @click="emit('closeSidebar')"
    />

    <!-- Sidebar -->
    <div
      id="sidebar"
      ref="sidebar"
      class="fixed z-40 left-4 top-16 h-[calc(100%-4rem)] w-64 flex shrink-0 flex-col overflow-y-scroll bg-slate-800 transition-all duration-200 ease-in-out rounded-xl shadow-lg lg:static lg:left-0 lg:top-0 lg:h-full lg:w-14 lg:translate-x-0 lg:overflow-y-auto lg:rounded-none lg:shadow-none lg:rounded-r-xl 2xl:!w-64"
      :class="props.sidebarOpen ? 'translate-x-0' : '-translate-x-[120%]'"
    >
      <!-- Sidebar header -->
      <div class="flex justify-between px-3 py-4 border-b border-slate-800">
        <router-link class="flex items-center space-x-2" to="/app/home">
          <img src="/capgo.webp" alt="logo" class="w-8 h-8">
          <span class="text-xl font-semibold truncate transition duration-150 font-prompt text-slate-200 2xl:block lg:hidden hover:text-white">Capgo</span>
        </router-link>
      </div>

      <!-- Organization dropdown -->
      <div class="px-3 py-4">
        <dropdown-organization v-if="main.user" />
      </div>

      <!-- Navigation -->
      <div class="px-3 py-4 space-y-4">
        <div>
          <h3 class="mb-3 text-xs font-semibold uppercase text-slate-500">
            <span class="hidden w-6 text-center lg:block 2xl:hidden" aria-hidden="true">•••</span>
            <span class="2xl:block lg:hidden">{{ t('pages') }}</span>
          </h3>
          <ul class="space-y-1">
            <li v-for="tab, i in tabs" :key="i">
              <button
                class="flex items-center w-full p-2 transition duration-150 rounded-md text-slate-200"
                :class="{
                  'hover:bg-slate-800': !isTabActive(tab.key),
                  'bg-slate-800 text-white': isTabActive(tab.key),
                  'pointer-events-none': isTabActive(tab.key),
                }"
                @click="openTab(tab)"
              >
                <component :is="tab.icon" class="w-5 h-5 shrink-0" :class="{ 'text-blue-500': isTabActive(tab.key), 'text-slate-400': !isTabActive(tab.key) }" />
                <span class="ml-3 text-sm font-medium duration-200 2xl:opacity-100 lg:opacity-0" :class="{ 'text-blue-500': isTabActive(tab.key), 'text-slate-400': !isTabActive(tab.key), 'underline': tab.redirect }">
                  {{ t(tab.label) }}
                </span>
              </button>
            </li>
          </ul>
        </div>
      </div>

      <!-- User menu -->
      <div class="px-3 py-4 mt-auto border-t border-slate-800">
        <div v-if="main.user" class="flex items-center">
          <UserMenu class="w-full" />
        </div>
      </div>
    </div>
  </div>
</template>
