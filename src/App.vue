<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

const Toast = defineAsyncComponent(() => import('~/components/Toast.vue'))
const DialogV2 = defineAsyncComponent(() => import('~/components/DialogV2.vue'))
</script>

<template>
  <div class="h-full overflow-hidden bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
    <RouterView class="h-full overflow-hidden" />
    <Toast />
    <DialogV2 />
  </div>
</template>
