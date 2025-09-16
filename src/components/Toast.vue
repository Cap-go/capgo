<script setup lang="ts">
import { Toaster } from 'vue-sonner'
import 'vue-sonner/style.css'

const toastOptions = ref({
  classes: {
    toast: 'top-safe!',
  },
})
</script>

<template>
  <Toaster
    rich-colors close-button position="top-right"
    data-test="toast"
    :toast-options="toastOptions"
  />
</template>
