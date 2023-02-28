<script setup lang="ts">
defineProps({
  value: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['update:value'])
</script>

<template>
  <label class="relative inline-flex items-center cursor-pointer">
    <input :value="value" type="checkbox" class="sr-only peer" :checked="value" :disabled="disabled" @change="emit('update:value', value)">
    <div class="w-11 h-6 bg-gray-200 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600" />
  </label>
</template>
