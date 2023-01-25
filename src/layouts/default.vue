<script setup lang="ts">
import { kPage } from 'konsta/vue'
import { ref } from 'vue'
import Sidebar from '../components/Sidebar.vue'
import Navbar from '../components/Navbar.vue'

const sidebarOpen = ref(false)
</script>

<template>
  <k-page>
    <div class="flex h-screen overflow-hidden bg-white dark:bg-gray-900/90">
      <!-- Sidebar -->
      <Sidebar :sidebar-open="sidebarOpen" @close-sidebar="sidebarOpen = false" />
      <!-- Content area -->
      <div class="relative flex flex-col flex-1 overflow-x-hidden overflow-y-auto">
        <!-- Site header -->
        <Navbar :sidebar-open="sidebarOpen" @toggle-sidebar="sidebarOpen = !sidebarOpen" />
        <main class="w-full overflow-y-hidden max-h-fit">
          <RouterView class="static" />
        </main>
      </div>
    </div>
  </k-page>
</template>
