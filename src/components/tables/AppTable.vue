<script setup lang="ts">
import type { TableColumn } from '~/components/comp_def'
import type { Database } from '~/types/supabase.types'
import { Capacitor } from '@capacitor/core'
import { computed, h, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import IconSettings from '~icons/heroicons/cog-8-tooth'
import { formatDate } from '~/services/date'
import { useSupabase } from '~/services/supabase'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'

const props = defineProps<{
  apps: (Database['public']['Tables']['apps']['Row'])[]
  deleteButton: boolean
  total?: number
  currentPage?: number
  search?: string
  serverSidePagination?: boolean
  isLoading?: boolean
}>()
const emit = defineEmits([
  'addApp',
  'update:currentPage',
  'update:search',
  'reload',
  'reset',
])
const { t } = useI18n()
const isMobile = Capacitor.isNativePlatform()
const supabase = useSupabase()
const router = useRouter()
const internalSearch = ref(props.search || '')
const internalCurrentPage = ref(props.currentPage || 1)
const filters = ref({})
const main = useMainStore()
const organizationStore = useOrganizationStore()

// Create enriched apps with MAU data
const appsWithMau = ref<any[]>([])
const mauDataLoaded = ref(false)

async function loadMauNumbers() {
// Wait for dashboard data to be loaded
  await main.awaitInitialLoad()

  // Map apps with their MAU values from the dashboard (last 30 days)
  appsWithMau.value = props.apps.map((app: any) => {
    // Get the app's dashboard data
    const appDashboard = main.dashboardByapp.filter(d => d.app_id === app.app_id)

    // Accumulate MAU values for the last 30 days (same default as usage charts)
    const mau = appDashboard.reduce((acc, entry) => acc + (entry.mau ?? 0), 0)

    return {
      ...app,
      mau,
    }
  })

  mauDataLoaded.value = true
}

watchEffect(async () => {
  if (props.apps.length > 0)
    await loadMauNumbers()
})

const columns = ref<TableColumn[]>([
  {
    label: t('name'),
    key: 'name',
    mobile: true,
    sortable: true,
    head: true,
    onClick: item => openPackage(item),
    renderFunction: (item) => {
      const avatar = item.icon_url
        ? h('img', {
            src: item.icon_url,
            alt: `App icon ${item.name}`,
            class: 'mr-2 rounded-sm shrink-0 sm:mr-3 d-mask d-mask-squircle',
            width: 42,
            height: 42,
          })
        : h('div', { class: 'p-2 mr-2 text-xl bg-gray-700 d-mask d-mask-squircle' }, [
            h('span', { class: 'font-medium text-gray-300' }, (item.name?.slice(0, 2).toUpperCase() || 'AP')),
          ])

      return h('div', { class: 'flex flex-wrap items-center text-slate-800 dark:text-white' }, [
        avatar,
        h('div', { class: 'max-w-max' }, item.name),
      ])
    },
  },
  {
    label: t('last-version'),
    key: 'last_version',
    mobile: true,
    sortable: true,
    onClick: item => openOneVersion(item),
  },
  {
    label: t('last-upload'),
    key: 'updated_at',
    mobile: false,
    sortable: 'desc',
    displayFunction: item => formatDate(item.updated_at ?? ''),
  },
  {
    label: t('mau'),
    key: 'mau',
    mobile: false,
    sortable: true,
  },
  {
    label: t('app-perm'),
    key: 'perm',
    mobile: false,
    displayFunction: (item) => {
      if (item.name) {
        const org = organizationStore.getOrgByAppId(item.app_id)
        return org?.role ?? t('unknown')
      }
      return t('unknown')
    },
  },
  {
    label: '',
    key: 'actions',
    mobile: true,
    actions: [
      {
        icon: IconSettings,
        onClick: item => openSettings(item),
      },
    ],
  },
])

function openSettings(app: Database['public']['Tables']['apps']['Row']) {
  router.push(`/app/${app.app_id}/info`)
}

function openPackage(app: Database['public']['Tables']['apps']['Row']) {
  router.push(`/app/${app.app_id}`)
}

async function openOneVersion(app: Database['public']['Tables']['apps']['Row']) {
  if (!app.last_version)
    return
  const { data: versionData } = await supabase
    .from('app_versions')
    .select('id')
    .eq('app_id', app.app_id)
    .eq('name', app.last_version)
    .single()

  router.push(`/app/${app.app_id}/bundle/${versionData?.id}`)
}

// Filter apps based on search term
const filteredApps = computed(() => {
  // If MAU data isn't loaded yet, return original apps
  if (!mauDataLoaded.value) {
    // Return original apps while MAU is loading (without MAU column being sortable)
    return props.apps as any[]
  }

  let apps = appsWithMau.value

  // Apply search filter (only for client-side pagination)
  if (!props.serverSidePagination && internalSearch.value) {
    const searchLower = internalSearch.value.toLowerCase()
    apps = apps.filter((app) => {
      // Search by name (primary)
      const nameMatch = app.name?.toLowerCase().includes(searchLower)

      // Search by app_id (bundle ID - bonus feature)
      const bundleIdMatch = app.app_id.toLowerCase().includes(searchLower)

      return nameMatch || bundleIdMatch
    })
  }

  // Apply sorting
  const sortColumn = columns.value.find(col => col.sortable && typeof col.sortable === 'string')
  if (sortColumn) {
    const sorted = [...apps].sort((a, b) => {
      const key = sortColumn.key
      let aVal: any = a[key]
      let bVal: any = b[key]

      // Handle displayFunction if present
      if (sortColumn.displayFunction) {
        aVal = sortColumn.displayFunction(a)
        bVal = sortColumn.displayFunction(b)
      }

      // Handle null/undefined values for MAU (should be 0 for numbers)
      if (key === 'mau') {
        if (aVal == null)
          aVal = 0
        if (bVal == null)
          bVal = 0
      }
      else {
        if (aVal == null)
          aVal = ''
        if (bVal == null)
          bVal = ''
      }

      // Numeric comparison for numbers
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortColumn.sortable === 'asc' ? aVal - bVal : bVal - aVal
      }

      // String comparison
      const aStr = String(aVal).toLowerCase()
      const bStr = String(bVal).toLowerCase()

      if (sortColumn.sortable === 'asc') {
        return aStr < bStr ? -1 : aStr > bStr ? 1 : 0
      }
      else {
        return aStr > bStr ? -1 : aStr < bStr ? 1 : 0
      }
    })
    return sorted
  }

  return apps
})
</script>

<template>
  <div class="block w-full pb-14 md:pb-0">
    <div
      class="w-full bg-transparent border-none rounded-none shadow-none col-span-full md:bg-white md:rounded-lg md:border md:shadow-lg dark:bg-transparent md:dark:border-slate-800 md:dark:bg-gray-800 xl:col-span-16"
    >
      <Table
        v-model:filters="filters"
        v-model:columns="columns"
        v-model:current-page="internalCurrentPage"
        v-model:search="internalSearch"
        :show-add="!isMobile"
        :total="props.total ?? filteredApps.length"
        :element-list="filteredApps"
        :search-placeholder="t('search-by-name-or-app-id')"
        :is-loading="props.isLoading ?? false"
        :auto-reload="false"
        filter-text="Filters"
        @add="emit('addApp')"
        @reload="emit('reload')"
        @reset="emit('reset')"
        @update:current-page="(page: number) => emit('update:currentPage', page)"
        @update:search="(val: string) => emit('update:search', val)"
      />
    </div>
  </div>
</template>
