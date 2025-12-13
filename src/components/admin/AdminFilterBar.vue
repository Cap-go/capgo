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
  <div class="flex flex-wrap gap-4 justify-between items-center p-5 mb-6 rounded-lg shadow-sm bg-base-100">
    <div class="flex flex-wrap gap-4 items-center">
      <!-- Date Range Mode Selector -->
      <div class="form-control w-full max-w-xs">
        <label class="label">
          <span class="label-text">{{ t('date-range') }}</span>
        </label>
        <select v-model="dateRangeModeModel" class="w-full select select-bordered">
          <option v-for="mode in dateRangeModes" :key="mode.value" :value="mode.value">
            {{ t(mode.label) }}
          </option>
        </select>
      </div>

      <!-- Selected Period Display -->
      <div class="form-control w-full max-w-xs">
        <label class="label">
          <span class="label-text">{{ t('selected-period') }}</span>
        </label>
        <div class="flex items-center px-4 py-3 font-medium rounded-lg bg-base-200">
          {{ dateRangeDisplay }}
        </div>
      </div>
    </div>

    <!-- Refresh Button -->
    <button class="gap-2 btn btn-primary" @click="handleRefresh">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      {{ t('refresh') }}
    </button>
  </div>
</template>
