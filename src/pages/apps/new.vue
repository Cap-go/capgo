<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

// Legacy route: keep `/apps/new` working, but canonicalize to `/app/new`.
router.replace('/app/new')
</script>

<template>
  <div class="flex flex-col justify-center items-center h-full">
    <Spinner size="w-40 h-40" />
  </div>
</template>
