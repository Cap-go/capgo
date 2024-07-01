<script setup lang="ts">
import { Toaster } from 'vue-sonner'

const toastOptions = {
  class: 'safe-areas',
}
</script>

<template>
  <Toaster
    rich-colors close-button position="top-right"
    :toast-options="toastOptions"
  />
</template>
