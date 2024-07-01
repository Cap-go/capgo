<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { kList } from 'konsta/vue'
import AppCard from './AppCard.vue'
import type { Database } from '~/types/supabase.types'

const props = defineProps<{
  apps: (Database['public']['Tables']['apps']['Row'])[]
  header: string
  deleteButton: boolean
}>()
const { t } = useI18n()
</script>

<template>
  <div id="my_apps" class="bg-white border rounded-lg shadow-lg col-span-full border-slate-200 xl:col-span-16 dark:border-slate-900 dark:bg-gray-800">
    <header class="px-5 py-4 border-b border-slate-100">
      <h2 class="font-semibold text-slate-800 dark:text-white">
        {{ header }}
      </h2>
    </header>
    <div class="">
      <!-- Table -->
      <div class="hidden p-3 overflow-x-auto md:block">
        <table id="top_apps" class="w-full table-auto" aria-label="Table with your apps">
          <!-- Table header -->
          <thead class="text-xs uppercase rounded-sm bg-slate-50 text-slate-400 dark:bg-gray-800 dark:text-white">
            <tr>
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
              <th class="w-1/5 p-2">
                <div class="font-semibold text-center">
                  {{ t('last-upload') }}
                </div>
              </th>
              <th class="w-1/5 p-2">
                <div class="font-semibold text-center">
                  {{ t('mau') }}
                </div>
              </th>
              <th class="w-1/5 p-2">
                <div class="font-semibold text-center">
                  {{ t('app-perm') }}
                </div>
              </th>
              <th class="w-1/5 p-2" />
            </tr>
          </thead>
          <!-- Table body -->
          <tbody class="text-sm font-medium divide-y divide-slate-100">
            <!-- Row -->
            <AppCard v-for="(app, i) in props.apps" :key="app.app_id + i" :delete-button="deleteButton" :app="app" channel="" />
          </tbody>
        </table>
      </div>
      <k-list class="w-full my-0 md:hidden">
        <AppCard v-for="(app, i) in props.apps" :key="app.app_id + i" :delete-button="deleteButton" :app="app" channel="" />
      </k-list>
    </div>
  </div>
</template>
