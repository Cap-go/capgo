<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSupabase } from '~/services/supabase'
import Spinner from '~/components/Spinner.vue'
import Usage from '~/components/dashboard/Usage.vue'
import type { Database } from '~/types/supabase.types'

const route = useRoute()
const { t } = useI18n()
const supabase = useSupabase()
const id = ref('')
const isLoading = ref(false)
const app = ref<Database['public']['Tables']['apps']['Row']>()
const channelsNb = ref(0)
const bundlesNb = ref(0)
const devicesNb = ref(0)
const updatesNb = ref(0)

const loadAppInfo = async () => {
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

const refreshData = async () => {
  isLoading.value = true
  try {
    await loadAppInfo()
  }
  catch (error) {
    console.error(error)
  }
  isLoading.value = false
}

watchEffect(async () => {
  if (route.path.startsWith('/app/package')) {
    id.value = route.params.package as string
    id.value = id.value.replace(/--/g, '.')
    await refreshData()
  }
})
</script>

<template>
  <div v-if="isLoading" class="flex justify-center chat-items">
    <Spinner />
  </div>
  <div v-else class="w-full h-full">
    <TitleHead :title="app?.name || ''" :default-back="`/app/package/${route.params.p}/channels`" />
    <div class="w-full h-full px-4 mb-8 overflow-y-scroll sm:px-6 lg:px-8 max-h-fit">
      <Usage :app-id="id" />
      <section class="py-12">
        <div class="px-4 mx-auto max-w-7xl sm:px-6 lg:px-8">
          <div class="grid max-w-6xl grid-cols-1 gap-6 mx-auto mt-8 sm:grid-cols-4 lg:gap-x-12 xl:gap-x-20">
            <AppStat :number="channelsNb" :label="t('channels')" :link="`/app/p/${id.replace(/\./g, '--')}/channels`" />
            <AppStat :number="bundlesNb" :label="t('package.versions')" :link="`/app/p/${id.replace(/\./g, '--')}/bundles`" />
            <AppStat :number="devicesNb" :label="t('devices.title')" :link="`/app/p/${id.replace(/\./g, '--')}/devices`" />
            <AppStat :number="updatesNb" :label="t('plan.updates')" :link="`/app/p/${id.replace(/\./g, '--')}/logs`" />
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
