<script setup lang="ts">
import { Capacitor } from '@capacitor/core'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import IconBack from '~icons/material-symbols/arrow-back-ios-rounded'
import IconMenu from '~icons/material-symbols/menu-rounded'
import { useDisplayStore } from '~/stores/display'
import Banner from './Banner.vue'

const props = defineProps({
  sidebarOpen: {
    type: Boolean,
    default: false,
  },
})

defineEmits(['toggleSidebar'])
const isMobile = ref(Capacitor.isNativePlatform())

const router = useRouter()

const displayStore = useDisplayStore()
function back() {
  if (window.history.length > 2)
    router.back()
  else
    router.push(displayStore.defaultBack)
}
const { t } = useI18n()
</script>

<template>
  <header class="bg-slate-100 backdrop-blur-xl dark:bg-slate-900">
    <div class="px-2 sm:px-4 lg:px-6">
      <div class="flex relative justify-between items-center -mb-px h-16">
        <!-- Header: Left side -->
        <div class="flex items-center space-x-4">
          <div v-if="displayStore.NavTitle && isMobile" class="pr-2">
            <button
              class="flex p-2 rounded-sm dark:text-white focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none text-slate-500 dark:hover:bg-slate-600 hover:bg-slate-300"
              :aria-label="t('button-back')"
              @click="back()"
            >
              <IconBack class="w-6 h-6 fill-current" />
              <span class="hidden md:block">{{ t('button-back') }}</span>
            </button>
          </div>
          <!-- Hamburger button -->
          <button
            class="p-1 rounded-md lg:hidden dark:text-white focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none text-slate-500 dark:hover:text-slate-50 hover:text-slate-600"
            aria-controls="sidebar"
            :aria-expanded="props.sidebarOpen"
            :aria-label="props.sidebarOpen ? t('close-sidebar') : t('open-sidebar')"
            @click.stop="$emit('toggleSidebar')"
          >
            <span class="sr-only">{{ props.sidebarOpen ? t('close-sidebar') : t('open-sidebar') }}</span>
            <IconMenu class="w-6 h-6 fill-current" />
          </button>

          <!-- Title on desktop -->
          <div class="hidden lg:block">
            <div class="flex items-center space-x-2 font-bold md:text-2xl dark:text-white truncate text-md text-dark">
              <nav v-if="$route.path !== '/' && $route.path !== '/app'" class="text-sm font-normal text-slate-600 dark:text-slate-400" aria-label="Breadcrumb">
                <ol class="inline-flex items-center space-x-1">
                  <li>
                    <router-link
                      to="/"
                      class="px-1 rounded-sm hover:underline focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:outline-none first-letter:uppercase"
                    >
                      {{ t('home') }}
                    </router-link>
                  </li>
                  <li v-for="(breadcrumb, i) in displayStore.pathTitle" :key="i" class="flex items-center">
                    <span class="mx-1" aria-hidden="true"> / </span>
                    <router-link
                      :to="breadcrumb.path"
                      class="px-1 rounded-sm hover:underline focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:outline-none first-letter:uppercase"
                    >
                      {{ breadcrumb.name.includes('.') ? breadcrumb.name : t(breadcrumb.name) }}
                    </router-link>
                  </li>
                  <li v-if="displayStore.NavTitle" class="flex items-center">
                    <span class="mx-1" aria-hidden="true"> / </span>
                  </li>
                </ol>
              </nav>
              <span class="first-letter:uppercase">{{ displayStore.NavTitle }}</span>
            </div>
          </div>
        </div>

        <!-- Centered title on mobile -->
        <div class="flex-1 px-4 text-center lg:hidden">
          <div class="font-bold dark:text-white truncate text-md text-dark first-letter:uppercase">
            {{ displayStore.NavTitle }}
          </div>
        </div>

        <!-- Right side: Desktop banner -->
        <div class="hidden lg:flex">
          <Banner desktop />
        </div>

        <!-- Mobile banner in navbar -->
        <div class="lg:hidden">
          <Banner desktop />
        </div>
      </div>
    </div>
  </header>
</template>
