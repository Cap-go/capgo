<script setup lang="ts">
import { kApp } from 'konsta/vue'
import ActionSheet from '~/components/ActionSheet.vue'
import Toast from '~/components/Toast.vue'
import Dialog from '~/components/Dialog.vue'
</script>

<template>
  <k-app theme="ios">
    <RouterView class="bg-white/90 dark:bg-gray-900/90" />
    <ActionSheet />
    <Toast />
    <Dialog />
  </k-app>
</template>
