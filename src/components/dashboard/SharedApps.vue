<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import AppCard from './AppCard.vue'
import type { definitions } from '~/types/supabase'

const props = defineProps<{
  sharedApps: (definitions['channel_users'])[] & ChannelUserApp[]
}>()
const emit = defineEmits(['reload'])
const { t } = useI18n()
interface ChannelUserApp {
  app_id: definitions['apps']
  channel_id: definitions['channels'] & {
    version: definitions['app_versions']
  }
}
</script>

<template>
  <div id="my_apps" class="col-span-full xl:col-span-16 bg-white shadow-lg rounded-sm border border-slate-200 dark:bg-gray-800 dark:border-slate-900">
    <header class="px-5 py-4 border-b border-slate-100">
      <h2 class="font-semibold text-slate-800 dark:text-white">
        {{ t('shared-apps') }}
      </h2>
    </header>
    <div class="p-3">
      <!-- Table -->
      <div class="overflow-x-auto">
        <table class="table-auto w-full">
          <!-- Table header -->
          <thead class="text-xs uppercase text-slate-400 dark:text-white bg-slate-50 dark:bg-gray-800 rounded-sm">
            <tr>
              <th class="p-2">
                <div class="font-semibold text-left">
                  {{ t('name') }}
                </div>
              </th>
              <th class="p-2">
                <div class="font-semibold text-center">
                  {{ t('last-version') }}
                </div>
              </th>
              <th class="p-2">
                <div class="font-semibold text-center">
                  {{ t('last-upload') }}
                </div>
              </th>
              <th class="p-2">
                <div class="font-semibold text-center">
                  {{ t('channel.title') }}
                </div>
              </th>
            </tr>
          </thead>
          <!-- Table body -->
          <tbody class="text-sm font-medium divide-y divide-slate-100">
            <!-- Row -->
            <AppCard v-for="(app, i) in props.sharedApps" :key="app.app_id.app_id + i" :app="app.app_id" :channel="app.channel_id.name" @reload="emit('reload')" />
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
