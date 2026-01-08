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
  <div class="flex flex-col col-span-full bg-white rounded-lg border shadow-lg sm:col-span-6 xl:col-span-4 dark:bg-gray-800 border-slate-300 h-[460px] dark:border-slate-900">
    <!-- Header with title and stats -->
    <div class="flex gap-2 justify-between items-start px-4 pt-4">
      <!-- Custom header slot or default header -->
      <slot name="header">
        <h2 class="flex-1 min-w-0 text-2xl font-semibold leading-tight dark:text-white text-slate-600">
          {{ title }}
        </h2>
      </slot>

      <div v-if="total !== undefined" class="flex flex-col items-end text-right shrink-0">
        <!-- Evolution badge -->
        <div
          v-if="showEvolutionBadge"
          class="inline-flex justify-center items-center py-1 px-2 text-xs font-bold text-white whitespace-nowrap rounded-full shadow-lg"
          :class="{ 'bg-emerald-500': (lastDayEvolution ?? 0) >= 0, 'bg-yellow-500': (lastDayEvolution ?? 0) < 0 }"
        >
          {{ (lastDayEvolution ?? 0) < 0 ? '-' : '+' }}{{ Math.abs(lastDayEvolution ?? 0).toFixed(2) }}%
        </div>
        <div v-else class="inline-flex py-1 px-2 text-xs font-semibold rounded-full opacity-0" aria-hidden="true" />

        <!-- Total value -->
        <div class="text-3xl font-bold dark:text-white text-slate-600">
          {{ total?.toLocaleString() }}<span v-if="unit" class="text-2xl font-normal"> {{ unit }}</span>
        </div>
      </div>
    </div>

    <!-- Chart content area -->
    <div class="relative p-6 pt-2 w-full h-full">
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
