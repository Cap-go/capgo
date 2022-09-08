<script setup lang="ts">
import { IonIcon } from '@ionic/vue'
import { keyOutline } from 'ionicons/icons'
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'

const props = defineProps < {
  sidebarOpen: boolean
}>()
defineEmits(['closeSidebar'])

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
    <div class="fixed inset-0 bg-slate-900 bg-opacity-30 z-40 lg:hidden lg:z-auto transition-opacity duration-200" :class="props.sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'" aria-hidden="true" />

    <!-- Sidebar -->
    <div
      id="sidebar"
      ref="sidebar"
      class="flex flex-col absolute z-40 left-0 top-0 lg:static lg:left-auto lg:top-auto lg:translate-x-0 h-screen overflow-y-scroll lg:overflow-y-auto no-scrollbar w-64 lg:w-20 lg:sidebar-expanded:!w-64 2xl:!w-64 shrink-0 bg-slate-800 p-4 transition-all duration-200 ease-in-out"
      :class="props.sidebarOpen ? 'translate-x-0' : '-translate-x-64'"
    >
      <!-- Sidebar header -->
      <div class="flex justify-between mb-10 pr-3 sm:px-2">
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
        <router-link class="flex flex-row items-center space-x-2" to="/">
          <img src="../../assets/icon-foreground.png" class="h-[32px] w-[32px]">
          <span class="lg:hidden lg:sidebar-expanded:block 2xl:block font-medium text-slate-200 hover:text-white truncate transition duration-150 text-xl">Capgo</span>
        </router-link>
      </div>

      <!-- Links -->
      <div class="space-y-8">
        <!-- Pages group -->
        <div>
          <h3 class="text-xs uppercase text-slate-500 font-semibold pl-3">
            <span class="hidden lg:block lg:sidebar-expanded:hidden 2xl:hidden text-center w-6" aria-hidden="true">•••</span>
            <span class="lg:hidden lg:sidebar-expanded:block 2xl:block">Pages</span>
          </h3>
          <ul class="mt-3">
            <!-- Dashboard -->
            <li class="px-3 py-2 rounded-sm mb-0.5 last:mb-0">
              <a class="block text-slate-200 hover:text-white truncate transition duration-150" :class="(currentRoute.fullPath === '/' || currentRoute.fullPath.includes('app/home')) && 'hover:text-slate-200'" href="/app/home">
                <div class="flex items-center justify-between">
                  <div class="flex items-center">
                    <svg class="shrink-0 h-6 w-6" viewBox="0 0 24 24">
                      <path class="fill-current text-slate-400" :class="(currentRoute.fullPath === '/' || currentRoute.fullPath.includes('app/home')) && '!text-blue-500'" d="M12 0C5.383 0 0 5.383 0 12s5.383 12 12 12 12-5.383 12-12S18.617 0 12 0z" />
                      <path class="fill-current text-slate-600" :class="(currentRoute.fullPath === '/' || currentRoute.fullPath.includes('app/home')) && 'text-blue-600'" d="M12 3c-4.963 0-9 4.037-9 9s4.037 9 9 9 9-4.037 9-9-4.037-9-9-9z" />
                      <path class="fill-current text-slate-400" :class="(currentRoute.fullPath === '/' || currentRoute.fullPath.includes('app/home')) && 'text-blue-200'" d="M12 15c-1.654 0-3-1.346-3-3 0-.462.113-.894.3-1.285L6 6l4.714 3.301A2.973 2.973 0 0112 9c1.654 0 3 1.346 3 3s-1.346 3-3 3z" />
                    </svg>
                    <span class="text-sm font-medium ml-3 lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">Dashboard</span>
                  </div>

                </div>
              </a>
            </li>

            <!-- API Keys -->
            <li class="px-3 py-2 rounded-sm mb-0.5 last:mb-0">
              <a class="block text-slate-200 hover:text-white truncate transition duration-150" :class="(currentRoute.fullPath === '/' || currentRoute.fullPath.includes('apikeys')) && 'hover:text-slate-200'" href="/dashboard/apikeys">
                <div class="flex items-center justify-between">
                  <div class="flex items-center">
                    <IonIcon :icon="keyOutline" class="text-slate-400 w-6 text-2xl" :class="(currentRoute.fullPath === '/' || currentRoute.fullPath.includes('apikeys')) && '!text-blue-500'" />
                    <span class="text-sm font-medium ml-3 lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">API Keys</span>
                  </div>

                </div>
              </a>
            </li>

            <!-- Settings -->
            <li class="px-3 py-2 rounded-sm mb-0.5 last:mb-0">
              <a class="block text-slate-200 hover:text-white truncate transition duration-150" :class="(currentRoute.fullPath === '/' || currentRoute.fullPath.includes('settings')) && 'hover:text-slate-200'" href="/dashboard/settings/account">
                <div class="flex items-center justify-between">
                  <div class="flex items-center">
                    <svg class="shrink-0 h-6 w-6" viewBox="0 0 24 24">
                      <path class="fill-current text-slate-600" :class="currentRoute.fullPath.includes('settings') && 'text-blue-500'" d="M19.714 14.7l-7.007 7.007-1.414-1.414 7.007-7.007c-.195-.4-.298-.84-.3-1.286a3 3 0 113 3 2.969 2.969 0 01-1.286-.3z" />
                      <path class="fill-current text-slate-400" :class="currentRoute.fullPath.includes('settings') && 'text-blue-300'" d="M10.714 18.3c.4-.195.84-.298 1.286-.3a3 3 0 11-3 3c.002-.446.105-.885.3-1.286l-6.007-6.007 1.414-1.414 6.007 6.007z" />
                      <path class="fill-current text-slate-600" :class="currentRoute.fullPath.includes('settings') && 'text-blue-500'" d="M5.7 10.714c.195.4.298.84.3 1.286a3 3 0 11-3-3c.446.002.885.105 1.286.3l7.007-7.007 1.414 1.414L5.7 10.714z" />
                      <path class="fill-current text-slate-400" :class="currentRoute.fullPath.includes('settings') && 'text-blue-300'" d="M19.707 9.292a3.012 3.012 0 00-1.415 1.415L13.286 5.7c-.4.195-.84.298-1.286.3a3 3 0 113-3 2.969 2.969 0 01-.3 1.286l5.007 5.006z" />
                    </svg>
                    <span class="text-sm font-medium ml-3 lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">Settings</span>
                  </div>

                </div>
              </a>
            </li>
          </ul>
        </div>
      </div>

      <!-- Expand / collapse button -->
      <div class="pt-3 hidden lg:inline-flex 2xl:hidden justify-end mt-auto">
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
