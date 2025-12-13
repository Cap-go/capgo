<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ArrowPathIconSolid from '~icons/heroicons/arrow-path-solid'
import CalendarDaysIcon from '~icons/heroicons/calendar-days'
import type { DateRangeMode } from '~/stores/adminDashboard'
import { useAdminDashboardStore } from '~/stores/adminDashboard'

const { t } = useI18n()
const adminStore = useAdminDashboardStore()

function handleRefresh() {
  adminStore.invalidateCache()
  // Trigger a reactive update by toggling a cache-busting timestamp
  // This will cause all components watching adminStore to refetch their data
}

function handleDateRangeChange(event: Event) {
  const target = event.target as HTMLSelectElement
  adminStore.setDateRangeMode(target.value as DateRangeMode)
}
</script>

<template>
  <div class="mb-4">
    <div class="flex items-center justify-end gap-2 flex-nowrap sm:gap-4">
      <!-- Date Range Mode Selector -->
      <div class="relative flex items-center">
        <CalendarDaysIcon class="absolute left-3 w-4 h-4 text-gray-500 pointer-events-none dark:text-gray-400" />
        <select
          :value="adminStore.dateRangeMode"
          class="py-2 pl-9 pr-10 text-sm font-medium text-gray-900 bg-white border border-gray-300 rounded-lg cursor-pointer appearance-none dark:text-white dark:bg-gray-700 dark:border-gray-600 hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:hover:bg-gray-600 dark:focus:ring-blue-400"
          @change="handleDateRangeChange"
        >
          <option value="30day">
            {{ t('30-days') }}
          </option>
          <option value="90day">
            {{ t('90-days') }}
          </option>
          <option value="quarter">
            {{ t('last-quarter') }}
          </option>
          <option value="6month">
            {{ t('last-6-months') }}
          </option>
          <option value="12month">
            {{ t('last-12-months') }}
          </option>
        </select>
        <svg class="absolute right-3 w-4 h-4 text-gray-500 pointer-events-none dark:text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      <!-- Reload Button -->
      <button
        type="button"
        class="flex items-center justify-center w-8 h-8 text-gray-700 transition-colors bg-white border border-gray-300 rounded-lg cursor-pointer sm:w-9 sm:h-9 dark:text-gray-200 dark:bg-gray-700 dark:border-gray-600 hover:text-gray-900 hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:hover:bg-gray-600 dark:hover:text-white dark:focus:ring-blue-400"
        :aria-label="t('reload')"
        @click="handleRefresh"
      >
        <ArrowPathIconSolid class="w-4 h-4" />
      </button>
    </div>
  </div>
</template>
