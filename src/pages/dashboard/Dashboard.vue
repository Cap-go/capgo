<script setup lang="ts">
import { ref } from 'vue'
import Sidebar from '../../partials/Sidebar.vue'
import Navbar from '../../partials/Navbar.vue'
import WelcomeBanner from '../../partials/dashboard/WelcomeBanner.vue'
import DashboardCard01 from '../../partials/dashboard/DashboardCard01.vue'
import DashboardCard02 from '../../partials/dashboard/DashboardCard02.vue'
import DashboardCard03 from '../../partials/dashboard/DashboardCard03.vue'
import DashboardCard07 from '../../partials/dashboard/DashboardCard07.vue'
import { useMainStore } from '~/stores/main'

const main = useMainStore()
const sidebarOpen = ref(false)
</script>

<template>
  <div class="flex h-screen overflow-hidden">
    <!-- Sidebar -->
    <Sidebar :sidebar-open="sidebarOpen" @close-sidebar="sidebarOpen = false" />

    <!-- Content area -->
    <div class="relative flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
      <!-- Site header -->
      <Navbar :sidebar-open="sidebarOpen" @toggle-sidebar="sidebarOpen = !sidebarOpen" />

      <main>
        <div class="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-9xl mx-auto">
          <!-- Welcome banner -->
          <WelcomeBanner />

          <!-- Cards -->
          <div class="grid grid-cols-12 gap-6">
            <!-- Line chart (Acme Plus) -->
            <DashboardCard01 />
            <!-- Line chart (Acme Advanced) -->
            <DashboardCard02 />
            <!-- Line chart (Acme Professional) -->
            <DashboardCard03 />
            <!-- Table (Top Channels) -->
            <DashboardCard07 />
          </div>
        </div>
      </main>
    </div>
  </div>
</template>
