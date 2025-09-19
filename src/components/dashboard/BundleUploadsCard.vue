<script setup lang="ts">
import dayjs from 'dayjs'
import colors from 'tailwindcss/colors'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import InformationInfo from '~icons/heroicons/information-circle'
import BundleUploadsChart from '~/components/BundleUploadsChart.vue'
import { getDaysInCurrentMonth } from '~/services/date'
import { useSupabase } from '~/services/supabase'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'

const { t } = useI18n()
const main = useMainStore()
const organizationStore = useOrganizationStore()
const subscription_anchor_start = dayjs(organizationStore.currentOrganization?.subscription_start).format('YYYY/MM/D')
const subscription_anchor_end = dayjs(organizationStore.currentOrganization?.subscription_end).format('YYYY/MM/D')

const total = ref(0)
const lastDayEvolution = ref(0)
const bundleData = ref<number[]>([])
const bundleDataByApp = ref<{ [appId: string]: number[] }>({})
const appNames = ref<{ [appId: string]: string }>({})

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
  total.value = 0

  // Reset data
  bundleDataByApp.value = {}
  appNames.value = {}
  bundleData.value = []

  const cycleStart = new Date(organizationStore.currentOrganization?.subscription_start ?? new Date())
  cycleStart.setHours(0, 0, 0, 0)

  const cycleEnd = new Date(organizationStore.currentOrganization?.subscription_end ?? new Date())
  cycleEnd.setHours(23, 59, 59, 999)

  // Initialize array for the billing period
  const daysInPeriod = getDayNumbers(cycleStart, cycleEnd).length
  const dailyCounts = Array.from({ length: daysInPeriod }).fill(0) as number[]

  // First get all apps for this organization
  const appIds: string[] = []
  if (organizationStore.currentOrganization?.gid) {
    const { data: apps } = await useSupabase()
      .from('apps')
      .select('app_id, name')
      .eq('owner_org', organizationStore.currentOrganization.gid)

    if (apps && apps.length > 0) {
      apps.forEach(app => {
        appIds.push(app.app_id)
        appNames.value[app.app_id] = app.name || app.app_id
        // Initialize data array for each app
        bundleDataByApp.value[app.app_id] = Array.from({ length: daysInPeriod }).fill(0) as number[]
      })
    }
  }

  if (appIds.length === 0) {
    bundleData.value = dailyCounts
    return
  }

  const query = useSupabase()
    .from('app_versions')
    .select('created_at, app_id')
    .gte('created_at', cycleStart.toISOString())
    .lte('created_at', cycleEnd.toISOString())
    .in('app_id', appIds)

  const { data, error } = await query

  if (!error && data) {

    // Map each bundle to the correct day and app
    data.filter(b => b.created_at !== null && b.app_id !== null)
      .forEach((bundle) => {
        if (bundle.created_at && bundle.app_id) {
          const bundleDate = new Date(bundle.created_at)

          // Calculate days since start of billing period
          const daysDiff = Math.floor((bundleDate.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24))

          if (daysDiff >= 0 && daysDiff < daysInPeriod) {
            dailyCounts[daysDiff]++
            total.value++

            // Also track by app
            if (bundleDataByApp.value[bundle.app_id]) {
              bundleDataByApp.value[bundle.app_id][daysDiff]++
            }
          }
        }
      })

    // Set the data for the chart
    bundleData.value = dailyCounts

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
          {{ t('bundle_uploads') }}
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
      <div class="flex items-start">
        <div id="usage_val" class="mr-2 text-3xl font-bold text-slate-800 dark:text-white">
          {{ total?.toLocaleString() }}
        </div>
        <div v-if="lastDayEvolution" class="rounded-full bg-emerald-500 px-1.5 text-sm font-semibold text-white">
          {{ lastDayEvolution < 0 ? '-' : '+' }}{{ lastDayEvolution.toFixed(2) }}%
        </div>
      </div>
    </div>
    <!-- Chart built with Chart.js 3 -->

    <!-- Change the height attribute to adjust the chart height -->
    <div class="w-full h-full p-6">
      <BundleUploadsChart
        :key="JSON.stringify(bundleDataByApp)"
        :title="t('bundle_uploads')"
        :colors="colors.violet"
        :data="bundleData"
        :data-by-app="bundleDataByApp"
        :app-names="appNames"
      />
    </div>
  </div>
</template>
