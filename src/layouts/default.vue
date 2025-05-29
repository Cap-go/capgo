<script setup lang="ts">
import { ref } from 'vue'
import Navbar from '../components/Navbar.vue'
import Sidebar from '../components/Sidebar.vue'

const sidebarOpen = ref(false)
</script>

<template>
  <div class="flex h-full overflow-hidden bg-slate-800 pt-safe safe-areas">
    <!-- Sidebar -->
    <Sidebar :sidebar-open="sidebarOpen" @close-sidebar="sidebarOpen = false" />
    <!-- Content area -->
    <div class="flex flex-col flex-1 h-full overflow-hidden lg:p-3">
      <div class="flex flex-col h-full bg-slate-100 dark:bg-slate-900 border dark:border-gray-700 border-gray-200 overflow-hidden lg:rounded-xl lg:shadow-sm">
        <!-- Site header -->
        <Navbar :sidebar-open="sidebarOpen" @toggle-sidebar="sidebarOpen = !sidebarOpen" />
        <main class="w-full h-full overflow-hidden">
          <RouterView class="h-full overflow-y-auto grow" />
        </main>
      </div>
    </div>
  </div>
</template>
