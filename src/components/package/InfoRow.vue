<script setup lang="ts">
const props = defineProps<{
  label: string
  value: string
  isLink?: boolean
}>()
</script>

<template>
  <div class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5 sm:px-6">
    <dt class="text-sm font-medium text-gray-700 dark:text-gray-200">
      {{ props.label }}
    </dt>
    <dd class="mt-1 text-sm text-gray-600 dark:text-gray-200 sm:col-span-2 sm:mt-0" :class="{ 'cursor-pointer underline underline-offset-8': props.isLink }">
      {{ props.value }}
    </dd>
  </div>
</template>
