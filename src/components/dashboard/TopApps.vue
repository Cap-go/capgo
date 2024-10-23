<script setup lang="ts">
import { useI18n } from 'petite-vue-i18n'
import type { Database } from '~/types/supabase.types'
import AppCard from './AppCard.vue'

const props = defineProps<{
  apps: (Database['public']['Tables']['apps']['Row'])[]
  header: string
  deleteButton: boolean
}>()
const { t } = useI18n()
</script>

<template>
  <div id="my_apps" class="bg-white border rounded-lg shadow-lg col-span-full border-slate-300 xl:col-span-16 dark:border-slate-800 dark:bg-gray-800">
    <header class="px-5 py-4 rounded-t-lg">
      <h2 class="font-semibold text-slate-800 dark:text-white">
        {{ header }}
      </h2>
    </header>
    <div class="">
      <!-- Table -->
      <div class="overflow-x-auto">
        <table id="top_apps" class="w-full table-auto" aria-label="Table with your apps">
          <!-- Table header -->
          <thead class="text-xs uppercase rounded-lg text-slate-400 dark:text-white bg-gray-50 dark:bg-gray-700">
            <tr>
              <th class="table-cell w-1/5 p-2 md:hidden">
                <div class="font-semibold text-left" />
              </th>
              <th class="w-1/5 p-2">
                <div class="font-semibold text-left">
                  {{ t('name') }}
                </div>
              </th>
              <th class="w-1/5 p-2">
                <div class="font-semibold text-center">
                  {{ t('last-version') }}
                </div>
              </th>
              <th class="hidden w-1/5 p-2 md:table-cell">
                <div class="font-semibold text-center">
                  {{ t('last-upload') }}
                </div>
              </th>
              <th class="hidden w-1/5 p-2 md:table-cell">
                <div class="font-semibold text-center">
                  {{ t('mau') }}
                </div>
              </th>
              <th class="hidden w-1/5 p-2 md:table-cell">
                <div class="font-semibold text-center">
                  {{ t('app-perm') }}
                </div>
              </th>
              <th class="hidden w-1/5 p-2 md:table-cell">
                <div class="font-semibold text-left" />
              </th>
            </tr>
          </thead>
          <!-- Table body -->
          <tbody class="text-sm font-medium divide-y divide-slate-200 dark:divide-slate-500">
            <!-- Row -->
            <AppCard v-for="(app, i) in props.apps" :key="app.app_id + i" :delete-button="deleteButton" :app="app" channel="" />
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
