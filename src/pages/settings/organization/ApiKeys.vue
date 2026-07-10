<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

onMounted(() => {
  router.replace('/apikeys')
})
</script>

<template>
  <div />
</template>

<route lang="yaml">
path: /settings/organization/api-keys
meta:
  layout: settings
</route>
