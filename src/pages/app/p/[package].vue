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
import IconBuild from '~icons/heroicons/wrench-screwdriver'
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
const showingBuildSteps = ref(false)
const showingBundleSteps = ref(false)

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
  {
    label: 'builds',
    icon: IconBuild,
    key: 'builds',
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
    <div v-if="app || isLoading">
      <div v-if="ActiveTab === 'overview'" class="overflow-y-auto overflow-x-hidden px-4 pt-4 mb-8 w-full h-full sm:px-6 lg:px-8 max-h-fit">
        <FailedCard />
        <Usage v-if="!organizationStore.currentOrganizationFailed" ref="usageComponent" :app-id="id" />

        <!-- New charts section -->
        <div class="grid grid-cols-1 gap-6 mb-6 sm:grid-cols-12 xl:grid-cols-12">
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
        <div class="overflow-y-auto px-0 pt-0 mx-auto mb-8 w-full h-full sm:px-6 md:pt-8 lg:px-8 max-w-9xl max-h-fit">
          <div class="flex overflow-hidden overflow-y-auto flex-col bg-white border shadow-lg md:rounded-lg dark:bg-gray-800 border-slate-300 dark:border-slate-900">
            <AppSetting :app-id="id" />
          </div>
        </div>
      </div>

      <div v-if="ActiveTab === 'bundles'" class="mt-0 md:mt-8">
        <div class="overflow-y-auto px-0 pt-0 mx-auto mb-8 w-full h-full sm:px-6 md:pt-8 lg:px-8 max-w-9xl max-h-fit">
          <BundleTable :app-id="id" @update:showing-steps="showingBundleSteps = $event" />
        </div>
      </div>

      <div v-if="ActiveTab === 'channels'" class="mt-0 md:mt-8">
        <div class="overflow-y-auto px-0 pt-0 mx-auto mb-8 w-full h-full sm:px-6 md:pt-8 lg:px-8 max-w-9xl max-h-fit">
          <div class="flex overflow-hidden overflow-y-auto flex-col bg-white border shadow-lg md:rounded-lg dark:bg-gray-800 border-slate-300 dark:border-slate-900">
            <ChannelTable :app-id="id" />
          </div>
        </div>
      </div>

      <div v-if="ActiveTab === 'devices'" class="mt-0 md:mt-8">
        <div class="overflow-y-auto px-0 pt-0 mx-auto mb-8 w-full h-full sm:px-6 md:pt-8 lg:px-8 max-w-9xl max-h-fit">
          <div class="flex overflow-hidden overflow-y-auto flex-col bg-white border shadow-lg md:rounded-lg dark:bg-gray-800 border-slate-300 dark:border-slate-900">
            <DeviceTable :app-id="id" />
          </div>
        </div>
      </div>

      <div v-if="ActiveTab === 'logs'" class="mt-0 md:mt-8">
        <div class="overflow-y-auto px-0 pt-0 mx-auto mb-8 w-full h-full sm:px-6 md:pt-8 lg:px-8 max-w-9xl max-h-fit">
          <div class="flex overflow-hidden overflow-y-auto flex-col bg-white border shadow-lg md:rounded-lg dark:bg-gray-800 border-slate-300 dark:border-slate-900">
            <LogTable :app-id="id" />
          </div>
        </div>
      </div>

      <div v-if="ActiveTab === 'builds'" class="mt-0 md:mt-8">
        <div class="overflow-y-auto px-0 pt-0 mx-auto mb-8 w-full h-full sm:px-6 md:pt-8 lg:px-8 max-w-9xl max-h-fit">
          <BuildTable :app-id="id" @update:showing-steps="showingBuildSteps = $event" />
        </div>
      </div>
    </div>
    <div v-else class="flex flex-col justify-center items-center min-h-[50vh]">
      <IconAlertCircle class="mb-4 w-16 h-16 text-destructive" />
      <h2 class="text-xl font-semibold text-foreground">
        {{ t('app-not-found') }}
      </h2>
      <p class="mt-2 text-muted-foreground">
        {{ t('app-not-found-description') }}
      </p>
      <button class="mt-4 text-white d-btn d-btn-primary" @click="router.push(`/app`)">
        {{ t('back-to-apps') }}
      </button>
    </div>
  </div>
</template>
