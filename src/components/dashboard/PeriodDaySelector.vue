<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

export type PeriodDayOption = 1 | 3 | 7 | 30

const props = withDefaults(defineProps<{
  modelValue: PeriodDayOption
  labels?: Partial<Record<PeriodDayOption, string>>
}>(), {
  labels: () => ({}),
})

const emit = defineEmits<{
  'update:modelValue': [value: PeriodDayOption]
}>()

const { t } = useI18n()
const options: PeriodDayOption[] = [1, 3, 7, 30]
const defaultLabels: Record<PeriodDayOption, string> = {
  1: 'one-day',
  3: 'three-days',
  7: 'seven-days',
  30: 'thirty-days',
}

const selectedLabel = computed(() => props.labels[props.modelValue] ?? defaultLabels[props.modelValue])

function select(option: PeriodDayOption) {
  if (option !== props.modelValue)
    emit('update:modelValue', option)
}
</script>

<template>
  <fieldset class="d-join shrink-0">
    <legend class="sr-only">
      {{ t('selected-period') }}: {{ t(selectedLabel) }}
    </legend>
    <button
      v-for="option in options"
      :key="option"
      type="button"
      :aria-pressed="props.modelValue === option"
      class="d-btn d-btn-sm d-join-item min-w-12"
      :class="props.modelValue === option ? 'd-btn-primary' : 'd-btn-outline'"
      @click="select(option)"
    >
      {{ t(props.labels[option] ?? defaultLabels[option]) }}
    </button>
  </fieldset>
</template>
