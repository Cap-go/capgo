<script setup lang="ts">
import { kPage } from 'konsta/vue'
</script>

<template>
  <k-page>
    <div class="flex h-screen overflow-hidden bg-white dark:bg-gray-900/90">
      <main class="w-full h-full overflow-y-hidden">
        <RouterView class="static" />
      </main>
    </div>
  </k-page>
</template>
