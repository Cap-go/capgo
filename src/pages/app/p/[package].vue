<script setup lang="ts">
import type { Stat, Tab } from '~/components/comp_def'
import type { Database } from '~/types/supabase.types'
import { useI18n } from 'petite-vue-i18n'
import { computed, ref, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import IconChart from '~icons/heroicons/chart-bar'
import IconHistory from '~icons/heroicons/clock'
import IconCube from '~icons/heroicons/cube'
import IconDevice from '~icons/heroicons/device-phone-mobile'
import IconChannel from '~icons/heroicons/signal'
import { appIdToUrl, urlToAppId } from '~/services/conversion'
import { getCapgoVersion, useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'

const id = ref('')
const { t } = useI18n()
const route = useRoute('/app/p/[package]')
const lastPath = ref('')
const router = useRouter()
const bundlesNb = ref(0)
const devicesNb = ref(0)
const updatesNb = ref(0)
const channelsNb = ref(0)
const capgoVersion = ref('')
const canShowMobileStats = ref(true)
const main = useMainStore()
const organizationStore = useOrganizationStore()
const isLoading = ref(false)
const supabase = useSupabase()
const displayStore = useDisplayStore()
const app = ref<Database['public']['Tables']['apps']['Row']>()
const ActiveTab = ref(route.query.tab?.toString() || 'overview')

const tabs: Tab[] = [
  {
    label: 'overview',
    icon: IconChart,
    key: 'overview',
  },
  {
    label: 'bundles',
    icon: IconCube,
    key: 'bundles',
  },
  {
    label: 'channels',
    icon: IconChannel,
    key: 'channels',
  },
  {
    label: 'devices',
    icon: IconDevice,
    key: 'devices',
  },
  {
    label: 'logs',
    icon: IconHistory,
    key: 'logs',
  },
]

const stats = computed<Stat[]>(() => ([
  {
    label: t('channels'),
    hoverLabel: 'Click to explore the channel list',
    value: channelsNb.value?.toLocaleString(),
    link: `/app/p/${appIdToUrl(id.value)}?tab=channels`,
  },
  {
    label: t('bundles'),
    hoverLabel: 'Click to explore the bundle list',
    value: bundlesNb.value?.toLocaleString(),
    link: `/app/p/${appIdToUrl(id.value)}?tab=bundles`,
  },
  {
    label: t('devices'),
    hoverLabel: 'Click to explore the device list',
    value: devicesNb.value?.toLocaleString(),
    link: `/app/p/${appIdToUrl(id.value)}?tab=devices`,
  },
  {
    label: t('plan-updates'),
    hoverLabel: 'Click to explore the logs',
    value: updatesNb.value?.toLocaleString(),
    link: `/app/p/${appIdToUrl(id.value)}?tab=logs`,
  },
]))

async function loadAppInfo() {
  try {
    const { data: dataApp } = await supabase
      .from('apps')
      .select()
      .eq('app_id', id.value)
      .single()
    app.value = dataApp || app.value
    const promises = []
    capgoVersion.value = await getCapgoVersion(id.value, app.value?.last_version)
    updatesNb.value = await main.getTotalStatsByApp(id.value, organizationStore.currentOrganization?.subscription_start)
    devicesNb.value = await main.getTotalMauByApp(id.value, organizationStore.currentOrganization?.subscription_start)

    promises.push(
      supabase
        .from('app_versions')
        .select('*', { count: 'exact', head: true })
        .eq('app_id', id.value)
        .eq('deleted', false)
        .then(({ count: bundlesCount }) => {
          if (bundlesCount)
            bundlesNb.value = bundlesCount
          else
            ActiveTab.value = 'bundles'
        }),
    )

    promises.push(
      supabase
        .from('channels')
        .select('*', { count: 'exact', head: true })
        .eq('app_id', id.value)
        .then(({ count: channelsCount }) => {
          if (channelsCount)
            channelsNb.value = channelsCount
        }),
    )

    await Promise.all(promises)
  }
  catch (error) {
    console.error(error)
  }
}

async function refreshData() {
  isLoading.value = true
  try {
    await main.awaitInitialLoad()
    await loadAppInfo()
  }
  catch (error) {
    console.error(error)
  }
  isLoading.value = false
}

watchEffect(async () => {
  if (route.path.startsWith('/app/p') && lastPath.value !== route.path) {
    lastPath.value = route.path
    id.value = route.params.package as string
    id.value = urlToAppId(id.value)
    await refreshData()
    displayStore.NavTitle = app.value?.name || ''
    displayStore.defaultBack = '/app'
  }
})

watchEffect(() => {
  router.replace({ query: { ...route.query, tab: ActiveTab.value } })
})
</script>

<template>
  <div>
    <Tabs v-model:active-tab="ActiveTab" :tabs="tabs" />
    <div v-if="isLoading" class="flex flex-col items-center justify-center h-full">
      <Spinner size="w-40 h-40" />
    </div>
    <div v-else>
      <div v-if="ActiveTab === 'overview'" class="mt-4 w-full h-full px-4 pt-8 mb-8 overflow-y-auto max-h-fit lg:px-8 sm:px-6 overflow-x-hidden">
        <Usage :app-id="id" :show-mobile-stats="canShowMobileStats" />

        <BlurBg id="app-stats" class="mb-10">
          <template #default>
            <StatsBar :stats="stats" />
          </template>
        </BlurBg>
      </div>

      <div v-if="ActiveTab === 'bundles'" class="mt-0 md:mt-4">
        <div class="flex flex-col mx-auto overflow-y-auto bg-white border md:rounded-lg shadow-lg border-slate-300 md:mt-5 md:w-2/3 dark:border-slate-900 dark:bg-gray-800">
          <BundleTable :app-id="id" />
        </div>
      </div>

      <div v-if="ActiveTab === 'channels'" class="mt-0 md:mt-4">
        <div class="flex flex-col mx-auto overflow-y-auto bg-white border md:rounded-lg shadow-lg border-slate-300 md:mt-5 md:w-2/3 dark:border-slate-900 dark:bg-gray-800">
          <ChannelTable :app-id="id" />
        </div>
      </div>

      <div v-if="ActiveTab === 'devices'" class="mt-0 md:mt-4">
        <div class="flex flex-col mx-auto overflow-y-auto bg-white border md:rounded-lg shadow-lg border-slate-300 md:mt-5 md:w-2/3 dark:border-slate-900 dark:bg-gray-800">
          <DeviceTable :app-id="id" />
        </div>
      </div>

      <div v-if="ActiveTab === 'logs'" class="mt-0 md:mt-4">
        <div class="flex flex-col mx-auto overflow-y-auto bg-white border md:rounded-lg shadow-lg border-slate-300 md:mt-5 md:w-2/3 dark:border-slate-900 dark:bg-gray-800">
          <LogTable :app-id="id" />
        </div>
      </div>
    </div>
  </div>
</template>
