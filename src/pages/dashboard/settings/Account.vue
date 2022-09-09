<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Sidebar from '../../../components/Sidebar.vue'
import Navbar from '../../../components/Navbar.vue'
import SettingsSidebar from '../../../components/settings/SettingsSidebar.vue'
import AccountPanel from '../../../components/settings/AccountPanel.vue'

const { t } = useI18n()
const sidebarOpen = ref(false)
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-white dark:bg-gray-900/90">
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
            <h1 class="text-2xl md:text-3xl text-slate-800 font-bold dark:text-white">
              {{ t('settings') }} ⚙️
            </h1>
          </div>

          <!-- Content -->
          <div class="bg-white dark:bg-gray-800 shadow-lg rounded-sm mb-8">
            <div class="flex flex-col md:flex-row md:-mr-px">
              <SettingsSidebar />
              <AccountPanel />
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>
