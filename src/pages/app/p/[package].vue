<script setup lang="ts">
import type { Tab } from '~/components/comp_def'
import type { Database } from '~/types/supabase.types'
import { ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import IconChart from '~icons/heroicons/chart-bar'
import IconHistory from '~icons/heroicons/clock'
import IconCog from '~icons/heroicons/cog-6-tooth'
import IconCube from '~icons/heroicons/cube'
import IconDevice from '~icons/heroicons/device-phone-mobile'
import IconChannel from '~icons/heroicons/signal'
import IconAlertCircle from '~icons/lucide/alert-circle'
import AppSetting from '~/components/dashboard/AppSetting.vue'
import BundleUploadsCard from '~/components/dashboard/BundleUploadsCard.vue'
import DeploymentStatsCard from '~/components/dashboard/DeploymentStatsCard.vue'
import UpdateStatsCard from '~/components/dashboard/UpdateStatsCard.vue'
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
const main = useMainStore()
const organizationStore = useOrganizationStore()
const isLoading = ref(false)
const supabase = useSupabase()
const displayStore = useDisplayStore()
const app = ref<Database['public']['Tables']['apps']['Row']>()
const ActiveTab = ref(route.query.tab?.toString() || 'overview')
const usageComponent = ref()

const tabs: Tab[] = [
  {
    label: 'overview',
    icon: IconChart,
    key: 'overview',
  },
  {
    label: 'info',
    icon: IconCog,
    key: 'info',
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
    await refreshData()
    displayStore.NavTitle = app.value?.name ?? ''
    displayStore.defaultBack = '/app'
  }
})

watchEffect(() => {
  // Clear dashboard-specific query parameters when switching away from overview
  if (ActiveTab.value !== 'overview' && usageComponent.value?.clearDashboardParams) {
    usageComponent.value.clearDashboardParams()
  }
  // Always update tab parameter
  router.replace({ query: { ...route.query, tab: ActiveTab.value } })
})
</script>

<template>
  <div>
    <Tabs v-model:active-tab="ActiveTab" :tabs="tabs" />
    <div v-if="isLoading" class="flex flex-col items-center justify-center h-full">
      <Spinner size="w-40 h-40" />
    </div>
    <div v-else-if="app">
      <div v-if="ActiveTab === 'overview'" class="w-full h-full px-4 pt-4 mb-8 overflow-y-auto max-h-fit lg:px-8 sm:px-6 overflow-x-hidden">
        <FailedCard />
        <Usage v-if="!organizationStore.currentOrganizationFailed" ref="usageComponent" :app-id="id" />

        <!-- New charts section -->
        <div class="grid grid-cols-1 sm:grid-cols-12 gap-6 mb-6 xl:grid-cols-12">
          <BundleUploadsCard
            :app-id="id"
            :use-billing-period="usageComponent?.useBillingPeriod ?? true"
            :accumulated="(usageComponent?.useBillingPeriod ?? true) && (usageComponent?.showCumulative ?? false)"
            class="col-span-full sm:col-span-6 xl:col-span-4"
          />
          <UpdateStatsCard
            :app-id="id"
            :use-billing-period="usageComponent?.useBillingPeriod ?? true"
            :accumulated="(usageComponent?.useBillingPeriod ?? true) && (usageComponent?.showCumulative ?? false)"
            class="col-span-full sm:col-span-6 xl:col-span-4"
          />
          <DeploymentStatsCard
            :app-id="id"
            :use-billing-period="usageComponent?.useBillingPeriod ?? true"
            :accumulated="(usageComponent?.useBillingPeriod ?? true) && (usageComponent?.showCumulative ?? false)"
            class="col-span-full sm:col-span-6 xl:col-span-4"
          />
        </div>
      </div>

      <div v-if="ActiveTab === 'info'" class="mt-0 md:mt-8">
        <div class="w-full h-full px-0 pt-0 md:pt-8 mx-auto mb-8 overflow-y-auto max-w-9xl max-h-fit sm:px-6 lg:px-8">
          <div class="flex flex-col overflow-hidden overflow-y-auto bg-white border border-slate-300 shadow-lg md:rounded-lg dark:border-slate-900 dark:bg-gray-800">
            <AppSetting :app-id="id" />
          </div>
        </div>
      </div>

      <div v-if="ActiveTab === 'bundles'" class="mt-0 md:mt-8">
        <div class="w-full h-full px-0 pt-0 md:pt-8 mx-auto mb-8 overflow-y-auto max-w-9xl max-h-fit sm:px-6 lg:px-8">
          <div class="flex flex-col overflow-hidden overflow-y-auto bg-white border border-slate-300 shadow-lg md:rounded-lg dark:border-slate-900 dark:bg-gray-800">
            <BundleTable :app-id="id" />
          </div>
        </div>
      </div>

      <div v-if="ActiveTab === 'channels'" class="mt-0 md:mt-8">
        <div class="w-full h-full px-0 pt-0 md:pt-8 mx-auto mb-8 overflow-y-auto max-w-9xl max-h-fit sm:px-6 lg:px-8">
          <div class="flex flex-col overflow-hidden overflow-y-auto bg-white border border-slate-300 shadow-lg md:rounded-lg dark:border-slate-900 dark:bg-gray-800">
            <ChannelTable :app-id="id" />
          </div>
        </div>
      </div>

      <div v-if="ActiveTab === 'devices'" class="mt-0 md:mt-8">
        <div class="w-full h-full px-0 pt-0 md:pt-8 mx-auto mb-8 overflow-y-auto max-w-9xl max-h-fit sm:px-6 lg:px-8">
          <div class="flex flex-col overflow-hidden overflow-y-auto bg-white border border-slate-300 shadow-lg md:rounded-lg dark:border-slate-900 dark:bg-gray-800">
            <DeviceTable :app-id="id" />
          </div>
        </div>
      </div>

      <div v-if="ActiveTab === 'logs'" class="mt-0 md:mt-8">
        <div class="w-full h-full px-0 pt-0 md:pt-8 mx-auto mb-8 overflow-y-auto max-w-9xl max-h-fit sm:px-6 lg:px-8">
          <div class="flex flex-col overflow-hidden overflow-y-auto bg-white border border-slate-300 shadow-lg md:rounded-lg dark:border-slate-900 dark:bg-gray-800">
            <LogTable :app-id="id" />
          </div>
        </div>
      </div>
    </div>
    <div v-else class="flex flex-col items-center justify-center min-h-[50vh]">
      <IconAlertCircle class="w-16 h-16 text-destructive mb-4" />
      <h2 class="text-xl font-semibold text-foreground">
        {{ t('app-not-found') }}
      </h2>
      <p class="text-muted-foreground mt-2">
        {{ t('app-not-found-description') }}
      </p>
      <button class="mt-4 d-btn d-btn-primary text-white" @click="router.push(`/app`)">
        {{ t('back-to-apps') }}
      </button>
    </div>
  </div>
</template>
