<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Spinner from '~/components/Spinner.vue'

const props = defineProps({
  title: {
    type: String,
    required: true,
  },
  total: {
    type: Number,
    default: undefined,
  },
  unit: {
    type: String,
    default: '',
  },
  lastDayEvolution: {
    type: Number,
    default: undefined,
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
  hasData: {
    type: Boolean,
    default: true,
  },
  noDataMessage: {
    type: String,
    default: undefined,
  },
  errorMessage: {
    type: String,
    default: undefined,
  },
  isDemoData: {
    type: Boolean,
    default: false,
  },
})

const { t } = useI18n()

const showEvolutionBadge = computed(() => props.lastDayEvolution !== undefined && props.lastDayEvolution !== null)
const displayNoDataMessage = computed(() => props.noDataMessage ?? t('no-data'))
</script>

<template>
  <div class="relative col-span-full flex min-h-[24rem] flex-col overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white/95 shadow-[0_20px_60px_-38px_rgba(15,23,42,0.3)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/85 dark:shadow-[0_24px_70px_-42px_rgba(2,6,23,0.72)]">
    <div class="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-br from-slate-50 via-white to-transparent dark:from-slate-800/70 dark:via-slate-900/40 dark:to-transparent" />

    <!-- Header with title and stats -->
    <div class="relative overflow-hidden px-5 pt-5">
      <!-- Custom header slot or default header -->
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0 flex-1">
            <slot name="header">
              <div class="min-w-0">
                <h2 class="text-xl font-semibold leading-tight text-slate-900 dark:text-white sm:text-2xl">
                  {{ title }}
                </h2>
              </div>
            </slot>
          </div>

          <div class="flex items-center gap-2 sm:justify-end">
            <div
              v-if="showEvolutionBadge"
              class="inline-flex justify-center items-center rounded-full px-3 py-1 text-xs font-bold text-white shadow-sm"
              :class="{ 'bg-cyan-500': (lastDayEvolution ?? 0) >= 0, 'bg-amber-500': (lastDayEvolution ?? 0) < 0 }"
            >
              {{ (lastDayEvolution ?? 0) < 0 ? '-' : '+' }}{{ Math.abs(lastDayEvolution ?? 0).toFixed(2) }}%
            </div>
            <div v-else class="inline-flex rounded-full px-3 py-1 text-xs font-semibold opacity-0" aria-hidden="true" />
          </div>
        </div>

        <div v-if="total !== undefined" class="flex items-end gap-2">
          <div class="max-w-full text-3xl font-semibold leading-none tracking-tight break-words text-slate-900 dark:text-white sm:text-4xl">
            {{ total?.toLocaleString() }}
          </div>
          <span v-if="unit" class="pb-1 text-sm font-semibold tracking-[0.2em] text-slate-400 uppercase dark:text-slate-500">
            {{ unit }}
          </span>
        </div>
      </div>
    </div>

    <!-- Chart content area -->
    <div class="relative flex-1 px-5 pb-5 pt-4">
      <!-- Loading state -->
      <div v-if="isLoading" class="flex justify-center items-center h-full">
        <Spinner size="w-24 h-24" />
      </div>

      <!-- Error message -->
      <div
        v-else-if="errorMessage"
        class="flex justify-center items-center px-4 h-full text-sm text-center text-slate-500 dark:text-slate-300"
      >
        {{ errorMessage }}
      </div>

      <!-- Chart slot (renders for both real data and demo data) -->
      <template v-else-if="hasData || isDemoData">
        <slot />
        <!-- Demo data overlay indicator -->
        <div
          v-if="isDemoData"
          class="flex absolute inset-0 flex-col gap-2 justify-center items-center pointer-events-none"
        >
          <div class="py-2 px-4 text-sm font-medium rounded-lg border shadow-lg backdrop-blur-sm bg-white/90 dark:bg-gray-800/90 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700">
            {{ t('demo-data-indicator') }}
          </div>
        </div>
      </template>

      <!-- No data message (only when no real data AND not showing demo) -->
      <div
        v-else
        class="flex justify-center items-center h-full text-sm text-slate-500 dark:text-slate-300"
      >
        {{ displayNoDataMessage }}
      </div>
    </div>
  </div>
</template>
