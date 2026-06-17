<script setup lang="ts">
import Spinner from '~/components/Spinner.vue'

withDefaults(defineProps<{
  label?: string
  size?: string
}>(), {
  label: '',
  size: 'w-16 h-16',
})
</script>

<template>
  <div role="status" aria-live="polite" class="flex min-h-[calc(100dvh-8rem)] w-full flex-col items-center justify-center px-4 py-10 text-center">
    <Spinner :size="size" />
    <p v-if="label" class="mt-4 text-sm font-medium text-gray-500 dark:text-gray-400">
      {{ label }}
    </p>
  </div>
</template>
