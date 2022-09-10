<script setup lang="ts">
import { ref } from 'vue'
import { IonIcon } from '@ionic/vue'
import { addOutline } from 'ionicons/icons'
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

const main = useMainStore()
const sidebarOpen = ref(false)

const stepsOpen = ref(false)

const onboardingDone = () => {
  stepsOpen.value = !stepsOpen.value
}
</script>

<template>
  <Steps v-if="stepsOpen" :onboarding="false" @done="onboardingDone" />

  <div v-else class="flex h-screen overflow-hidden bg-white dark:bg-gray-900/90">
    <!-- Sidebar -->
    <Sidebar :sidebar-open="sidebarOpen" @close-sidebar="sidebarOpen = false" />

    <!-- Content area -->
    <div class="relative flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
      <!-- Site header -->
      <Navbar :sidebar-open="sidebarOpen" @toggle-sidebar="sidebarOpen = !sidebarOpen" />

      <main>
        <div class="px-4 sm:px-6 lg:px-8 py-8 mb-8 w-full max-w-9xl mx-auto">
          <!-- Welcome banner -->
          <WelcomeBanner />

          <!-- Cards -->
          <div class="grid grid-cols-12 gap-6">
            <!-- Line chart (Acme Plus) -->
            <Usage />
            <!-- Table (Top Channels) -->
            <TopApps :apps="props.apps" />

            <SharedApps :shared-apps="props.sharedApps" />
          </div>
        </div>
      </main>
      <button
        class="fixed z-90 bottom-10 right-8 bg-blue-600 w-16 h-16 rounded-full drop-shadow-lg flex justify-center items-center text-white text-3xl hover:bg-muted-blue-700 hover:drop-shadow-2xl focus:border-muted-blue-100 focus:border-2"
        @click="stepsOpen = true"
      >
        <IonIcon :icon="addOutline" />
      </button>
    </div>
  </div>
</template>
