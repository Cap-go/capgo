<script setup lang="ts">
import dayjs from 'dayjs'
import colors from 'tailwindcss/colors'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import InformationInfo from '~icons/heroicons/information-circle'
import UpdateStatsChart from '~/components/UpdateStatsChart.vue'
import { useSupabase } from '~/services/supabase'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'

const { t } = useI18n()
const main = useMainStore()
const organizationStore = useOrganizationStore()
const subscription_anchor_start = dayjs(organizationStore.currentOrganization?.subscription_start).format('YYYY/MM/D')
const subscription_anchor_end = dayjs(organizationStore.currentOrganization?.subscription_end).format('YYYY/MM/D')

const totalInstalled = ref(0)
const totalFailed = ref(0)
const totalGet = ref(0)
const lastDayEvolution = ref(0)
const updateData = ref<number[]>([])
const updateDataByApp = ref<{ [appId: string]: number[] }>({})
const updateDataByAction = ref<{ [action: string]: number[] }>({})
const appNames = ref<{ [appId: string]: string }>({})
const isLoading = ref(true)

function getDayNumbers(startDate: Date, endDate: Date) {
  const dayNumbers = []
  const currentDate = new Date(startDate)
  while (currentDate.getTime() <= endDate.getTime()) {
    dayNumbers.push(currentDate.getDate())
    currentDate.setDate(currentDate.getDate() + 1)
  }
  return dayNumbers
}

async function calculateStats() {
  isLoading.value = true
  totalInstalled.value = 0
  totalFailed.value = 0
  totalGet.value = 0

  // Reset data
  updateDataByApp.value = {}
  updateDataByAction.value = {}
  appNames.value = {}
  updateData.value = []

  const cycleStart = new Date(organizationStore.currentOrganization?.subscription_start ?? new Date())
  cycleStart.setHours(0, 0, 0, 0)

  const cycleEnd = new Date(organizationStore.currentOrganization?.subscription_end ?? new Date())
  cycleEnd.setHours(23, 59, 59, 999)

  // Initialize array for the billing period
  const daysInPeriod = getDayNumbers(cycleStart, cycleEnd).length
  const dailyCounts = Array.from({ length: daysInPeriod }).fill(0) as number[]

  // Initialize action-specific data arrays
  updateDataByAction.value = {
    install: Array.from({ length: daysInPeriod }).fill(0) as number[],
    fail: Array.from({ length: daysInPeriod }).fill(0) as number[],
    get: Array.from({ length: daysInPeriod }).fill(0) as number[],
  }

  const startDate = cycleStart.toISOString().split('T')[0]
  const endDate = cycleEnd.toISOString().split('T')[0]

  try {
    // First get all apps for this organization
    const appIds: string[] = []
    if (organizationStore.currentOrganization?.gid) {
      const { data: apps } = await useSupabase()
        .from('apps')
        .select('app_id, name')
        .eq('owner_org', organizationStore.currentOrganization.gid)

      if (apps && apps.length > 0) {
        apps.forEach((app) => {
          appIds.push(app.app_id)
          appNames.value[app.app_id] = app.name || app.app_id
          // Initialize data array for each app
          updateDataByApp.value[app.app_id] = Array.from({ length: daysInPeriod }).fill(0) as number[]
        })
      }
    }

    if (appIds.length === 0) {
      updateData.value = dailyCounts
      isLoading.value = false
      return
    }

    // Get update stats from daily_version table and aggregate by app/date
    const { data } = await useSupabase()
      .from('daily_version')
      .select('date, app_id, install, fail, get')
      .in('app_id', appIds)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date')

    if (data && data.length > 0) {
      // Aggregate by app and date (sum across all versions)
      const aggregatedStats = data.reduce((acc: any, curr) => {
        const key = `${curr.app_id}_${curr.date}`
        if (!acc[key]) {
          acc[key] = {
            date: curr.date,
            app_id: curr.app_id,
            installed: 0,
            installed_fail: 0,
            get_stats: 0,
          }
        }
        acc[key].installed += curr.install || 0
        acc[key].installed_fail += curr.fail || 0
        acc[key].get_stats += curr.get || 0
        return acc
      }, {})

      // Process each aggregated stat entry
      Object.values(aggregatedStats).forEach((stat: any) => {
        if (stat.date) {
          const statDate = new Date(stat.date)

          // Calculate days since start of billing period
          const daysDiff = Math.floor((statDate.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24))

          if (daysDiff >= 0 && daysDiff < daysInPeriod) {
            const totalForDay = (stat.installed || 0) + (stat.installed_fail || 0) + (stat.get_stats || 0)
            dailyCounts[daysDiff] += totalForDay

            totalInstalled.value += stat.installed || 0
            totalFailed.value += stat.installed_fail || 0
            totalGet.value += stat.get_stats || 0

            // Track by action type for dashboard view
            updateDataByAction.value.install[daysDiff] += stat.installed || 0
            updateDataByAction.value.fail[daysDiff] += stat.installed_fail || 0
            updateDataByAction.value.get[daysDiff] += stat.get_stats || 0

            // Also track by app (using total for simplicity in bar chart)
            if (updateDataByApp.value[stat.app_id]) {
              updateDataByApp.value[stat.app_id][daysDiff] += totalForDay
            }
          }
        }
      })

      // Set the data for the chart
      updateData.value = dailyCounts

      // Calculate evolution (compare last two days with data)
      const nonZeroDays = dailyCounts.filter(count => count > 0)
      if (nonZeroDays.length >= 2) {
        const lastDayCount = nonZeroDays[nonZeroDays.length - 1]
        const previousDayCount = nonZeroDays[nonZeroDays.length - 2]
        if (previousDayCount > 0) {
          lastDayEvolution.value = ((lastDayCount - previousDayCount) / previousDayCount) * 100
        }
      }
    }
    else {
      updateData.value = dailyCounts
    }
  }
  catch (error) {
    console.error('Error fetching update stats:', error)
    updateData.value = dailyCounts
  }
  finally {
    isLoading.value = false
  }
}

