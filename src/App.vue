<script setup lang="ts">
import { kProvider } from 'konsta/vue'
import { defineAsyncComponent } from 'vue'

const ActionSheet = defineAsyncComponent(() => import('~/components/ActionSheet.vue'))
const Toast = defineAsyncComponent(() => import('~/components/Toast.vue'))
const Dialog = defineAsyncComponent(() => import('~/components/Dialog.vue'))
</script>

<template>
  <kProvider theme="ios">
    <div class="h-full overflow-hidden k-ios bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
      <RouterView class="h-full overflow-hidden" />
      <ActionSheet />
      <Toast />
      <Dialog />
    </div>
  </kProvider>
</template>
