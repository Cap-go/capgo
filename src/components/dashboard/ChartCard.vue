<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

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
})

const { t } = useI18n()

const showEvolutionBadge = computed(() => props.lastDayEvolution !== undefined && props.lastDayEvolution !== null)
const displayNoDataMessage = computed(() => props.noDataMessage ?? t('no-data'))
</script>

<template>
  <div class="flex flex-col bg-white border rounded-lg shadow-lg col-span-full border-slate-300 sm:col-span-6 xl:col-span-4 dark:border-slate-900 dark:bg-gray-800 h-[460px]">
    <!-- Header with title and stats -->
    <div class="pt-4 px-4 flex items-start justify-between gap-2">
      <!-- Custom header slot or default header -->
      <slot name="header">
        <h2 class="flex-1 min-w-0 text-2xl font-semibold leading-tight text-slate-600 dark:text-white">
          {{ title }}
        </h2>
      </slot>

      <div v-if="total !== undefined" class="flex flex-col items-end text-right shrink-0">
        <!-- Evolution badge -->
        <div
          v-if="showEvolutionBadge"
          class="inline-flex items-center justify-center rounded-full px-2 py-1 text-xs font-bold text-white shadow-lg whitespace-nowrap"
          :class="{ 'bg-emerald-500': (lastDayEvolution ?? 0) >= 0, 'bg-yellow-500': (lastDayEvolution ?? 0) < 0 }"
        >
          {{ (lastDayEvolution ?? 0) < 0 ? '-' : '+' }}{{ Math.abs(lastDayEvolution ?? 0).toFixed(2) }}%
        </div>
        <div v-else class="inline-flex rounded-full px-2 py-1 text-xs font-semibold opacity-0" aria-hidden="true" />

        <!-- Total value -->
        <div class="text-3xl font-bold text-slate-600 dark:text-white">
          {{ total?.toLocaleString() }}<span v-if="unit" class="text-2xl font-normal"> {{ unit }}</span>
        </div>
      </div>
    </div>

    <!-- Chart content area -->
    <div class="w-full h-full p-6 pt-2">
      <!-- Loading state -->
      <div v-if="isLoading" class="flex items-center justify-center h-full">
        <div class="loading loading-spinner loading-lg text-blue-500" />
      </div>

      <!-- Error message -->
      <div
        v-else-if="errorMessage"
        class="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-300 text-center px-4"
      >
        {{ errorMessage }}
      </div>

      <!-- No data message -->
      <div
        v-else-if="!hasData"
        class="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-300"
      >
        {{ displayNoDataMessage }}
      </div>

      <!-- Chart slot -->
      <slot v-else />
    </div>
  </div>
</template>

