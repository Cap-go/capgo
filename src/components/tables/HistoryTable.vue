<script setup lang="ts">
import type { TableColumn, TableSort } from '~/components/comp_def'

import { useI18n } from 'petite-vue-i18n'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import IconReload from '~icons/tabler/reload'
import { formatDate } from '~/services/date'
import { useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'
import { useOrganizationStore } from '~/stores/organization'

// Define custom type for deploy_history since it doesn't exist in Database types
interface DeployHistory {
  id: number
  version_id: number
  app_id: string
  channel_id: number
  deployed_at: string
  link?: string
  comment?: string
  created_by: string
  version: {
    id: number
    name: string
    app_id: string
    created_at: string
    link?: string
    comment?: string
  }
  user?: {
    id: string
    email: string
  }
}

const props = defineProps<{
  channelId: number
  appId: string
}>()

const { t } = useI18n()
const supabase = useSupabase()
const organizationStore = useOrganizationStore()
const displayStore = useDisplayStore()

const deployHistory = ref<DeployHistory[]>([])
const loading = ref(true)
const sort = ref<TableSort>({
  deployed_at: 'desc',
})
const search = ref('')
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const currentVersionId = ref<number | null>(null)

// Fetch current channel's version_id
async function fetchCurrentVersion() {
  try {
    const { data, error } = await supabase
      .from('channels')
      .select('version')
      .eq('id', props.channelId)
      .single()

    if (error) {
      console.error('Error fetching current version:', error)
      return
    }

    currentVersionId.value = data.version
  }
  catch (error) {
    console.error('Error fetching current version:', error)
  }
}

// Check if an item is the current version
function isCurrentVersion(item: DeployHistory): boolean {
  return item.version_id === currentVersionId.value
}

// Function to open link in a new tab
function openLink(url?: string): void {
  if (url) {
    // Using window from global scope
    const win = window.open(url, '_blank')
    // Add some security with noopener
    if (win)
      win.opener = null
  }
}

const columns = computed<TableColumn[]>(() => [
  {
    label: t('bundle-number'),
    key: 'version.name',
    mobile: true,
    sortable: true,
    displayFunction: item => item.version.name,
  },
  {
    label: t('created-at'),
    key: 'version.created_at',
    mobile: false,
    sortable: true,
    displayFunction: item => formatDate(item.version.created_at),
  },
  {
    label: t('deploy-date'),
    key: 'deployed_at',
    mobile: true,
    sortable: true,
    displayFunction: item => formatDate(item.deployed_at),
  },
  {
    label: t('deployed-by'),
    key: 'created_by',
    mobile: false,
    displayFunction: item => item.user?.email || '-',
  },
  {
    label: t('link'),
    key: 'link',
    mobile: false,
    displayFunction: item => item.link || '-',
    onClick: (item) => {
      if (item.link) {
        openLink(item.link)
      }
    },
  },
  {
    label: t('comment'),
    key: 'comment',
    mobile: false,
    displayFunction: item => item.comment || '-',
  },
  {
    label: t('rollback-to-this-version'),
    key: 'rollback',
    mobile: false,
    class: 'text-center',
    displayFunction: (item) => {
      return isCurrentVersion(item) ? 'Current' : 'Rollback'
    },
    onClick: (item) => {
      // Only allow rollback if it's not the current version
      if (!isCurrentVersion(item)) {
        handleRollback(item)
      }
    },
  },
])

async function fetchDeployHistory() {
  loading.value = true
  try {
    deployHistory.value.length = 0
    await fetchCurrentVersion()

    // Using "deploy_history" as a string rather than a type reference
    let query = supabase
      .from('deploy_history')
      .select(`
        *,
        version:version_id (
          id,
          name,
          app_id,
          created_at,
          link,
          comment
        ),
        user:created_by (
          id,
          first_name,
          last_name
        )
      `, { count: 'exact' })
      .eq('channel_id', props.channelId)
      .eq('app_id', props.appId)
      .order(Object.keys(sort.value)[0], { ascending: Object.values(sort.value)[0] === 'asc' })

    // Apply search filter on version name if search value exists
    if (search.value) {
      query = query.like('version.name', `%${search.value}%`)
    }

    const { data, error, count } = await query
      .range((page.value - 1) * pageSize.value, page.value * pageSize.value - 1)

    if (error) {
      console.error('Error fetching deploy history:', error)
      toast.error(t('error-fetching-deploy-history'))
      return
    }
    // filter out data with no version name
    const filteredData = data.filter((item) => {
      return item?.version !== null
    }) as unknown as DeployHistory[]

    deployHistory.value = filteredData

    total.value = count || 0
  }
  catch (error) {
    console.error('Error fetching deploy history:', error)
    toast.error(t('error-fetching-deploy-history'))
  }
  finally {
    loading.value = false
  }
}

async function handleRollback(item: DeployHistory) {
  const role = await organizationStore.getCurrentRoleForApp(props.appId)
  if (!organizationStore.hasPermisisonsInRole(role, ['admin', 'super_admin', 'write'])) {
    toast.error(t('no-permission'))
    return
  }

  displayStore.dialogOption = {
    header: t('rollback-to-version'),
    message: t('confirm-rollback-desc'),
    buttons: [
      {
        text: t('confirm'),
        handler: async () => {
          try {
            const { error } = await supabase
              .from('channels')
              .update({ version: item.version_id })
              .eq('id', props.channelId)

            if (error) {
              console.error('Error rolling back version:', error)
              toast.error(t('error-rollback'))
              return
            }

            toast.success(t('rollback-success'))
            currentVersionId.value = item.version_id
            fetchDeployHistory()
          }
          catch (error) {
            console.error('Error rolling back version:', error)
            toast.error(t('error-rollback'))
          }
        },
      },
      {
        text: t('cancel'),
        role: 'cancel',
      },
    ],
  }
  displayStore.showDialog = true
}

watch([() => props.channelId, () => props.appId, sort, page, pageSize, search], fetchDeployHistory, { immediate: true })
</script>

<template>
  <div>
    <div class="flex justify-between p-2">
      <button
        class="flex items-center p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
        @click="fetchDeployHistory"
      >
        <IconReload class="w-5 h-5 mr-1" />
        {{ t('reload') }}
      </button>
      <div class="relative">
        <input
          v-model="search"
          class="w-full pl-10 pr-4 py-2 border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-700"
          :placeholder="t('search-by-name')"
          type="text"
        >
        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <span v-html="'<svg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke-width=\'1.5\' stroke=\'currentColor\' class=\'w-5 h-5 text-gray-500 dark:text-gray-400\'><path stroke-linecap=\'round\' stroke-linejoin=\'round\' d=\'m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z\' /></svg>'" />
        </div>
      </div>
    </div>

    <!-- Custom table rendering to handle rollback column -->
    <div class="block">
      <table class="w-full text-sm text-left text-gray-500 dark:text-gray-400">
        <thead class="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
          <tr>
            <th v-for="col in columns" :key="col.key" scope="col" class="py-3 px-6" :class="{ 'hidden md:table-cell': !col.mobile }">
              <div class="flex items-center">
                {{ col.label }}
                <div v-if="col.sortable">
                  <span @click="sort = { [col.key]: sort[col.key] === 'asc' ? 'desc' : 'asc' }">
                    ↑↓
                  </span>
                </div>
              </div>
            </th>
          </tr>
        </thead>
        <tbody v-if="!loading && deployHistory.length > 0">
          <tr v-for="item in deployHistory" :key="item.id" class="bg-white border-b dark:border-gray-700 dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-600">
            <td class="px-6 py-4">{{ item.version.name }}</td>
            <td class="px-6 py-4 hidden md:table-cell">{{ formatDate(item.version.created_at) }}</td>
            <td class="px-6 py-4">{{ formatDate(item.deployed_at) }}</td>
            <td class="px-6 py-4 hidden md:table-cell">{{ `${item.user?.first_name} ${item.user?.last_name}` }}</td>
            <td class="px-6 py-4 hidden md:table-cell">
              <span 
                v-if="item.version.link" 
                class="text-blue-500 underline cursor-pointer"
                @click="openLink(item.version.link)"
              >
                {{ item.version.link }}
              </span>
              <span v-else>-</span>
            </td>
            <td class="px-6 py-4 hidden md:table-cell">{{ item.version.comment || '-' }}</td>
            <td class="px-6 py-4 text-center hidden md:table-cell">
              <span v-if="isCurrentVersion(item)">Current</span>
              <span
                v-else
                class="text-blue-500 underline cursor-pointer"
                @click="handleRollback(item)"
              >
                Rollback
              </span>
            </td>
          </tr>
        </tbody>
        <tbody v-else>
          <tr v-for="i in 5" :key="i" class="bg-white border-b dark:border-gray-700 dark:bg-gray-800 animate-pulse">
            <td v-for="col in columns" :key="col.key" class="px-6 py-4" :class="{ 'hidden md:table-cell': !col.mobile }">
              <div class="h-2.5 bg-gray-300 rounded-full dark:bg-gray-600 w-full" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="!loading && deployHistory.length === 0" class="flex flex-col items-center justify-center p-8">
      <p class="text-gray-500 dark:text-gray-400">
        {{ t('no-deploy-history') }}
      </p>
    </div>

    <!-- Pagination -->
    <nav class="flex items-center justify-between p-4" aria-label="Table navigation">
      <span class="text-sm font-normal text-gray-500 dark:text-gray-400">
        Showing {{ (page - 1) * pageSize + 1 }}-{{ Math.min(page * pageSize, total) }} of {{ total }}
      </span>
      <ul class="inline-flex items-center -space-x-px">
        <li>
          <button
            class="px-3 py-2 ml-0 leading-tight text-gray-500 bg-white border border-gray-300 rounded-l-lg dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-white"
            :disabled="page === 1"
            @click="page = 1"
          >
            «
          </button>
        </li>
        <li>
          <button
            class="px-3 py-2 leading-tight text-gray-500 bg-white border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-white"
            :disabled="page === 1"
            @click="page = Math.max(1, page - 1)"
          >
            ‹
          </button>
        </li>
        <li>
          <button
            class="px-3 py-2 leading-tight text-blue-600 border border-blue-300 bg-blue-50 dark:border-gray-700 dark:bg-gray-700 dark:text-white"
          >
            {{ page }}
          </button>
        </li>
        <li>
          <button
            class="px-3 py-2 leading-tight text-gray-500 bg-white border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-white"
            :disabled="page >= Math.ceil(total / pageSize)"
            @click="page = Math.min(Math.ceil(total / pageSize), page + 1)"
          >
            ›
          </button>
        </li>
        <li>
          <button
            class="px-3 py-2 leading-tight text-gray-500 bg-white border border-gray-300 rounded-r-lg dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-white"
            :disabled="page >= Math.ceil(total / pageSize)"
            @click="page = Math.ceil(total / pageSize)"
          >
            »
          </button>
        </li>
      </ul>
    </nav>
  </div>
</template>
