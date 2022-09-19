<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { IonIcon } from '@ionic/vue'
import { addOutline } from 'ionicons/icons'
import { useRoute } from 'vue-router'
import Sidebar from '../../components/Sidebar.vue'
import Navbar from '../../components/Navbar.vue'
import WelcomeBanner from '../../components/dashboard/WelcomeBanner.vue'
import Steps from '../onboarding/Steps.vue'
import { useMainStore } from '~/stores/main'
import Usage from '~/components/dashboard/Usage.vue'
import TopApps from '~/components/dashboard/TopApps.vue'
import type { definitions } from '~/types/supabase'
import SharedApps from '~/components/dashboard/SharedApps.vue'

interface ChannelUserApp {
  app_id: definitions['apps']
  channel_id: definitions['channels'] & {
    version: definitions['app_versions']
  }
}
const props = defineProps<{
  apps: definitions['apps'][]
  sharedApps: (definitions['channel_users'])[] & ChannelUserApp[]
}>()

const isLoading = ref(false)
const route = useRoute()
const main = useMainStore()
const sidebarOpen = ref(false)

const stepsOpen = ref(false)

const onboardingDone = () => {
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

  <div v-else class="flex h-screen overflow-hidden bg-white dark:bg-gray-900/90">
    <!-- Sidebar -->
    <Sidebar :sidebar-open="sidebarOpen" @close-sidebar="sidebarOpen = false" />

    <!-- Content area -->
    <div class="relative flex flex-col flex-1 overflow-x-hidden overflow-y-auto">
      <!-- Site header -->
      <Navbar :sidebar-open="sidebarOpen" @toggle-sidebar="sidebarOpen = !sidebarOpen" />

      <main>
        <div class="w-full px-4 py-8 mx-auto mb-8 sm:px-6 lg:px-8 max-w-9xl">
          <!-- Welcome banner -->
          <WelcomeBanner />

          <!-- Cards -->
          <div class="grid grid-cols-12 gap-6">
            <!-- Line chart (Acme Plus) -->
            <Usage v-if="!isLoading" />
            <!-- Table (Top Channels) -->
            <TopApps :apps="props.apps" />

            <SharedApps :shared-apps="props.sharedApps" />
          </div>
        </div>
      </main>
      <button
        class="fixed flex items-center justify-center w-16 h-16 text-3xl text-white bg-blue-600 rounded-full z-90 bottom-10 right-8 drop-shadow-lg hover:bg-muted-blue-700 hover:drop-shadow-2xl focus:border-muted-blue-100 focus:border-2"
        @click="stepsOpen = true"
      >
        <IonIcon :icon="addOutline" />
      </button>
    </div>
  </div>
</template>
