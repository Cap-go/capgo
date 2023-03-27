<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { kList } from 'konsta/vue'
import AppCard from './AppCard.vue'
import type { Database } from '~/types/supabase.types'

const props = defineProps<{
  sharedApps: (Database['public']['Tables']['channel_users']['Row'])[] & ChannelUserApp[]
}>()
const emit = defineEmits(['reload'])
const { t } = useI18n()
interface ChannelUserApp {
  app_id: Database['public']['Tables']['apps']['Row']
  channel_id: Database['public']['Tables']['channels']['Row'] & {
    version: Database['public']['Tables']['app_versions']['Row']
  }
}
</script>

<template>
  <div id="my_shared_apps" class="col-span-full border border-slate-200 rounded-lg bg-white shadow-lg xl:col-span-16 dark:border-slate-900 dark:bg-gray-800">
    <header class="border-b border-slate-100 px-5 py-4">
      <h2 class="font-semibold text-slate-800 dark:text-white">
        {{ t('shared-apps') }}
      </h2>
    </header>
    <div class="">
      <!-- Table -->
      <div class="hidden overflow-x-auto p-3 md:block">
        <table class="w-full table-auto" aria-label="Table with shared apps">
          <!-- Table header -->
          <thead class="rounded-sm bg-slate-50 text-xs uppercase text-slate-400 dark:bg-gray-800 dark:text-white">
            <tr>
              <th class="w-60 p-2">
                <div class="text-left font-semibold">
                  {{ t('name') }}
                </div>
              </th>
              <th class="w-60 p-2">
                <div class="text-center font-semibold">
                  {{ t('last-version') }}
                </div>
              </th>
              <th class="w-60 p-2">
                <div class="text-center font-semibold">
                  {{ t('last-upload') }}
                </div>
              </th>
              <th class="w-60 p-2">
                <div class="text-center font-semibold">
                  {{ t('channel') }}
                </div>
              </th>
              <th class="w-60 p-2" />
            </tr>
          </thead>
          <!-- Table body -->
          <tbody class="text-sm font-medium divide-y divide-slate-100">
            <!-- Row -->
            <AppCard v-for="(app, i) in props.sharedApps" :key="app.app_id.app_id + i" :app="app.app_id" :channel="app.channel_id.name" @reload="emit('reload')" />
          </tbody>
        </table>
      </div>
      <k-list class="my-0 w-full md:hidden">
        <AppCard v-for="(app, i) in props.sharedApps" :key="app.app_id.app_id + i" :app="app.app_id" :channel="app.channel_id.name" @reload="emit('reload')" />
      </k-list>
    </div>
  </div>
</template>
