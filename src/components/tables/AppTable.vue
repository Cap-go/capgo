<script setup lang="ts">
import type { TableColumn } from '~/components/comp_def'
import type { Database } from '~/types/supabase.types'
import { Capacitor } from '@capacitor/core'
import { useI18n } from 'petite-vue-i18n'
import { computed, ref, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import IconSettings from '~icons/heroicons/cog-8-tooth'
import { appIdToUrl } from '~/services/conversion'
import { formatDate } from '~/services/date'
import { useSupabase } from '~/services/supabase'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'

const props = defineProps<{
  apps: (Database['public']['Tables']['apps']['Row'])[]
  deleteButton: boolean
}>()
const emit = defineEmits([
  'addApp',
])
const { t } = useI18n()
const isMobile = Capacitor.isNativePlatform()
const supabase = useSupabase()
const router = useRouter()
const search = ref('')
const currentPage = ref(1)
const filters = ref({})
const main = useMainStore()
const organizationStore = useOrganizationStore()
const mauNumbers = ref<Record<string, number>>({})

async function loadMauNumbers() {
  const promises = props.apps.map(async (app) => {
    if (app.app_id) {
      const mau = await main.getTotalMauByApp(app.app_id, organizationStore.currentOrganization?.subscription_start)
      mauNumbers.value[app.app_id] = mau
    }
  })
  await Promise.all(promises)
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
    allowHtml: true,
    sanitizeHtml: true,
    onClick: item => openPackage(item),
    displayFunction: (item) => {
      return `
        <div class="flex flex-wrap items-center text-slate-800 dark:text-white">
          ${item.icon_url
              ? `<img src="${item.icon_url}" alt="App icon ${item.name}" class="mr-2 rounded-sm shrink-0 sm:mr-3 mask mask-squircle" width="42" height="42">`
              : `<div class="p-2 mr-2 text-xl bg-gray-700 mask mask-squircle">
                <span class="font-medium text-gray-300">${item.name?.slice(0, 2).toUpperCase() || 'AP'}</span>
              </div>`
          }
          <div class="max-w-max">${item.name}</div>
        </div>
      `
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
    displayFunction: item => formatDate(item.updated_at || ''),
  },
  {
    label: t('mau'),
    key: 'mau',
    mobile: false,
    displayFunction: item => mauNumbers.value[item.app_id] || 0,
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
        onClick: item => openSettngs(item),
      },
    ],
  },
])

function openSettngs(app: Database['public']['Tables']['apps']['Row']) {
  router.push(`/app/p/${appIdToUrl(app.app_id)}?tab=info`)
}

function openPackage(app: Database['public']['Tables']['apps']['Row']) {
  router.push(`/app/p/${appIdToUrl(app.app_id)}`)
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

  router.push(`/app/p/${appIdToUrl(app.app_id)}/bundle/${versionData?.id}`)
}

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
  <div class="pb-14 md:pb-0 w-full block">
    <div class="bg-white border rounded-lg shadow-lg col-span-full border-slate-300 xl:col-span-16 dark:border-slate-800 dark:bg-gray-800">
      <Table
        v-model:filters="filters"
        v-model:columns="columns"
        v-model:current-page="currentPage"
        v-model:search="search"
        :show-add="!isMobile"
        :total="filteredApps.length"
        :element-list="filteredApps"
        :search-placeholder="t('search-by-name-or-bundle-id')"
        :is-loading="false"
        filter-text="Filters"
        @add="emit('addApp')"
      />
    </div>
  </div>
</template>
