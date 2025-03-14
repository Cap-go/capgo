<script setup lang="ts">
import type { TableColumn } from '~/components/comp_def'
import type { Database } from '~/types/supabase.types'
import { useI18n } from 'petite-vue-i18n'
import { computed, ref } from 'vue'
import Table from '~/components/Table.vue'
import AppCard from './AppCard.vue'

const props = defineProps<{
  apps: (Database['public']['Tables']['apps']['Row'])[]
  header: string
  deleteButton: boolean
}>()
const { t } = useI18n()

// Add search functionality
const search = ref('')
const currentPage = ref(1)
const filters = ref({})
const columns = ref<TableColumn[]>([
  {
    label: t('name'),
    key: 'name',
    mobile: true,
    sortable: true,
    head: true,
  },
  {
    label: t('last-version'),
    key: 'last_version',
    mobile: true,
    sortable: true,
  },
  {
    label: t('last-upload'),
    key: 'updated_at',
    mobile: false,
    sortable: 'desc',
  },
  {
    label: t('mau'),
    key: 'mau',
    mobile: false,
  },
  {
    label: t('app-perm'),
    key: 'perm',
    mobile: false,
  },
])

// Filter apps based on search term
const filteredApps = computed(() => {
  if (!search.value)
    return props.apps

  const searchLower = search.value.toLowerCase()
  return props.apps.filter((app) => {
    // Search by name (primary)
    const nameMatch = app.name?.toLowerCase().includes(searchLower)

    // Search by app_id (bundle ID - bonus feature)
    const bundleIdMatch = app.app_id.toLowerCase().includes(searchLower)

    return nameMatch || bundleIdMatch
  })
})
</script>

<template>
  <div id="my_apps" class="bg-white border rounded-lg shadow-lg col-span-full border-slate-300 xl:col-span-16 dark:border-slate-800 dark:bg-gray-800">
    <header class="px-5 py-4 rounded-t-lg">
      <h2 class="font-semibold text-slate-800 dark:text-white">
        {{ header }}
      </h2>
    </header>
    <div>
      <!-- Table with search functionality -->
      <Table
        v-model:filters="filters"
        v-model:columns="columns"
        v-model:current-page="currentPage"
        v-model:search="search"
        :total="filteredApps.length"
        :element-list="filteredApps"
        :search-placeholder="t('search-by-name-or-bundle-id')"
        :is-loading="false"
        filter-text="Filters"
      >
        <template #default>
          <!-- Table body -->
          <tbody class="text-sm font-medium divide-y divide-slate-200 dark:divide-slate-500">
            <!-- Row -->
            <AppCard
              v-for="(app, i) in filteredApps"
              :key="app.app_id + i"
              :delete-button="deleteButton"
              :app="app"
              channel=""
            />
          </tbody>
        </template>
      </Table>
    </div>
  </div>
</template>
