<script setup lang="ts">
import type { TableColumn } from '~/components/comp_def'
import type { Database } from '~/types/supabase.types'
import { useI18n } from 'petite-vue-i18n'
import { computed, ref, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import IconSettings from '~icons/heroicons/cog-8-tooth?raw'
import Table from '~/components/Table.vue'
import { appIdToUrl } from '~/services/conversion'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'

const props = defineProps<{
  apps: (Database['public']['Tables']['apps']['Row'])[]
  header: string
  deleteButton: boolean
}>()
const { t } = useI18n()
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
    onClick: item => openSettngs(item),
    icon: IconSettings,
  },
])

function openSettngs(app: Database['public']['Tables']['apps']['Row']) {
  router.push(`/app/p/${appIdToUrl(app.app_id)}/settings`)
}

function openPackage(app: Database['public']['Tables']['apps']['Row']) {
  console.log('openPackage', app)
  router.push(`/app/package/${appIdToUrl(app.app_id)}`)
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
  <div id="my_apps" class="bg-white border rounded-lg shadow-lg col-span-full border-slate-300 xl:col-span-16 dark:border-slate-800 dark:bg-gray-800">
    <header class="px-5 py-4 rounded-t-lg">
      <h2 class="font-semibold text-slate-800 dark:text-white">
        {{ header }}
      </h2>
    </header>
    <div>
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
        class="cursor-pointer"
        @row-click="openPackage"
      />
    </div>
  </div>
</template>
