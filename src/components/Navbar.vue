<script setup lang="ts">
import UserMenu from '../components/dashboard/DropdownProfile.vue'
import Banner from './Banner.vue'

const props = defineProps({
  sidebarOpen: {
    type: Boolean,
    default: false,
  },
})
defineEmits(['toggleSidebar'])
</script>

<template>
  <header class="sticky top-0 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl border-b border-slate-200 z-30">
    <div class="px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between h-16 -mb-px">
        <!-- Header: Left side -->
        <div class="flex">
          <!-- Hamburger button -->
          <button class="text-slate-500 hover:text-slate-600 dark:text-white dark:hover:text-slate-50 lg:hidden" aria-controls="sidebar" :aria-expanded="props.sidebarOpen" @click.stop="$emit('toggleSidebar')">
            <span class="sr-only">Open sidebar</span>
            <svg class="w-6 h-6 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <rect x="4" y="5" width="16" height="2" />
              <rect x="4" y="11" width="16" height="2" />
              <rect x="4" y="17" width="16" height="2" />
            </svg>
          </button>
        </div>

        <!-- Header: Right side -->
        <div class="flex items-center space-x-3">
          <UserMenu align="right" />
        </div>
      </div>
    </div>
    <Banner />
  </header>
</template>
