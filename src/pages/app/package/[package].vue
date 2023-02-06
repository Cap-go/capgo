<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { useSupabase } from '~/services/supabase'
import Spinner from '~/components/Spinner.vue'
import Usage from '~/components/dashboard/Usage.vue'
import type { Database } from '~/types/supabase.types'

const route = useRoute()
const supabase = useSupabase()
const id = ref('')
const isLoading = ref(false)
const app = ref<Database['public']['Tables']['apps']['Row']>()
const channelsNb = ref(0)
const bundlesNb = ref(0)
const devicesNb = ref(0)

const loadAppInfo = async () => {
  try {
    const { data: dataApp } = await supabase
      .from('apps')
      .select()
      .eq('app_id', id.value)
      .single()
    app.value = dataApp || app.value

    // get channels count
    const { data: dataChannels } = await supabase
      .from('channels')
      .select('id').eq('app_id', id.value)
    channelsNb.value = dataChannels?.length || 0
    // get bundles count
    const { data: dataBundles } = await supabase
      .from('app_versions')
      .select('id').eq('app_id', id.value).eq('deleted', false)
    bundlesNb.value = dataBundles?.length || 0
    // get devices count
    const { data: dataDevices } = await supabase
      .from('devices')
      .select('device_id').eq('app_id', id.value)
    devicesNb.value = dataDevices?.length || 0
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
  <div v-else class="h-full w-full">
    <div class="w-full h-full px-4 py-8 mb-8 overflow-y-scroll sm:px-6 lg:px-8 max-h-fit">
      <div class="lg:max-w-xl lg:mx-auto sm:text-center pb-8">
        <h2 class="text-3xl font-bold text-gray-900 dark:text-white sm:text-4xl xl:text-5xl font-pj">
          {{ app?.name }}
        </h2>
      </div>
      <Usage :app-id="id" />

      <section class="py-12">
        <div class="px-4 mx-auto max-w-7xl sm:px-6 lg:px-8">
          <div class="grid max-w-6xl grid-cols-1 gap-6 mx-auto mt-8 sm:grid-cols-3 lg:gap-x-12 xl:gap-x-20">
            <AppStat :number="channelsNb" label="Channels" :link="`/app/p/${id.replace(/\./g, '--')}/channels`" />
            <AppStat :number="bundlesNb" label="Bundles" :link="`/app/p/${id.replace(/\./g, '--')}/bundles`" />
            <AppStat :number="devicesNb" label="Devices" :link="`/app/p/${id.replace(/\./g, '--')}/devices`" />
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style>
  #confirm-button {
    background-color: theme('colors.red.500');
    color: theme('colors.white');
  }
</style>
