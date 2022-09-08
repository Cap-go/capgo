<script setup lang="ts">
import { ref } from 'vue'
import Sidebar from '../../partials/Sidebar.vue'
import Navbar from '../../partials/Navbar.vue'
import WelcomeBanner from '../../partials/dashboard/WelcomeBanner.vue'
import { useMainStore } from '~/stores/main'
import Usage from '~/partials/dashboard/Usage.vue'
import TopApps from '~/partials/dashboard/TopApps.vue'
import type { definitions } from '~/types/supabase'
import SharedApps from '~/partials/dashboard/SharedApps.vue'

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
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-white">
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
    </div>
  </div>
</template>
