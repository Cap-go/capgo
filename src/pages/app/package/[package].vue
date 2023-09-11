<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { computed, ref, watchEffect } from 'vue'
import { useMainStore } from '~/stores/main'
import Spinner from '~/components/Spinner.vue'
import type { Stat } from '~/components/comp_def'
import { useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'
import Usage from '~/components/dashboard/Usage.vue'
import type { Database } from '~/types/supabase.types'
import { appIdToUrl, getConvertedDate2, urlToAppId } from '~/services/conversion'

const id = ref('')
const { t } = useI18n()
const route = useRoute()
const bundlesNb = ref(0)
const devicesNb = ref(0)
const updatesNb = ref(0)
const channelsNb = ref(0)
const main = useMainStore()
const isLoading = ref(false)
const supabase = useSupabase()
const displayStore = useDisplayStore()
const app = ref<Database['public']['Tables']['apps']['Row']>()

const cycleStart = main.cycleInfo?.subscription_anchor_start ? new Date(main.cycleInfo?.subscription_anchor_start) : null
const cycleEnd = main.cycleInfo?.subscription_anchor_end ? new Date(main.cycleInfo?.subscription_anchor_end) : null

async function loadAppInfo() {
  try {
    const { data: dataApp } = await supabase
      .from('apps')
      .select()
      .eq('app_id', id.value)
      .single()
    app.value = dataApp || app.value

    if (cycleStart && cycleEnd) {
      const { count: statsCount } = await supabase
        .from('stats')
        .select('*', { count: 'exact', head: true })
        .eq('app_id', id.value)
        .eq('action', 'set')
        .gte('created_at', getConvertedDate2(cycleStart))
        .lte('created_at', getConvertedDate2(cycleEnd))
      if (statsCount)
        updatesNb.value = statsCount
    }
    else {
      const { count: statsCountSet } = await supabase
        .from('stats')
        .select('*', { count: 'exact', head: true })
        .eq('app_id', id.value)
        .eq('action', 'set')
      if (statsCountSet)
        updatesNb.value = statsCountSet
    }

    const { count: bundlesCount } = await supabase
      .from('app_versions')
      .select('*', { count: 'exact', head: true })
      .eq('app_id', id.value)
      .eq('deleted', false)
    if (bundlesCount)
      bundlesNb.value = bundlesCount

    const { count: channelsCount } = await supabase
      .from('channels')
      .select('*', { count: 'exact', head: true })
      .eq('app_id', id.value)
    if (channelsCount)
      channelsNb.value = channelsCount

    if (cycleStart && cycleEnd) {
      const { count: devicesCount } = await supabase
        .from('devices')
        .select('*', { count: 'exact', head: true })
        .eq('app_id', id.value)
        .gte('created_at', getConvertedDate2(cycleStart))
        .lte('created_at', getConvertedDate2(cycleEnd))
      if (devicesCount)
        devicesNb.value = devicesCount
    }
    else {
      const { count: devicesCount } = await supabase
        .from('devices')
        .select('*', { count: 'exact', head: true })
        .eq('app_id', id.value)
      if (devicesCount)
        devicesNb.value = devicesCount
    }
  }
  catch (error) {
    console.error(error)
  }
}

async function refreshData() {
  isLoading.value = true
  try {
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
    value: channelsNb,
    link: `/app/p/${appIdToUrl(id.value)}/channels`,
  },
  {
    label: t('bundles'),
    value: bundlesNb,
    link: `/app/p/${appIdToUrl(id.value)}/bundles`,
  },
  {
    label: t('devices'),
    value: devicesNb,
    link: `/app/p/${appIdToUrl(id.value)}/devices`,
  },
  {
    label: t('plan-updates'),
    value: updatesNb,
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
  <div v-if="isLoading" class="flex flex-col items-center justify-center h-full">
    <Spinner size="w-40 h-40" />
  </div>
  <div v-else class="w-full h-full px-4 pt-4 mb-8 overflow-y-auto max-h-fit lg:px-8 sm:px-6">
    <Usage :app-id="id" />

    <BlurBg class="mb-10">
      <template #default>
        <StatsBar :stats="stats" />
      </template>
    </BlurBg>
  </div>
</template>
