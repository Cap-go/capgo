<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { Doughnut } from 'vue-chartjs'
import type { ChartData, ChartOptions } from 'chart.js'
import annotationPlugin from 'chartjs-plugin-annotation'
import {
// CategoryScale,
  ArcElement,
  Chart,
  Tooltip,
// LineElement,
// LinearScale,
// PointElement,
} from 'chart.js'
import { useSupabase } from '~/services/supabase'
import Spinner from '~/components/Spinner.vue'
import type { Database } from '~/types/supabase.types'
import { urlToAppId } from '~/services/conversion'

Chart.register(
  ArcElement,
  annotationPlugin,
  Tooltip,
  // Colors,
  // BarController,
  // BarElement,
  // PointElement,
  // CategoryScale,
  // LinearScale,
  // LineElement,
  // Legend,
)

interface Version {
  id: {
    name: string
  }
}

const { t } = useI18n()
const route = useRoute()
const supabase = useSupabase()
const id = ref('')
const isLoading = ref(true)
const bundles = ref<(Database['public']['Tables']['app_versions_meta']['Row'] & Version)[]>([])
const dataDevValues = ref([] as number[])
const dataDevLabels = ref([] as string[])

const buildGraph = () => {
  const vals = bundles.value.reduce((past, d) => {
    if (d.devices)
      past[d.id.name] = d.devices || 0
    return past
  }, { } as any)
  dataDevValues.value = Object.values(vals)
  dataDevLabels.value = Object.keys(vals)
}

const loadData = async () => {
  const dateLimit = new Date()
  dateLimit.setMonth(dateLimit.getMonth() - 1)
  try {
    const { data: dataVersions } = await supabase
      .from('app_versions_meta')
      .select(`
        id (
            name
        ),
        devices,
        created_at,
        updated_at
      `)
      .eq('app_id', id.value)
      .order('created_at', { ascending: false })
      .gte('created_at', dateLimit.toISOString())
    bundles.value = (dataVersions || bundles.value) as (Database['public']['Tables']['app_versions_meta']['Row'] & Version)[]
    buildGraph()
  }
  catch (error) {
    console.error(error)
  }
}

const chartData = computed<ChartData<'doughnut'>>(() => ({
  labels: dataDevLabels.value,
  datasets: [
    {
      data: dataDevValues.value,
      backgroundColor: [
        '#77CEFF',
        '#0079AF',
        '#123E6B',
        '#97B0C4',
        '#A5C8ED',
      ],
    },
  ],
}))
const chartOptions = computed<ChartOptions<'doughnut'>>(() => ({
  plugins: {
    legend: {
      display: false,
    },
    title: {
      display: false,
    },
  },
}))

watchEffect(async () => {
  if (route.path.includes('/package/')) {
    id.value = route.params.package as string
    id.value = urlToAppId(id.value)
    try {
      await loadData()
      isLoading.value = false
    }
    catch (error) {
      console.error(error)
    }
  }
  else {
    isLoading.value = true
  }
})
</script>

<template>
  <div v-if="isLoading" class="flex flex-col items-center justify-center bg-white border rounded-lg shadow-lg col-span-full sm:col-span-6 xl:col-span-4 border-slate-200 dark:bg-gray-800 dark:border-slate-900">
    <Spinner size="w-40 h-40" />
  </div>
  <div v-else class="flex flex-col bg-white border rounded-lg shadow-lg col-span-full sm:col-span-6 xl:col-span-4 border-slate-200 dark:bg-gray-800 dark:border-slate-900">
    <div class="px-5 pt-5">
      <h2 class="mb-2 text-2xl font-semibold dark:text-white text-slate-800">
        {{ t('bundles') }}
      </h2>
      <div class="mb-1 text-xs font-semibold uppercase dark:text-white text-slate-400">
        {{ t('usage-title') }}
      </div>
      <div class="flex items-start">
        <div class="mr-2 text-3xl font-bold dark:text-white text-slate-800">
          {{ bundles.length.toLocaleString() }}
        </div>
      </div>
    </div>
    <div class="w-full p-6">
      <Doughnut :chart-data="chartData" :chart-options="chartOptions" />
    </div>
  </div>
</template>
