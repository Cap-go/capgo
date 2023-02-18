<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const props = defineProps < {
  sidebarOpen: boolean
}>()
defineEmits(['closeSidebar'])

const { t } = useI18n()
const trigger = ref(null)
const sidebar = ref(null)

const storedSidebarExpanded = localStorage.getItem('sidebar-expanded')
const sidebarExpanded = ref(storedSidebarExpanded === null ? false : storedSidebarExpanded === 'true')

const currentRoute = useRouter().currentRoute.value

watch(sidebarExpanded, () => {
  localStorage.setItem('sidebar-expanded', sidebarExpanded.value.toString())
  if (sidebarExpanded.value)
    document.querySelector('body')!.classList.add('sidebar-expanded')
  else
    document.querySelector('body')!.classList.remove('sidebar-expanded')
})
</script>

<template>
  <div>
    <!-- Sidebar backdrop (mobile only) -->
    <div class="fixed inset-0-safe z-40 transition-opacity duration-200 bg-slate-900 bg-opacity-30 lg:hidden lg:z-auto" :class="props.sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'" aria-hidden="true" />

    <!-- Sidebar -->
    <div
      id="sidebar"
      ref="sidebar"
      class="flex flex-col absolute z-40 left-0-safe top-0-safe lg:static lg:left-auto lg:top-auto lg:translate-x-0 min-h-screen h-full overflow-y-scroll lg:overflow-y-auto no-scrollbar w-64 lg:w-20 lg:sidebar-expanded:!w-64 2xl:!w-64 shrink-0 bg-slate-800 p-4 transition-all duration-200 ease-in-out"
      :class="props.sidebarOpen ? 'translate-x-0' : '-translate-x-64'"
    >
      <!-- Sidebar header -->
      <div class="flex justify-between pr-3 mb-10 sm:px-2">
        <!-- Close button -->
        <button
          ref="trigger"
          class="lg:hidden text-slate-500 hover:text-slate-400"
          aria-controls="sidebar"
          :aria-expanded="props.sidebarOpen"
          @click.stop="$emit('closeSidebar')"
        >
          <span class="sr-only">Close sidebar</span>
          <svg class="w-6 h-6 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M10.7 18.7l1.4-1.4L7.8 13H20v-2H7.8l4.3-4.3-1.4-1.4L4 12z" />
          </svg>
        </button>
        <!-- Logo -->
        <router-link class="flex flex-row items-center space-x-2" to="/app/home">
          <img src="/capgo.webp" alt="logo" class="h-[32px] w-[32px]">
          <span class="text-xl font-medium truncate transition duration-150 font-prompt lg:hidden lg:sidebar-expanded:block 2xl:block text-slate-200 hover:text-white">Capgo</span>
        </router-link>
      </div>

      <!-- Links -->
      <div class="space-y-8">
        <!-- Pages group -->
        <div>
          <h3 class="pl-3 text-xs font-semibold uppercase text-slate-500">
            <span class="hidden w-6 text-center lg:block lg:sidebar-expanded:hidden 2xl:hidden" aria-hidden="true">•••</span>
            <span class="lg:hidden lg:sidebar-expanded:block 2xl:block">{{ t('pages') }}</span>
          </h3>
          <ul class="mt-3">
            <!-- Dashboard -->
            <li class="px-3 py-2 rounded-sm mb-0.5 last:mb-0">
              <router-link class="block truncate transition duration-150 text-slate-200 hover:text-white" :class="(currentRoute.fullPath === '/' || currentRoute.fullPath.includes('app/home')) && 'hover:text-slate-200'" to="/app/home">
                <div class="flex items-center justify-between">
                  <div class="flex items-center">
                    <svg class="w-6 h-6 shrink-0" viewBox="0 0 24 24">
                      <path class="fill-current text-slate-400" :class="(currentRoute.fullPath === '/' || currentRoute.fullPath.includes('app/home')) && '!text-blue-500'" d="M12 0C5.383 0 0 5.383 0 12s5.383 12 12 12 12-5.383 12-12S18.617 0 12 0z" />
                      <path class="fill-current text-slate-600" :class="(currentRoute.fullPath === '/' || currentRoute.fullPath.includes('app/home')) && 'text-blue-600'" d="M12 3c-4.963 0-9 4.037-9 9s4.037 9 9 9 9-4.037 9-9-4.037-9-9-9z" />
                      <path class="fill-current text-slate-400" :class="(currentRoute.fullPath === '/' || currentRoute.fullPath.includes('app/home')) && 'text-blue-200'" d="M12 15c-1.654 0-3-1.346-3-3 0-.462.113-.894.3-1.285L6 6l4.714 3.301A2.973 2.973 0 0112 9c1.654 0 3 1.346 3 3s-1.346 3-3 3z" />
                    </svg>
                    <span class="ml-3 text-sm font-medium duration-200 lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100">{{ t('dashboard') }}</span>
                  </div>
                </div>
              </router-link>
            </li>

            <!-- API Keys -->
            <li class="px-3 py-2 rounded-sm mb-0.5 last:mb-0">
              <router-link class="block truncate transition duration-150 text-slate-200 hover:text-white" :class="(currentRoute.fullPath === '/' || currentRoute.fullPath.includes('apikeys')) && 'hover:text-slate-200'" to="/dashboard/apikeys">
                <div class="flex items-center justify-between">
                  <div class="flex items-center">
                    <i-ion-key-outline class="w-6 text-2xl text-slate-400" :class="(currentRoute.fullPath === '/' || currentRoute.fullPath.includes('apikeys')) && '!text-blue-500'" />
                    <span class="ml-3 text-sm font-medium duration-200 lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100">{{ t('api-keys') }}</span>
                  </div>
                </div>
              </router-link>
            </li>

            <!-- Documentation -->
            <li class="px-3 py-2 rounded-sm mb-0.5 last:mb-0">
              <a class="block truncate transition duration-150 text-slate-200 hover:text-white" target="_blank" rel="noopener" href="https://docs.capgo.app/">
                <div class="flex items-center justify-between">
                  <div class="flex items-center">
                    <i-ion-book-outline class="w-6 text-2xl text-slate-400" />
                    <span class="ml-3 text-sm font-medium duration-200 lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100">{{ t('documentation') }}</span>
                  </div>
                </div>
              </a>
            </li>

            <!-- Discord -->
            <li class="px-3 py-2 rounded-sm mb-0.5 last:mb-0">
              <a class="block truncate transition duration-150 text-slate-200 hover:text-white" target="_blank" rel="noopener" href="https://discord.gg/VnYRvBfgA6">
                <div class="flex items-center justify-between">
                  <div class="flex items-center">
                    <i-ion-logo-discord class="w-6 text-2xl text-slate-400" />
                    <span class="ml-3 text-sm font-medium duration-200 lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100">{{ t('discord') }}</span>
                  </div>
                </div>
              </a>
            </li>
          </ul>
        </div>
      </div>

      <!-- Expand / collapse button -->
      <div class="justify-end hidden pt-3 mt-auto lg:inline-flex 2xl:hidden">
        <div class="px-3 py-2">
          <button @click.prevent="sidebarExpanded = !sidebarExpanded">
            <span class="sr-only">Expand / collapse sidebar</span>
            <svg class="w-6 h-6 fill-current sidebar-expanded:rotate-180" viewBox="0 0 24 24">
              <path class="text-slate-400" d="M19.586 11l-5-5L16 4.586 23.414 12 16 19.414 14.586 18l5-5H7v-2z" />
              <path class="text-slate-600" d="M3 23H1V1h2z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
