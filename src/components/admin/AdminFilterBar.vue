<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DateRangeMode } from '~/stores/adminDashboard'
import { useAdminDashboardStore } from '~/stores/adminDashboard'

const { t } = useI18n()
const adminStore = useAdminDashboardStore()

// Date range modes
const dateRangeModes: { value: DateRangeMode, label: string }[] = [
  { value: 'billing', label: 'billing-period' },
  { value: '30day', label: '30-days' },
  { value: '90day', label: '90-days' },
  { value: 'custom', label: 'custom-range' },
]

const dateRangeModeModel = computed({
  get: () => adminStore.dateRangeMode,
  set: value => adminStore.setDateRangeMode(value),
})

// Format date for display
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const dateRangeDisplay = computed(() => {
  const { start, end } = adminStore.activeDateRange
  return `${formatDate(start)} - ${formatDate(end)}`
})

function handleRefresh() {
  adminStore.invalidateCache()
  window.location.reload()
}
</script>

<template>
  <div class="flex gap-4 justify-between items-end p-4 mb-6 bg-white rounded-lg border shadow-sm border-slate-200 dark:bg-gray-800 dark:border-gray-700">
    <!-- Date range mode selector -->
    <div class="flex gap-3 items-end">
      <div class="flex flex-col">
        <label class="mb-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
          {{ t('date-range') }}
        </label>
        <select
          v-model="dateRangeModeModel"
          class="px-3 py-2 text-sm bg-white rounded-md border transition-colors border-slate-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option v-for="mode in dateRangeModes" :key="mode.value" :value="mode.value">
            {{ t(mode.label) }}
          </option>
        </select>
      </div>

      <!-- Date range display -->
      <div class="flex flex-col">
        <label class="mb-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
          {{ t('selected-period') }}
        </label>
        <div class="flex items-center px-3 py-2 text-sm font-medium rounded-md border bg-slate-50 border-slate-300 text-slate-700 dark:bg-gray-700 dark:border-gray-600 dark:text-slate-200">
          {{ dateRangeDisplay }}
        </div>
      </div>
    </div>

    <!-- Refresh button -->
    <button
      class="flex gap-2 items-center px-4 py-2 text-sm font-medium text-white rounded-md transition-colors bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      @click="handleRefresh"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      {{ t('refresh') }}
    </button>
  </div>
</template>
