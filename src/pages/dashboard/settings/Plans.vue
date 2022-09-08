<script>
import { ref } from 'vue'
import Sidebar from '../../../partials/Sidebar.vue'
import Navbar from '../../../partials/Navbar.vue'
import SettingsSidebar from '../../../partials/settings/SettingsSidebar.vue'
import PlansPanel from '../../../partials/settings/PlansPanel.vue'

export default {
  name: 'Apps',
  components: {
    Sidebar,
    Navbar,
    SettingsSidebar,
    PlansPanel,
  },
  setup() {
    const sidebarOpen = ref(false)

    return {
      sidebarOpen,
    }
  },
}
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
        <div class="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-9xl mx-auto">
          <!-- Page header -->
          <div class="mb-8">
            <!-- Title -->
            <h1 class="text-2xl md:text-3xl text-slate-800 font-bold">
              Account Settings ✨
            </h1>
          </div>

          <!-- Content -->
          <div class="bg-white shadow-lg rounded-sm mb-8">
            <div class="flex flex-col md:flex-row md:-mr-px">
              <SettingsSidebar />
              <PlansPanel />
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>
