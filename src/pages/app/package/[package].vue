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
import { appIdToUrl, urlToAppId } from '~/services/conversion'

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

const cycleStart = main.cycleInfo?.subscription_anchor_start
const cycleEnd = main.cycleInfo?.subscription_anchor_end

async function loadAppInfo() {
  try {
    const { data: dataApp } = await supabase
      .from('apps')
      .select()
      .eq('app_id', id.value)
      .single()
    app.value = dataApp || app.value
    const { data } = await supabase
      .from('stats')
      .select()
      .eq('app_id', id.value)
      .eq('action', 'set')
    if (data) {
      data.forEach((item: Database['public']['Tables']['stats']['Row']) => {
        if (item.created_at) {
          const createdAtDate = new Date(item.created_at)
          // createdAtDate = new Date(createdAtDate.setMonth(createdAtDate.getMonth() + 1));
          let notContinue = false
          // condition in which this shall not proceed with calculation
          if (cycleStart) {
            if (createdAtDate < new Date(cycleStart))
              notContinue = true
          }
          if (cycleEnd) {
            if (createdAtDate > new Date(cycleEnd))
              notContinue = true
          }
          // if not anything of the above, it is false and proceed
          if (!notContinue)
            updatesNb.value = updatesNb.value + 1
        }
      })
    }
    const { data: bundlesData } = await supabase
      .from('app_versions')
      .select()
      .eq('app_id', id.value)
      .eq('deleted', false)
    if (bundlesData)
      bundlesNb.value = bundlesData.length

    const { data: channelsData } = await supabase
      .from('channels')
      .select()
      .eq('app_id', id.value)
    if (channelsData)
      channelsNb.value = channelsData.length

    const { data: devicesData } = await supabase
      .from('devices')
      .select()
      .eq('app_id', id.value)
    if (devicesData) {
      devicesData.forEach((item: Database['public']['Tables']['devices']['Row']) => {
        if (item.created_at) {
          const createdAtDate = new Date(item.created_at)
          // createdAtDate = new Date(createdAtDate.setMonth(createdAtDate.getMonth() + 1));
          let notContinue = false
          // condition in which this shall not proceed with calculation
          if (cycleStart) {
            if (createdAtDate < new Date(cycleStart))
              notContinue = true
          }
          if (cycleEnd) {
            if (createdAtDate > new Date(cycleEnd))
              notContinue = true
          }
          // if not anything of the above, it is false and proceed
          if (!notContinue)
            devicesNb.value = devicesNb.value + 1
        }
      })
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
