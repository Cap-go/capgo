<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Sidebar from '../components/Sidebar.vue'
import SettingsSidebar from '../components/settings/SettingsSidebar.vue'
import Navbar from '../components/Navbar.vue'

const { t } = useI18n()
const sidebarOpen = ref(false)
</script>

<template>
  <div class="flex h-full overflow-hidden bg-white pt-safe dark:bg-gray-900/90 safe-areas">
    <!-- Sidebar -->
    <Sidebar :sidebar-open="sidebarOpen" @close-sidebar="sidebarOpen = false" />
    <!-- Content area -->
    <div class="flex flex-col flex-1 h-full overflow-hidden">
      <!-- Site header -->
      <Navbar :sidebar-open="sidebarOpen" @toggle-sidebar="sidebarOpen = !sidebarOpen" />
      <main class="w-full h-full overflow-hidden">
        <div class="w-full h-full px-4 py-8 mx-auto sm:px-6 lg:px-8 max-w-9xl">
          <!-- Page header -->
          <div class="mb-8">
            <!-- Title -->
            <h1 class="text-2xl font-bold md:text-3xl text-slate-800 dark:text-white">
              {{ t('settings') }}
            </h1>
          </div>

          <!-- Content -->
          <div class="h-full mb-8 bg-white rounded-sm shadow-lg dark:bg-gray-800">
            <div class="flex flex-col h-full md:flex-row md:-mr-px">
              <SettingsSidebar />
              <RouterView class="h-full overflow-y-scroll" />
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>
