<script setup lang="ts">
import { Toaster } from 'vue-sonner'
</script>

<template>
  <Toaster rich-colors close-button position="top-right"
  :toastOptions="{
    style: { background: 'red' },
    class: 'my-toast',
    descriptionClass: 'my-toast-description'
  }" />
</template>
