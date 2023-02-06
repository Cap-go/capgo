<script setup lang="ts">
const props = defineProps<{
  label: string
  value: string
  isLink?: boolean
}>()
</script>

<template>
  <div class="border-t border-gray-200" :class="props.isLink ? 'cursor-pointer' : ''">
    <dl class="sm:divide-y sm:divide-gray-200">
      <div class="py-4 flex flex-row justify-between w-full sm:py-5">
        <dt class="text-lg font-medium text-gray-700 dark:text-gray-200">
          {{ props.label }}
        </dt>
        <dd class="mt-1 text-lg text-gray-600 dark:text-gray-200  sm:mt-0">
          {{ props.value }}
        </dd>
      </div>
    </dl>
  </div>
</template>
