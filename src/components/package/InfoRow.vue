<script setup lang="ts">
import debounce from 'lodash.debounce'
import { ref, watch } from 'vue'
const props = defineProps<{
  label: string
  value: string
  editable?: boolean
  isLink?: boolean
}>()
const emit = defineEmits<{
  (event: 'update:value', value: string): void
}>()
const rowInput = ref(props.value)
watch(rowInput, debounce(() => {
  emit('update:value', rowInput.value)
}, 500))
</script>

<template>
  <div class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5 sm:px-6">
    <dt class="text-sm font-medium text-gray-700 dark:text-gray-200">
      {{ props.label }}
    </dt>
    <dd
      class="mt-1 text-sm sm:col-span-2 sm:mt-0"
      :class="{
        'cursor-pointer underline underline-offset-4 text-blue-600 active dark:text-blue-500 font-bold text-dust': props.isLink,
        'text-gray-600 dark:text-gray-200': !props.isLink,
      }"
    >
      <input v-if="editable" v-model="rowInput" class="w-full max-w-xs text-white input input-sm ">
      <span v-else> {{ props.value }} </span>
    </dd>
  </div>
</template>
