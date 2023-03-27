<script setup lang="ts">
defineProps({
  value: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['update:value'])
</script>

<template>
  <label class="relative inline-flex cursor-pointer items-center">
    <input :value="value" type="checkbox" class="peer sr-only" :checked="value" :disabled="disabled" @change="emit('update:value', value)">
    <div class="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-0.5 after:h-5 after:w-5 after:border after:border-gray-300 dark:border-gray-600 after:rounded-full after:bg-white dark:bg-gray-700 peer-checked:bg-blue-600 after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white" />
  </label>
</template>
