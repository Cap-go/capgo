<script setup lang="ts">
import IconSearch from '~icons/heroicons/magnifying-glass'

interface Props {
  modelValue: string
  placeholder?: string
  disabled?: boolean
  class?: string
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Search...',
  disabled: false,
  class: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const localValue = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value),
})
</script>

<template>
  <div class="relative w-full">
    <input
      v-model="localValue"
      type="text"
      :placeholder="placeholder"
      :disabled="disabled"
      class="w-full pl-10 d-input" :class="[props.class]"
    >
    <IconSearch class="absolute w-4 h-4 text-gray-400 transform -translate-y-1/2 left-3 top-1/2" />
  </div>
</template>
