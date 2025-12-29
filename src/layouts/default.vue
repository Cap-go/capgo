<script setup lang="ts">
import { ref } from 'vue'
import Navbar from '../components/Navbar.vue'
import PasswordPolicyWarningBanner from '../components/PasswordPolicyWarningBanner.vue'
import Sidebar from '../components/Sidebar.vue'

const sidebarOpen = ref(false)
</script>

<template>
  <div class="flex overflow-hidden h-full bg-slate-800 pt-safe safe-areas">
    <!-- Sidebar -->
    <Sidebar :sidebar-open="sidebarOpen" @close-sidebar="sidebarOpen = false" />
    <!-- Content area -->
    <div class="flex overflow-hidden flex-col flex-1 h-full lg:p-3">
      <div class="flex overflow-hidden flex-col h-full border border-gray-200 lg:rounded-xl lg:shadow-sm dark:border-gray-700 bg-slate-100 dark:bg-slate-900">
        <!-- Password Policy Warning Banner -->
        <PasswordPolicyWarningBanner />
        <!-- Site header -->
        <Navbar :sidebar-open="sidebarOpen" @toggle-sidebar="sidebarOpen = !sidebarOpen" />
        <main class="overflow-hidden w-full h-full">
          <RouterView class="overflow-y-auto h-full grow" />
        </main>
      </div>
    </div>
  </div>
</template>
