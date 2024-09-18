<script setup lang="ts">
import IconBack from '~icons/material-symbols/arrow-back-ios-rounded'
import IconMenu from '~icons/material-symbols/menu-rounded'
import { useI18n } from 'petite-vue-i18n'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useDisplayStore } from '~/stores/display'
import { useMainStore } from '~/stores/main'
import UserMenu from '../components/dashboard/DropdownProfile.vue'
import { getOrgs } from '../services/supabase'
import Banner from './Banner.vue'

const props = defineProps({
  sidebarOpen: {
    type: Boolean,
    default: false,
  },
})

defineEmits(['toggleSidebar'])
const main = useMainStore()

const orgs = ref()
onMounted(async () => {
  if (main.user)
    orgs.value = await getOrgs()
})

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
  <header class="border-b border-slate-200 bg-white/90 backdrop-blur-xl dark:bg-gray-900/90">
    <div class="px-2 lg:px-8 sm:px-6">
      <div class="relative flex items-center justify-between h-16 -mb-px">
        <!-- Header: Left side -->
        <div class="flex">
          <div v-if="displayStore.NavTitle" class="pr-2">
            <button class="flex p-2 rounded hover:bg-slate-600 dark:hover:bg-slate-50 hover:text-white dark:hover:text-slate-500 text-slate-500 dark:text-white" @click="back()">
              <IconBack
                class="w-6 h-6 fill-current"
              />
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

        <div class="lg:absolute lg:inset-y-5 lg:left-1/2 lg:-translate-x-1/2">
          <div class="flex-shrink-0 font-bold text-md text-dark dark:text-white">
            {{ displayStore.NavTitle }}
          </div>
        </div>
        <!-- Header: Right side -->
        <div v-if="main.user" class="flex items-center space-x-3">
          <div class="flex md:mr-2">
            <dropdown-organization />
            <UserMenu align="right" class="ml-2" />
          </div>
        </div>
      </div>
    </div>
    <Banner />
  </header>
</template>
