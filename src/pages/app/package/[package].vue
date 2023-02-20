<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSupabase } from '~/services/supabase'
import Spinner from '~/components/Spinner.vue'
import Usage from '~/components/dashboard/Usage.vue'
import type { Database } from '~/types/supabase.types'
import { useDisplayStore } from '~/stores/display'

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
const stats = computed(() => ([
  {
    label: t('channels'),
    value: channelsNb,
    link: `/app/p/${id.value.replace(/\./g, '--')}/channels`,
  },
  {
    label: t('bundles'),
    value: bundlesNb,
    link: `/app/p/${id.value.replace(/\./g, '--')}/bundles`,
  },
  {
    label: t('devices'),
    value: devicesNb,
    link: `/app/p/${id.value.replace(/\./g, '--')}/devices`,
  },
  {
    label: t('plan-updates'),
    value: updatesNb,
    link: `/app/p/${id.value.replace(/\./g, '--')}/logs`,
  },
]))

watchEffect(async () => {
  if (route.path.startsWith('/app/package')) {
    id.value = route.params.package as string
    id.value = id.value.replace(/--/g, '.')
    await refreshData()
    displayStore.NavTitle = app.value?.name || ''
    displayStore.defaultBack = `/app/package/${route.params.package}/channels`
  }
})
</script>

<template>
  <div v-if="isLoading" class="flex justify-center chat-items">
    <Spinner />
  </div>
  <div v-else class="w-full h-full px-4 pt-4 mb-8 overflow-y-scroll sm:px-6 lg:px-8 max-h-fit">
    <Usage :app-id="id" />

    <div class="relative mt-12 mb-12 lg:mt-20 lg:max-w-5xl lg:mx-auto">
      <div class="absolute -inset-2">
        <div class="w-full h-full mx-auto rounded-lg opacity-30 blur-lg filter" style="background: linear-gradient(90deg, #44ff9a -0.55%, #44b0ff 22.86%, #8b44ff 48.36%, #ff6644 73.33%, #ebff70 99.34%)" />
      </div>

      <div class="absolute -inset-px bg-gradient-to-r from-cyan-500 to-purple-500 rounded-xl" />

      <div class="relative flex flex-col items-stretch overflow-hidden text-center bg-black md:flex-row md:text-left rounded-xl bg-opacity-90">
        <template v-for="s, i in stats" :key="i">
          <div v-if="i > 0" class="w-full h-px md:h-auto md:w-px bg-gradient-to-r from-cyan-500 to-purple-500 shrink-0" />

          <a :href="s.link" class="flex flex-col items-center w-full p-10 group hover:bg-gray-800 sm:px-12 lg:px-16 lg:py-14 ">
            <span class="text-center duration-100 ease-in scale-100 group-hover:scale-150">
              <p class="text-5xl font-bold text-white lg:mt-3 lg:order-1 font-pj">
                {{ s.value }}
              </p>
              <h3 class="mt-5 text-sm font-bold tracking-widest text-gray-400 uppercase lg:mt-0 lg:order-2 font-pj">
                {{ s.label }}
              </h3>
            </span>
          </a>
        </template>
      </div>
    </div>
  </div>
</template>
