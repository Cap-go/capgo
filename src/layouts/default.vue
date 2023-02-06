<script setup lang="ts">
import { kPage } from 'konsta/vue'
import { ref } from 'vue'
import Sidebar from '../components/Sidebar.vue'
import Navbar from '../components/Navbar.vue'

const sidebarOpen = ref(false)
</script>

<template>
  <k-page class="">
    <div class="safe-areas overflow-hidden flex bg-white dark:bg-gray-900/90">
      <!-- Sidebar -->
      <Sidebar :sidebar-open="sidebarOpen" @close-sidebar="sidebarOpen = false" />
      <!-- Content area -->
      <div class="relative flex overscroll-none overflow-hidden flex-col flex-1">
        <!-- Site header -->
        <Navbar :sidebar-open="sidebarOpen" @toggle-sidebar="sidebarOpen = !sidebarOpen" />
        <main class="w-full min-h-screen overscroll-none">
          <RouterView class="" />
        </main>
      </div>
    </div>
  </k-page>
</template>
