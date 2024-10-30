<script setup lang="ts">
import { useI18n } from 'petite-vue-i18n'
import { computed, ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import type { Stat } from '~/components/comp_def'
import Spinner from '~/components/Spinner.vue'
import { appIdToUrl, urlToAppId } from '~/services/conversion'
import { getCapgoVersion, useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'
import { useMainStore } from '~/stores/main'
import type { Database } from '~/types/supabase.types'

const id = ref('')
const { t } = useI18n()
const route = useRoute('/app/package/[package]')
const bundlesNb = ref(0)
const devicesNb = ref(0)
const updatesNb = ref(0)
const channelsNb = ref(0)
const capgoVersion = ref('')
const canShowMobileStats = ref(true)
const main = useMainStore()
const isLoading = ref(false)
const supabase = useSupabase()
const displayStore = useDisplayStore()
const app = ref<Database['public']['Tables']['apps']['Row']>()

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
    // normalize version
    // capgoVersion.value =
    // if (capgoVersion.value && gte(capgoVersion.value, '6.0.1')) // TODO: removed in 2025 if there is not more old plugin used
    // canShowMobileStats.value = true
    updatesNb.value = main.getTotalStatsByApp(id.value)
    devicesNb.value = main.getTotalMauByApp(id.value)

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
const stats = computed<Stat[]>(() => ([
  {
    label: t('channels'),
    hoverLabel: 'Click to explore the channel list',
    value: channelsNb.value?.toLocaleString(),
    link: `/app/p/${appIdToUrl(id.value)}/channels`,
  },
  {
    label: t('bundles'),
    hoverLabel: 'Click to explore the bundle list',
    value: bundlesNb.value?.toLocaleString(),
    link: `/app/p/${appIdToUrl(id.value)}/bundles`,
  },
  {
    label: t('devices'),
    hoverLabel: 'Click to explore the device list',
    value: devicesNb.value?.toLocaleString(),
    link: `/app/p/${appIdToUrl(id.value)}/devices`,
  },
  {
    label: t('plan-updates'),
    hoverLabel: 'Click to explore the logs',
    value: updatesNb.value?.toLocaleString(),
    link: `/app/p/${appIdToUrl(id.value)}/logs`,
  },
]))

watchEffect(async () => {
  if (route.path.startsWith('/app/package')) {
    id.value = route.params.package as string
    id.value = urlToAppId(id.value)
    await refreshData()
    displayStore.NavTitle = app.value?.name || ''
    displayStore.defaultBack = '/app/home'
  }
})
</script>

<template>
  <div>
    <div v-if="isLoading" class="flex flex-col items-center justify-center h-full">
      <Spinner size="w-40 h-40" />
    </div>
    <div v-else class="w-full h-full px-4 pt-8 mb-8 overflow-y-auto max-h-fit lg:px-8 sm:px-6">
      <Usage :app-id="id" :show-mobile-stats="canShowMobileStats" />

      <BlurBg id="app-stats" class="mb-10">
        <template #default>
          <StatsBar :stats="stats" />
        </template>
      </BlurBg>
    </div>
  </div>
</template>
