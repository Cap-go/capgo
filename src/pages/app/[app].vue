<script setup lang="ts">
import type { Database } from '~/types/supabase.types'
import { computed, ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import AppNotFoundModal from '~/components/AppNotFoundModal.vue'
import BundleUploadsCard from '~/components/dashboard/BundleUploadsCard.vue'
import DeploymentBanner from '~/components/dashboard/DeploymentBanner.vue'
import DeploymentStatsCard from '~/components/dashboard/DeploymentStatsCard.vue'
import ReleaseBanner from '~/components/dashboard/ReleaseBanner.vue'
import UpdateStatsCard from '~/components/dashboard/UpdateStatsCard.vue'
import { getCapgoVersion, useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'

const id = ref('')
const route = useRoute('/app/[app]')
const lastPath = ref('')
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
const usageComponent = ref()
const appNotFound = ref(false)
const appOrganization = computed(() => {
  if (!id.value)
    return undefined
  return organizationStore.getOrgByAppId(id.value) ?? organizationStore.currentOrganization
})

// Check if user lacks security compliance (2FA or password)
const lacksSecurityAccess = computed(() => {
  const org = organizationStore.currentOrganization
  const lacks2FA = org?.enforcing_2fa === true && org?.['2fa_has_access'] === false
  const lacksPassword = org?.password_policy_config?.enabled && org?.password_has_access === false
  return lacks2FA || lacksPassword
})

async function loadAppInfo() {
  try {
    await organizationStore.awaitInitialLoad()
    const { data: dataApp, error } = await supabase
      .from('apps')
      .select()
      .eq('app_id', id.value)
      .single()

    if (error || !dataApp) {
      appNotFound.value = true
      app.value = undefined
      return
    }

    appNotFound.value = false
    app.value = dataApp
    const promises = []
    capgoVersion.value = await getCapgoVersion(id.value, app.value?.last_version)
    updatesNb.value = await main.getTotalStatsByApp(id.value, appOrganization.value?.subscription_start)
    devicesNb.value = await main.getTotalMauByApp(id.value, appOrganization.value?.subscription_start)

    promises.push(
      supabase
        .from('app_versions')
        .select('*', { count: 'exact', head: true })
        .eq('app_id', id.value)
        .eq('deleted', false)
        .then(({ count: bundlesCount }) => {
          if (bundlesCount)
            bundlesNb.value = bundlesCount
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
    appNotFound.value = true
    app.value = undefined
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
  if (route.params.app && lastPath.value !== route.path) {
    lastPath.value = route.path
    id.value = route.params.app as string
    await refreshData()
    displayStore.NavTitle = ''
    displayStore.defaultBack = '/apps'
  }
})
</script>

<template>
  <div>
    <div v-if="app || isLoading || appNotFound">
      <div class="relative w-full h-full px-4 pt-4 mb-8 overflow-x-hidden overflow-y-auto sm:px-6 lg:px-8 max-h-fit">
        <!-- Only show FailedCard for security access issues (2FA/password) -->
        <FailedCard v-if="lacksSecurityAccess" />

        <!-- Content - blurred when app not found -->
        <div :class="{ 'blur-sm pointer-events-none select-none': appNotFound }">
          <DeploymentBanner v-if="!appNotFound" :app-id="id" @deployed="refreshData" />
          <ReleaseBanner v-if="!appNotFound" :app-id="id" />
          <Usage v-if="!lacksSecurityAccess" ref="usageComponent" :app-id="id" :force-demo="appNotFound" />

          <!-- Charts section -->
          <div class="grid grid-cols-1 gap-6 mb-6 sm:grid-cols-12 xl:grid-cols-12">
            <BundleUploadsCard
              :app-id="id"
              :use-billing-period="usageComponent?.useBillingPeriod ?? true"
              :accumulated="(usageComponent?.useBillingPeriod ?? true) && (usageComponent?.showCumulative ?? false)"
              :force-demo="appNotFound"
              class="col-span-full sm:col-span-6 xl:col-span-4"
            />
            <UpdateStatsCard
              :app-id="id"
              :use-billing-period="usageComponent?.useBillingPeriod ?? true"
              :accumulated="(usageComponent?.useBillingPeriod ?? true) && (usageComponent?.showCumulative ?? false)"
              :force-demo="appNotFound"
              class="col-span-full sm:col-span-6 xl:col-span-4"
            />
            <DeploymentStatsCard
              :app-id="id"
              :use-billing-period="usageComponent?.useBillingPeriod ?? true"
              :accumulated="(usageComponent?.useBillingPeriod ?? true) && (usageComponent?.showCumulative ?? false)"
              :force-demo="appNotFound"
              class="col-span-full sm:col-span-6 xl:col-span-4"
            />
          </div>
        </div>

        <!-- App not found overlay -->
        <AppNotFoundModal v-if="appNotFound" />
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: app
</route>
