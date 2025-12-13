<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ArrowPathIconSolid from '~icons/heroicons/arrow-path-solid'
import CalendarDaysIcon from '~icons/heroicons/calendar-days'
import ClockIcon from '~icons/heroicons/clock'
import { useAdminDashboardStore } from '~/stores/adminDashboard'

const { t } = useI18n()
const adminStore = useAdminDashboardStore()

function handleRefresh() {
  adminStore.invalidateCache()
  window.location.reload()
}
</script>

<template>
  <div class="mb-4">
    <div class="flex items-center justify-end gap-2 flex-nowrap sm:gap-4">
      <!-- Date Range Mode Selector -->
      <div class="flex items-center p-1 space-x-1 bg-gray-200 rounded-lg dark:bg-gray-800">
        <button
          class="flex gap-0.5 justify-center items-center py-1 px-2 text-xs font-medium text-center whitespace-nowrap rounded-md transition-colors cursor-pointer sm:gap-1.5 sm:px-3"
          :class="[
            adminStore.dateRangeMode === '30day'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white',
          ]"
          :aria-label="t('30-days')"
          @click="adminStore.setDateRangeMode('30day')"
        >
          <CalendarDaysIcon class="w-4 h-4" />
          <span class="hidden sm:inline">{{ t('30-days') }}</span>
        </button>
        <button
          class="flex gap-0.5 justify-center items-center py-1 px-2 text-xs font-medium text-center whitespace-nowrap rounded-md transition-colors cursor-pointer sm:gap-1.5 sm:px-3"
          :class="[
            adminStore.dateRangeMode === '90day'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white',
          ]"
          :aria-label="t('90-days')"
          @click="adminStore.setDateRangeMode('90day')"
        >
          <ClockIcon class="w-4 h-4" />
          <span class="hidden sm:inline">{{ t('90-days') }}</span>
        </button>
      </div>

      <!-- Reload Button -->
      <button
        type="button"
        class="flex items-center justify-center w-8 h-8 text-gray-700 transition-colors bg-white rounded-md shadow-sm cursor-pointer sm:w-9 sm:h-9 dark:text-gray-200 dark:bg-gray-700 hover:text-gray-900 hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:hover:bg-gray-600 dark:hover:text-white dark:focus:ring-blue-400"
        :aria-label="t('reload')"
        @click="handleRefresh"
      >
        <ArrowPathIconSolid class="w-4 h-4" />
      </button>
    </div>
  </div>
</template>
