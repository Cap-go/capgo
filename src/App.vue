<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { bentoLoader } from '~/services/bento'

const Toast = defineAsyncComponent(() => import('~/components/Toast.vue'))
const Dialog = defineAsyncComponent(() => import('~/components/Dialog.vue'))
onMounted(() => {
  bentoLoader()
})
</script>

<template>
  <div class="h-full overflow-hidden k-ios bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
    <RouterView class="h-full overflow-hidden" />
    <Toast />
    <Dialog />
  </div>
</template>
