<script setup lang="ts">
import type { Database } from '~/types/supabase.types'
import { computed, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import IconAlertCircle from '~icons/lucide/alert-circle'
import BundleUploadsCard from '~/components/dashboard/BundleUploadsCard.vue'
import DeploymentBanner from '~/components/dashboard/DeploymentBanner.vue'
import DeploymentStatsCard from '~/components/dashboard/DeploymentStatsCard.vue'
import UpdateStatsCard from '~/components/dashboard/UpdateStatsCard.vue'
import { getCapgoVersion, useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'

const { t } = useI18n()

const id = ref('')
const route = useRoute('/app/[package]')
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

// Check if user lacks security compliance (2FA or password)
const lacksSecurityAccess = computed(() => {
  const org = organizationStore.currentOrganization
  const lacks2FA = org?.enforcing_2fa === true && org?.['2fa_has_access'] === false
  const lacksPassword = org?.password_policy_config?.enabled && org?.password_has_access === false
  return lacks2FA || lacksPassword
})

// Payment failed state (subscription required)
const paymentFailed = computed(() => {
  return organizationStore.currentOrganizationFailed && !lacksSecurityAccess.value
})

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
  if (route.params.package && lastPath.value !== route.path) {
    lastPath.value = route.path
    id.value = route.params.package as string
    await refreshData()
    displayStore.NavTitle = ''
    displayStore.defaultBack = '/app'
  }
})
</script>

<template>
  <div>
    <div v-if="app || isLoading">
      <div class="relative w-full h-full px-4 pt-4 mb-8 overflow-x-hidden overflow-y-auto sm:px-6 lg:px-8 max-h-fit">
        <!-- Only show FailedCard for security access issues (2FA/password) -->
        <FailedCard v-if="lacksSecurityAccess" />

        <!-- Content - blurred when payment failed -->
        <div :class="{ 'blur-sm pointer-events-none select-none': paymentFailed }">
          <DeploymentBanner v-if="!paymentFailed" :app-id="id" @deployed="refreshData" />
          <Usage v-if="!lacksSecurityAccess" ref="usageComponent" :app-id="id" :force-demo="paymentFailed" />

          <!-- Charts section -->
          <div class="grid grid-cols-1 gap-6 mb-6 sm:grid-cols-12 xl:grid-cols-12">
            <BundleUploadsCard
              :app-id="id"
              :use-billing-period="usageComponent?.useBillingPeriod ?? true"
              :accumulated="(usageComponent?.useBillingPeriod ?? true) && (usageComponent?.showCumulative ?? false)"
              :force-demo="paymentFailed"
              class="col-span-full sm:col-span-6 xl:col-span-4"
            />
            <UpdateStatsCard
              :app-id="id"
              :use-billing-period="usageComponent?.useBillingPeriod ?? true"
              :accumulated="(usageComponent?.useBillingPeriod ?? true) && (usageComponent?.showCumulative ?? false)"
              :force-demo="paymentFailed"
              class="col-span-full sm:col-span-6 xl:col-span-4"
            />
            <DeploymentStatsCard
              :app-id="id"
              :use-billing-period="usageComponent?.useBillingPeriod ?? true"
              :accumulated="(usageComponent?.useBillingPeriod ?? true) && (usageComponent?.showCumulative ?? false)"
              :force-demo="paymentFailed"
              class="col-span-full sm:col-span-6 xl:col-span-4"
            />
          </div>
        </div>

        <!-- Payment required overlay -->
        <PaymentRequiredModal v-if="paymentFailed" />
      </div>
    </div>
    <div v-else class="flex flex-col justify-center items-center min-h-[50vh]">
      <IconAlertCircle class="w-16 h-16 mb-4 text-destructive" />
      <h2 class="text-xl font-semibold text-foreground">
        {{ t('app-not-found') }}
      </h2>
      <p class="mt-2 text-muted-foreground">
        {{ t('app-not-found-description') }}
      </p>
      <button class="mt-4 text-white d-btn d-btn-primary" @click="$router.push(`/app`)">
        {{ t('back-to-apps') }}
      </button>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: app
</route>
