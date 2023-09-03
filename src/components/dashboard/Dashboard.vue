<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import {
  kFab,
} from 'konsta/vue'
import { useRoute } from 'vue-router'
import { Capacitor } from '@capacitor/core'
import WelcomeBanner from './WelcomeBanner.vue'
import Usage from '~/components/dashboard/Usage.vue'
import TopApps from '~/components/dashboard/TopApps.vue'
import SharedApps from '~/components/dashboard/SharedApps.vue'
import type { Database } from '~/types/supabase.types'
import plusOutline from '~icons/ion/add-outline?width=1em&height=1em'

interface ChannelUserApp {
  app_id: Database['public']['Tables']['apps']['Row']
  channel_id: Database['public']['Tables']['channels']['Row'] & {
    version: Database['public']['Tables']['app_versions']['Row']
  }
}
const props = defineProps<{
  apps: Database['public']['Tables']['apps']['Row'][]
  sharedApps: (Database['public']['Tables']['channel_users']['Row'])[] & ChannelUserApp[]
}>()
const emit = defineEmits(['reloadApp', 'reloadShared'])
const isMobile = Capacitor.isNativePlatform()
const isLoading = ref(false)
const route = useRoute()
const stepsOpen = ref(false)

function onboardingDone() {
  stepsOpen.value = !stepsOpen.value
}
watchEffect(async () => {
  if (route.path === '/app/home')
    isLoading.value = false

  else
    isLoading.value = true
})
</script>

<template>
  <Steps v-if="stepsOpen" :onboarding="false" @done="onboardingDone" />
  <div v-else class="h-full pb-4">
    <div class="max-w-9xl mx-auto mb-8 h-full max-h-fit w-full overflow-y-auto px-4 pt-8 lg:px-8 sm:px-6">
      <!-- Welcome banner -->
      <WelcomeBanner v-if="props.apps.length === 0 && props.sharedApps.length === 0" />
      <!-- Cards -->
      <Usage v-if="!isLoading" />

      <div class="grid grid-cols-12 gap-6">
        <!-- Line chart (Acme Plus) -->
        <!-- Table (Top Channels) -->
        <TopApps :apps="props.apps" @reload="emit('reloadApp')" />

        <SharedApps v-if="props.sharedApps.length" :shared-apps="props.sharedApps" @reload="emit('reloadShared')" />
      </div>
    </div>
    <k-fab v-if="!stepsOpen && !isMobile" class="right-4-safe bottom-4-safe secondary fixed z-20" @click="stepsOpen = true">
      <template #icon>
        <component :is="plusOutline" />
      </template>
    </k-fab>
  </div>
</template>
