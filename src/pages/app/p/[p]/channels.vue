<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  kList,
} from 'konsta/vue'
import { useSupabase } from '~/services/supabase'
import type { Database } from '~/types/supabase.types'

const emit = defineEmits(['reload'])
const route = useRoute()
const supabase = useSupabase()
const appId = ref('')
const isLoading = ref(false)
const { t } = useI18n()
const channels = ref<(Database['public']['Tables']['channels']['Row'] & Channel)[]>([])

const loadAppInfo = async () => {
  try {
    const { data: dataChannel } = await supabase
      .from('channels')
      .select(`
          id,
          name,
          app_id,
          public,
          version (
            name,
            created_at
          ),
          created_at,
          updated_at
          `)
      .eq('app_id', appId.value)
      .order('updated_at', { ascending: false })
    channels.value = (dataChannel || channels.value) as (Database['public']['Tables']['channels']['Row'] & Channel)[]
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

interface Channel {
  id: string
  version: {
    name: string
    created_at: string
  }
}

watchEffect(async () => {
  if (route.path.endsWith('/channels')) {
    appId.value = route.params.p as string
    appId.value = appId.value.replace(/--/g, '.')
    await refreshData()
  }
})
</script>

<template>
  <TitleHead :title="`${t('package.channels')}`" color="warning" :default-back="`/app/package/${route.params.p}`" />
  <div class="h-full overflow-y-scroll py-4">
    <div id="channels" class="mt-5 border md:w-2/3 mx-auto rounded-lg shadow-lg border-slate-200 dark:bg-gray-800 dark:border-slate-900 flex flex-col overflow-y-scroll">
      <header class="px-5 py-4 border-b border-slate-100">
        <h2 class="font-semibold text-xl text-slate-800 dark:text-white">
          {{ t('package.channels') }}
        </h2>
      </header>
      <div class="">
        <!-- Table -->
        <div class="hidden md:block overflow-x-auto p-3">
          <table class="w-full table-auto" aria-label="Table with your apps">
            <!-- Table header -->
            <thead class="text-md uppercase rounded-sm text-slate-400 dark:text-white bg-slate-50 dark:bg-gray-800">
              <tr>
                <th class="p-2">
                  <div class="font-semibold text-left">
                    {{ t('name') }}
                  </div>
                </th>
                <th class="p-2">
                  <div class="font-semibold text-left">
                    {{ t('last-version') }}
                  </div>
                </th>
                <th class="p-2">
                  <div class="font-semibold text-left">
                    {{ t('last-upload') }}
                  </div>
                </th>
                <th class="p-2">
                  <div class="font-semibold text-left">
                    {{ t('button.options') }}
                  </div>
                </th>
              </tr>
            </thead>
            <!-- Table body -->
            <tbody class="text-md font-medium divide-y divide-slate-100">
              <!-- Row -->
              <ChannelCard v-for="(channel, i) in channels" :key="channel.name + i" :channel="channel" @reload="emit('reload')" />
            </tbody>
          </table>
        </div>
        <k-list class="md:hidden w-full my-0">
          <ChannelCard v-for="(channel, i) in channels" :key="channel.name + i" :channel="channel" @reload="emit('reload')" />
        </k-list>
      </div>
    </div>
  </div>
</template>
