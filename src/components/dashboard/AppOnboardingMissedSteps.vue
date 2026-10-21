<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import IconAlertTriangle from '~icons/lucide/alert-triangle'

defineProps<{
  steps: ReadonlyArray<{ id: string, index: number, title: string }>
  selectedId?: string
}>()

const emit = defineEmits<{
  select: [id: string]
}>()

const { t } = useI18n()
</script>

<template>
  <!-- The checklist stays collapsed, so surface steps passed over by out-of-order or AI-driven setup. -->
  <section class="rounded-2xl border border-amber-300 bg-amber-50 p-5 sm:px-6 dark:border-amber-400/30 dark:bg-amber-500/10" data-test="setup-checklist-missed">
    <div class="flex items-start gap-3">
      <IconAlertTriangle class="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
      <div class="min-w-0 flex-1">
        <h2 class="font-semibold text-slate-950 dark:text-white">
          {{ t('setup-checklist-missed-title', { count: steps.length }) }}
        </h2>
        <p class="mt-1 max-w-prose text-sm leading-6 text-slate-700 dark:text-slate-300">
          {{ t('setup-checklist-missed-description') }}
        </p>
        <ul class="mt-3 flex flex-wrap gap-2">
          <li v-for="step in steps" :key="step.id">
            <button
              type="button"
              class="d-btn h-auto min-h-11 border-amber-300 bg-white px-3 py-2 text-left text-sm font-medium text-slate-800 hover:border-amber-400 hover:bg-amber-100 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:border-amber-400/40 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-amber-500/15"
              :class="{ 'border-amber-500 ring-1 ring-amber-500/40': selectedId === step.id }"
              :aria-pressed="selectedId === step.id"
              :data-test="`setup-checklist-missed-${step.id}`"
              @click="emit('select', step.id)"
            >
              <span class="text-xs text-slate-500 dark:text-slate-400" aria-hidden="true">{{ step.index + 1 }}.</span>
              {{ step.title }}
            </button>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
