<script setup lang="ts">
import { Toaster } from 'vue-sonner'

const toastOptions = ref({
  classes: {
    toast: 'top-safe!',
  },
})
</script>

<template>
  <Toaster
    rich-colors close-button position="top-right"
    :toast-options="toastOptions"
  />
</template>
