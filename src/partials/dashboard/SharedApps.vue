<script setup lang="ts">
import AppCard from './AppCard.vue'
import type { definitions } from '~/types/supabase'

interface ChannelUserApp {
  app_id: definitions['apps']
  channel_id: definitions['channels'] & {
    version: definitions['app_versions']
  }
}

const props = defineProps<{
  sharedApps: (definitions['channel_users'])[] & ChannelUserApp[]
}>()
</script>

<template>
  <div id="my_apps" class="col-span-full xl:col-span-16 bg-white shadow-lg rounded-sm border border-slate-200">
    <header class="px-5 py-4 border-b border-slate-100">
      <h2 class="font-semibold text-slate-800">
        Shared Apps
      </h2>
    </header>
    <div class="p-3">
      <!-- Table -->
      <div class="overflow-x-auto">
        <table class="table-auto w-full">
          <!-- Table header -->
          <thead class="text-xs uppercase text-slate-400 bg-slate-50 rounded-sm">
            <tr>
              <th class="p-2">
                <div class="font-semibold text-left">
                  Name
                </div>
              </th>
              <th class="p-2">
                <div class="font-semibold text-center">
                  Last version
                </div>
              </th>
              <th class="p-2">
                <div class="font-semibold text-center">
                  Last upload
                </div>
              </th>
              <th class="p-2">
                <div class="font-semibold text-center">
                  Devices
                </div>
              </th>
            </tr>
          </thead>
          <!-- Table body -->
          <tbody class="text-sm font-medium divide-y divide-slate-100">
            <!-- Row -->
            <AppCard v-for="app in props.sharedApps" :key="app.app_id.app_id" :app="app.app_id" />
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
