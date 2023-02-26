<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import UserMenu from '../components/dashboard/DropdownProfile.vue'
import Banner from './Banner.vue'
import { useDisplayStore } from '~/stores/display'
import IconBack from '~icons/material-symbols/arrow-back-ios-rounded'
import IconMenu from '~icons/material-symbols/menu-rounded'

const props = defineProps({
  sidebarOpen: {
    type: Boolean,
    default: false,
  },
})

defineEmits(['toggleSidebar'])
const router = useRouter()

const displayStore = useDisplayStore()
const back = () => {
  if (window.history.length > 2)
    router.back()
  else
    router.push(displayStore.defaultBack)
}
const { t } = useI18n()
</script>

<template>
  <div>
    <header class="border-b bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl border-slate-200">
      <div class="px-4 sm:px-6 lg:px-8">
        <div class="relative flex items-center justify-between h-16 -mb-px">
          <!-- Header: Left side -->
          <div class="flex">
            <div v-if="displayStore.NavTitle" class="pr-2">
              <button class="flex" @click="back()">
                <IconBack class="w-6 h-6 fill-current text-slate-500 hover:text-slate-600 dark:text-white dark:hover:text-slate-50" />
                <span class="hidden text-dark dark:text-white md:block">{{ t('button-back') }}</span>
              </button>
            </div>
            <!-- Hamburger button -->
            <button class="text-slate-500 hover:text-slate-600 dark:text-white dark:hover:text-slate-50 lg:hidden" aria-controls="sidebar" :aria-expanded="props.sidebarOpen" @click.stop="$emit('toggleSidebar')">
              <span class="sr-only">{{ t('open-sidebar') }}</span>
              <IconMenu class="w-6 h-6 fill-current" />
            </button>
          </div>

          <div class="lg:absolute lg:-translate-x-1/2 lg:inset-y-5 lg:left-1/2">
            <div class="flex-shrink-0 font-bold dark:text-white text-md text-dark">
              {{ displayStore.NavTitle }}
            </div>
          </div>
          <!-- Header: Right side -->
          <div class="flex items-center space-x-3">
            <UserMenu align="right" />
          </div>
        </div>
      </div>
      <Banner />
    </header>
  </div>
</template>
