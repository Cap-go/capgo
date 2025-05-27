<script setup lang="ts">
import { Capacitor } from '@capacitor/core'
import { useI18n } from 'petite-vue-i18n'
import { ref } from 'vue'
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
    <div class="px-2 lg:px-8 sm:px-6">
      <div class="relative flex items-center justify-between h-16 -mb-px">
        <!-- Header: Left side -->
        <div class="flex items-center">
          <div v-if="displayStore.NavTitle && isMobile" class="pr-2">
            <button class="flex p-2 rounded-sm hover:bg-slate-600 dark:hover:bg-slate-50 hover:text-white dark:hover:text-slate-500 text-slate-500 dark:text-white" @click="back()">
              <IconBack class="w-6 h-6 fill-current" />
              <span class="hidden md:block">{{ t('button-back') }}</span>
            </button>
          </div>
          <!-- Hamburger button -->
          <button
            class="text-slate-500 lg:hidden dark:text-white hover:text-slate-600 dark:hover:text-slate-50"
            aria-controls="sidebar" :aria-expanded="props.sidebarOpen" @click.stop="$emit('toggleSidebar')"
          >
            <span class="sr-only">{{ t('open-sidebar') }}</span>
            <IconMenu class="w-6 h-6 fill-current" />
          </button>
        </div>

        <!-- Centered title -->
        <div class="flex-1 px-4 text-center lg:text-left">
          <div class="font-bold truncate text-md md:text-2xl text-dark dark:text-white">
            {{ displayStore.NavTitle }}
          </div>
        </div>

        <!-- Placeholder for right side to maintain layout -->
        <div class="w-[72px] lg:w-[88px]" />
      </div>
    </div>
    <Banner />
  </header>
</template>
