<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import { reactive, ref, watch } from 'vue'

const props = defineProps<{
  label: string
  value?: string
  editable?: boolean
  isLink?: boolean
  readonly?: boolean
}>()

const emit = defineEmits<{
  (event: 'update:value', value: string | undefined): void
  (event: 'delete', key: string): void
}>()

const computedValue = reactive({ value: props.value })
const rowInput = ref(props.value)
watch(rowInput, useDebounceFn(() => {
  emit('update:value', rowInput.value)
}, 500))
</script>

<template>
  <div class="px-4 py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 sm:py-5">
    <dl>
      <dt class="text-sm font-medium text-gray-700 dark:text-gray-200 first-letter:uppercase">
        {{ props.label }}
      </dt>
    </dl>
    <dd
      class="mt-1 text-sm sm:col-span-2 sm:mt-0"
      :class="{
        'cursor-pointer underline underline-offset-4 text-blue-600 active dark:text-blue-500 font-bold text-dust': props.isLink,
        'text-gray-600 dark:text-gray-200': !props.isLink,
      }"
    >
      <div class="flex flex-row">
        <input v-if="editable" id="inforow-input" v-model="rowInput" class="block w-full p-1 text-gray-900 bg-white border border-gray-300 rounded-lg md:w-1/2 dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 sm:text-xs dark:text-white focus:ring-blue-500 dark:focus:border-blue-500 dark:focus:ring-blue-500 dark:placeholder-gray-400" :readonly="!!props.readonly">
        <span v-else> {{ computedValue.value }} </span>
        <div style="margin-left: 0">
          <slot name="start" />
        </div>
        <div style="margin-left: auto">
          <slot />
        </div>
      </div>
    </dd>
  </div>
</template>
