<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute('/app/[app].logs.raw')
const appId = computed(() => String(route.params.app))
</script>

<template>
  <div class="mt-0 md:mt-8">
    <div class="w-full h-full px-0 pt-0 mx-auto mb-8 overflow-y-auto sm:px-6 md:pt-8 lg:px-8 max-w-9xl max-h-fit">
      <div class="flex flex-col overflow-hidden overflow-y-auto bg-white border shadow-lg md:rounded-lg dark:bg-gray-800 border-slate-300 dark:border-slate-900">
        <LogTable :app-id="appId" />
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: app
</route>
