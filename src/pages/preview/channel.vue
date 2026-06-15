<script setup lang="ts">
import { Capacitor } from '@capacitor/core'
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import IconSmartphone from '~icons/lucide/smartphone'

const router = useRouter()

onMounted(() => {
  if (!Capacitor.isNativePlatform())
    return

  router.replace({
    path: '/scan',
    query: { preview: window.location.href },
  })
})
</script>

<template>
  <div class="flex flex-col items-center justify-center min-h-screen gap-4 px-6 text-center bg-slate-950 text-white">
    <IconSmartphone class="w-14 h-14 text-blue-400" />
    <h1 class="text-xl font-semibold">
      Open this preview in Capgo
    </h1>
    <p class="max-w-sm text-sm text-slate-300">
      Install or open the Capgo mobile app on this device to start this preview.
    </p>
  </div>
</template>

<route lang="yaml">
meta:
  layout: naked
</route>
