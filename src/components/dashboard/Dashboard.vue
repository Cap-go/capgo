<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import {
  kFab,
} from 'konsta/vue'
import { useRoute } from 'vue-router'
import { Capacitor } from '@capacitor/core'
import { useI18n } from 'vue-i18n'
import WelcomeBanner from './WelcomeBanner.vue'
import Usage from '~/components/dashboard/Usage.vue'
import TopApps from '~/components/dashboard/TopApps.vue'
import type { Database } from '~/types/supabase.types'
import plusOutline from '~icons/ion/add-outline?width=1em&height=1em'

const props = defineProps<{
  apps: Database['public']['Tables']['apps']['Row'][]
  sharedApps: Database['public']['Tables']['apps']['Row'][]
}>()
const emit = defineEmits(['reloadApp', 'reloadShared'])
const isMobile = Capacitor.isNativePlatform()
const isLoading = ref(false)
const route = useRoute()
const stepsOpen = ref(false)
const { t } = useI18n()

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
    <div class="max-w-9xl mx-auto mb-8 h-full max-h-fit w-full overflow-y-scroll px-4 pt-8 lg:px-8 sm:px-6">
      <!-- Welcome banner -->
      <WelcomeBanner v-if="props.apps.length === 0 && props.sharedApps.length === 0" />
      <!-- Cards -->
      <Usage v-if="!isLoading" />

      <div class="grid grid-cols-12 gap-6">
        <!-- Line chart (Acme Plus) -->
        <!-- Table (Top Channels) -->
        <TopApps :apps="props.apps" :header="t('top-apps')" @reload="emit('reloadApp')" />
        <TopApps v-if="sharedApps.length > 0" :apps="props.sharedApps" :header="t('shared-apps')" @reload="emit('reloadApp')" />
      </div>
    </div>
    <k-fab v-if="!stepsOpen && !isMobile" class="right-4-safe bottom-4-safe secondary fixed z-20" @click="stepsOpen = true">
      <template #icon>
        <component :is="plusOutline" />
      </template>
    </k-fab>
  </div>
</template>
