<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Sidebar from '../../../components/Sidebar.vue'
import Navbar from '../../../components/Navbar.vue'
import SettingsSidebar from '../../../components/settings/SettingsSidebar.vue'
import PlansPanel from '../../../components/settings/PlansPanel.vue'

const { t } = useI18n()
const sidebarOpen = ref(false)
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-white safe-zone dark:bg-gray-900/90">
    <!-- Sidebar -->
    <Sidebar :sidebar-open="sidebarOpen" @close-sidebar="sidebarOpen = false" />

    <!-- Content area -->
    <div class="relative flex flex-col flex-1 overflow-x-hidden overflow-y-auto">
      <!-- Site header -->
      <Navbar :sidebar-open="sidebarOpen" @toggle-sidebar="sidebarOpen = !sidebarOpen" />

      <main>
        <div class="w-full px-4 py-8 mx-auto sm:px-6 lg:px-8 max-w-9xl">
          <!-- Page header -->
          <div class="mb-8">
            <!-- Title -->
            <h1 class="text-2xl font-bold md:text-3xl text-slate-800 dark:text-white">
              {{ t('account-settings') }} ✨
            </h1>
          </div>

          <!-- Content -->
          <div class="mb-8 bg-white rounded-sm shadow-lg dark:bg-gray-800">
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