onMounted(async () => {
  await calculateStats()
})
</script>

<template>
  <div class="flex flex-col bg-white border rounded-lg shadow-lg col-span-full border-slate-300 sm:col-span-6 xl:col-span-4 dark:border-slate-900 dark:bg-gray-800 h-[460px]">
    <div class="px-5 pt-3">
      <div class="flex flex-row items-center">
        <h2 class="mb-2 mr-2 text-2xl font-semibold text-slate-800 dark:text-white">
          {{ t('update_statistics') }}
        </h2>
        <div class="d-tooltip d-tooltip-bottom">
          <div class="d-tooltip-content bg-white dark:bg-gray-800 text-gray-800 dark:text-white border border-gray-200 dark:border-gray-600 shadow-2xl rounded-lg p-4 min-w-[280px]">
            <div class="space-y-3">
              <!-- Last Run -->
              <div class="flex items-start space-x-2">
                <div class="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0" />
                <div>
                  <div class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    {{ t('last-run') }}
                  </div>
                  <div class="text-sm font-medium">
                    {{ dayjs(main.statsTime.last_run).format('MMMM D, YYYY HH:mm') }}
                  </div>
                </div>
              </div>

              <!-- Next Run -->
              <div class="flex items-start space-x-2">
                <div class="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                <div>
                  <div class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    {{ t('next-run') }}
                  </div>
                  <div class="text-sm font-medium">
                    {{ dayjs(main.statsTime.next_run).format('MMMM D, YYYY HH:mm') }}
                  </div>
                </div>
              </div>

              <!-- Billing Cycle -->
              <div class="pt-2 border-t border-gray-200 dark:border-gray-600">
                <div class="flex items-start space-x-2">
                  <div class="w-2 h-2 bg-purple-500 rounded-full mt-2 flex-shrink-0" />
                  <div>
                    <div class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      {{ t('billing-cycle') }}
                    </div>
                    <div class="text-sm font-medium">
                      {{ subscription_anchor_start }} {{ t('to') }} {{ subscription_anchor_end }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="flex items-center justify-center w-5 h-5 cursor-pointer">
            <InformationInfo class="text-gray-400 hover:text-blue-500 transition-colors duration-200" />
          </div>
        </div>
      </div>

      <div class="mb-1 text-xs font-semibold uppercase text-slate-400 dark:text-white">
        {{ t('usage-title') }}
      </div>
      <div class="flex flex-col space-y-1">
        <div class="flex items-center space-x-4">
          <div class="flex items-center space-x-2">
            <div class="w-3 h-3 rounded-full" style="background-color: hsl(210, 50%, 60%)" />
            <span class="text-sm text-slate-600 dark:text-slate-300">{{ t('installed') }}: {{ totalInstalled.toLocaleString() }}</span>
          </div>
          <div class="flex items-center space-x-2">
            <div class="w-3 h-3 rounded-full" style="background-color: hsl(0, 50%, 60%)" />
            <span class="text-sm text-slate-600 dark:text-slate-300">{{ t('failed') }}: {{ totalFailed.toLocaleString() }}</span>
          </div>
          <div class="flex items-center space-x-2">
            <div class="w-3 h-3 rounded-full" style="background-color: hsl(120, 50%, 60%)" />
            <span class="text-sm text-slate-600 dark:text-slate-300">{{ t('get') }}: {{ totalGet.toLocaleString() }}</span>
          </div>
        </div>
        <div class="flex items-start">
          <div id="total_update_val" class="mr-2 text-3xl font-bold text-slate-800 dark:text-white">
            {{ (totalInstalled + totalFailed + totalGet).toLocaleString() }}
          </div>
          <div v-if="lastDayEvolution" class="rounded-full bg-emerald-500 px-1.5 text-sm font-semibold text-white">
            {{ lastDayEvolution < 0 ? '-' : '+' }}{{ Math.abs(lastDayEvolution).toFixed(2) }}%
          </div>
        </div>
      </div>
    </div>
    <!-- Chart built with Chart.js 3 -->

    <!-- Change the height attribute to adjust the chart height -->
    <div class="w-full h-full p-6">
      <div v-if="isLoading" class="flex items-center justify-center h-full">
        <div class="loading loading-spinner loading-lg text-blue-500" />
      </div>
      <UpdateStatsChart
        v-else
        :key="JSON.stringify(updateDataByAction)"
        :title="t('update_statistics')"
        :colors="colors.blue"
        :data="updateData"
        :data-by-app="updateDataByAction"
        :app-names="{ install: 'Installed', fail: 'Failed', get: 'Get' }"
      />
    </div>
  </div>
</template>
