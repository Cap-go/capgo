<script setup lang="ts">
import type { DeployHistory } from '~/types/deploy_history'
import { useI18n } from 'petite-vue-i18n'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { formatDate } from '~/services/date'
import { useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'
import { useOrganizationStore } from '~/stores/organization'

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
const totalRecords = ref(0)
const page = ref(1)
const pageSize = ref(10)
const searchQuery = ref('')
const sort = ref({ deployed_at: 'desc' })
const role = ref<string | null>(null)

// Watch for changes in props to reload data
watch([() => props.channelId, () => props.appId], () => {
  if (props.channelId && props.appId) {
    loadDeployHistory()
  }
}, { immediate: true })

// Watch for changes in pagination, search, or sort to reload data
watch([page, pageSize, searchQuery, sort], () => {
  if (props.channelId && props.appId) {
    loadDeployHistory()
  }
})

// Load deploy history with server-side filtering and pagination
async function loadDeployHistory() {
  if (!props.channelId || !props.appId)
    return

  loading.value = true

  try {
    // Get user role for the app
    await organizationStore.awaitInitialLoad()
    role.value = await organizationStore.getCurrentRoleForApp(props.appId)

    // Build query with search filter if provided
    let query = supabase
      .from('deploy_history')
      .select(`
        *,
        version:version_id (
          id,
          name,
          app_id,
          created_at
        )
      `, { count: 'exact' })
      .eq('channel_id', props.channelId)
      .eq('app_id', props.appId)
      .order(Object.keys(sort.value)[0], { ascending: Object.values(sort.value)[0] === 'asc' })
      .range((page.value - 1) * pageSize.value, page.value * pageSize.value - 1)

    // Add search filter if provided
    if (searchQuery.value) {
      query = query.or(`version.name.ilike.%${searchQuery.value}%,comment.ilike.%${searchQuery.value}%,link.ilike.%${searchQuery.value}%`)
    }

    const { data, error, count } = await query

    if (error) {
      console.error('Error fetching deploy history:', error)
      toast.error(t('error-fetching-deploy-history'))
      return
    }

    deployHistory.value = data as DeployHistory[]
    totalRecords.value = count || 0
  }
  catch (error) {
    console.error('Error in loadDeployHistory:', error)
    toast.error(t('error-fetching-deploy-history'))
  }
  finally {
    loading.value = false
  }
}

// Handle page change
function handlePageChange(newPage: number) {
  page.value = newPage
}

// Handle sort change
function handleSort(column: string) {
  const currentDirection = sort.value[column]
  sort.value = { [column]: currentDirection === 'asc' ? 'desc' : 'asc' }
}

// Add link and comment to bundle
async function addLinkComment(versionId: number) {
  if (!organizationStore.hasPermisisonsInRole(role.value, ['admin', 'super_admin', 'write'])) {
    toast.error(t('no-permission'))
    return
  }

  const history = deployHistory.value.find(h => h.version_id === versionId)

  displayStore.dialogOption = {
    header: t('add-bundle-link-comment'),
    inputs: [
      {
        label: t('bundle-link'),
        type: 'text',
        value: history?.link || '',
        id: 'link',
        placeholder: 'https://example.com',
      },
      {
        label: t('bundle-comment'),
        type: 'textarea',
        value: history?.comment || '',
        id: 'comment',
        placeholder: t('bundle-comment'),
      },
    ],
    buttons: [
      {
        text: t('save'),
        handler: async (inputs) => {
          try {
            const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update_metadata`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabase.auth.session()?.access_token}`,
              },
              body: JSON.stringify({
                bundleId: versionId,
                link: inputs.link,
                comment: inputs.comment,
              }),
            })

            if (!response.ok) {
              const errorData = await response.json()
              throw new Error(errorData.error || 'Failed to update metadata')
            }

            toast.success(t('bundle-link-comment-added'))
            loadDeployHistory()
          }
          catch (error) {
            console.error('Error updating metadata:', error)
            toast.error(error.message || 'Failed to update metadata')
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

// Rollback to a previous version
async function rollbackToVersion(versionId: number) {
  if (!organizationStore.hasPermisisonsInRole(role.value, ['admin', 'super_admin', 'write'])) {
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
              .update({ version: versionId })
              .eq('id', props.channelId)

            if (error) {
              console.error('Error rolling back:', error)
              toast.error(t('error-rollback'))
              return
            }

            toast.success(t('rollback-success'))
            loadDeployHistory()
          }
          catch (error) {
            console.error('Error in rollback:', error)
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

const totalPages = computed(() => Math.ceil(totalRecords.value / pageSize.value))
</script>

<template>
  <div class="w-full">
    <!-- Search and filters -->
    <div class="flex flex-col md:flex-row justify-between mb-4 gap-2">
      <div class="relative w-full md:w-64">
        <input
          v-model="searchQuery"
          type="text"
          :placeholder="t('search')"
          class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
        >
      </div>
    </div>

    <!-- History table -->
    <div class="overflow-x-auto">
      <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead class="bg-gray-50 dark:bg-slate-700">
          <tr>
            <th
              scope="col"
              class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer"
              @click="handleSort('version.name')"
            >
              {{ t('bundle-number') }}
              <span v-if="Object.keys(sort.value)[0] === 'version.name'">
                {{ sort.value['version.name'] === 'asc' ? '↑' : '↓' }}
              </span>
            </th>
            <th
              scope="col"
              class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer"
              @click="handleSort('deployed_at')"
            >
              {{ t('deploy-date') }}
              <span v-if="Object.keys(sort.value)[0] === 'deployed_at'">
                {{ sort.value.deployed_at === 'asc' ? '↑' : '↓' }}
              </span>
            </th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
              {{ t('bundle-link') }}
            </th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
              {{ t('bundle-comment') }}
            </th>
            <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
              {{ t('actions') }}
            </th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200 dark:bg-slate-800 dark:divide-gray-700">
          <tr v-if="loading" class="animate-pulse">
            <td colspan="5" class="px-6 py-4">
              <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2.5" />
            </td>
          </tr>
          <tr v-else-if="deployHistory.length === 0" class="text-center">
            <td colspan="5" class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
              {{ t('no-deploy-history') }}
            </td>
          </tr>
          <tr v-for="history in deployHistory" :key="history.id" class="hover:bg-gray-50 dark:hover:bg-slate-700">
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
              {{ history.version?.name }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
              {{ formatDate(history.deployed_at) }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
              <a
                v-if="history.link"
                :href="history.link"
                target="_blank"
                rel="noopener noreferrer"
                class="text-blue-500 hover:underline"
              >
                {{ history.link }}
              </a>
              <span v-else>-</span>
            </td>
            <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-300">
              {{ history.comment || '-' }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
              <div class="flex justify-end space-x-2">
                <button
                  v-if="organizationStore.hasPermisisonsInRole(role, ['admin', 'super_admin', 'write'])"
                  class="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                  @click="addLinkComment(history.version_id)"
                >
                  {{ t('edit') }}
                </button>
                <button
                  v-if="!history.is_current && organizationStore.hasPermisisonsInRole(role, ['admin', 'super_admin', 'write'])"
                  class="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300"
                  @click="rollbackToVersion(history.version_id)"
                >
                  {{ t('rollback-to-this-version') }}
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex justify-between items-center mt-4">
      <div class="text-sm text-gray-700 dark:text-gray-300">
        {{ t('showing') }} {{ (page - 1) * pageSize + 1 }} {{ t('to') }} {{ Math.min(page * pageSize, totalRecords) }} {{ t('of') }} {{ totalRecords }} {{ t('results') }}
      </div>
      <div class="flex space-x-1">
        <button
          v-for="p in totalPages"
          :key="p"
          class="px-3 py-1 rounded"
          :class="p === page ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-slate-600'"
          @click="handlePageChange(p)"
        >
          {{ p }}
        </button>
      </div>
    </div>
  </div>
</template>
