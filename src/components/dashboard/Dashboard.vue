<script setup lang="ts">
import type { Database } from '~/types/supabase.types'
import { Capacitor } from '@capacitor/core'
import { ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import plusOutline from '~icons/ion/add-outline?width=2em&height=2em'
import AppTable from '~/components/tables/AppTable.vue'
import WelcomeBanner from './WelcomeBanner.vue'

const props = defineProps<{
  apps: Database['public']['Tables']['apps']['Row'][]
  sharedApps: Database['public']['Tables']['apps']['Row'][]
}>()
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
  <div v-else class="h-full pb-4 overflow-hidden">
    <div class="w-full h-full px-4 pt-8 mx-auto mb-8 overflow-y-auto max-w-9xl max-h-fit lg:px-8 sm:px-6">
      <!-- Welcome banner -->
      <WelcomeBanner v-if="props.apps.length === 0 && props.sharedApps.length === 0" />
      <!-- Cards -->
      <Usage v-if="!isLoading" />

      <div class="grid grid-cols-12 gap-6">
        <AppTable :apps="props.apps" :delete-button="true" />
      </div>
    </div>
    <button v-if="!stepsOpen && !isMobile" class="fixed z-20 bg-gray-800 btn btn-circle btn-xl btn-outline right-4-safe bottom-4-safe secondary" @click="stepsOpen = true">
      <plusOutline />
    </button>
  </div>
</template>
