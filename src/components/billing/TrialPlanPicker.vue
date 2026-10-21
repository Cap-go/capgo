<script setup lang="ts">
/**
 * Compact plan list for the trial card / offer flow. Defaults to the onboarding plan;
 * the user can pick Solo, Maker or Team before the schedule is created.
 */
import type { TrialPlanOption } from '~/services/stripe'
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatStripeAmount } from '~/services/stripe'

const props = defineProps<{
  modelValue: string
  options: TrialPlanOption[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [productId: string]
}>()

const { t } = useI18n()
const groupId = useId()

const selected = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value),
})

function priceLabel(option: TrialPlanOption) {
  return formatStripeAmount(option.amount, option.currency)
}
</script>

<template>
  <fieldset class="mt-4 space-y-2" :disabled="disabled" data-test="trial-plan-picker">
    <legend class="text-sm font-medium text-slate-800 dark:text-slate-100">
      {{ t('trial-plan-picker-label') }}
    </legend>
    <p class="text-xs leading-5 text-slate-500 dark:text-slate-400">
      {{ t('trial-plan-picker-hint') }}
    </p>
    <div class="mt-2 space-y-2" role="radiogroup" :aria-label="t('trial-plan-picker-label')">
      <label
        v-for="option in options"
        :key="option.productId"
        class="flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors"
        :class="selected === option.productId
          ? 'border-blue-500 bg-blue-50/80 dark:border-blue-400 dark:bg-blue-950/40'
          : 'border-slate-200 hover:border-slate-300 dark:border-slate-600 dark:hover:border-slate-500'"
        :data-test="`trial-plan-option-${option.planName.toLowerCase()}`"
      >
        <span class="flex min-w-0 items-center gap-2.5">
          <input
            v-model="selected"
            type="radio"
            class="d-radio d-radio-sm d-radio-primary"
            :name="groupId"
            :value="option.productId"
            :disabled="disabled"
          >
          <span class="truncate font-medium text-slate-900 dark:text-white">
            {{ option.planName }}
          </span>
        </span>
        <span class="shrink-0 tabular-nums text-slate-600 dark:text-slate-300">
          {{ priceLabel(option) }}/{{ t('mo') }}
        </span>
      </label>
    </div>
  </fieldset>
</template>
