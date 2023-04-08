<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSupabase } from '~/services/supabase'
import Spinner from '~/components/Spinner.vue'
import Usage from '~/components/dashboard/Usage.vue'
import type { Database } from '~/types/supabase.types'
import { useDisplayStore } from '~/stores/display'
import type { Stat } from '~/components/comp_def'
import { appIdToUrl, urlToAppId } from '~/services/conversion'

const route = useRoute()
const { t } = useI18n()
const supabase = useSupabase()
const displayStore = useDisplayStore()
const id = ref('')
const isLoading = ref(false)
const app = ref<Database['public']['Tables']['apps']['Row']>()
const channelsNb = ref(0)
const bundlesNb = ref(0)
const devicesNb = ref(0)
const updatesNb = ref(0)

async function loadAppInfo() {
  try {
    const { data: dataApp } = await supabase
      .from('apps')
      .select()
      .eq('app_id', id.value)
      .single()
    app.value = dataApp || app.value

    const date_id = new Date().toISOString().slice(0, 7)
    const { data } = await supabase
      .from('app_stats')
      .select()
      .eq('app_id', id.value)
      .eq('date_id', date_id)
      .single()
    if (data) {
      updatesNb.value = Math.max(data.mlu, data.mlu_real)
      devicesNb.value = data.devices
      bundlesNb.value = data.versions
      channelsNb.value = data.channels
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
    displayStore.defaultBack = `/app/package/${route.params.package}/channels`
  }
})
</script>

<template>
  <div v-if="isLoading" class="flex flex-col items-center justify-center h-full">
    <Spinner size="w-40 h-40" />
  </div>
  <div v-else class="w-full h-full px-4 pt-4 mb-8 overflow-y-scroll max-h-fit lg:px-8 sm:px-6">
    <Usage :app-id="id" />

    <BlurBg class="mb-10">
      <template #default>
        <StatsBar :stats="stats" />
      </template>
    </BlurBg>
  </div>
</template>
