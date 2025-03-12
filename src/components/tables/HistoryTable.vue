<script setup lang="ts">
import { formatDate } from '@/modules/date'
import { useOrganizationStore } from '@/stores/organization'
import { useSupabaseClient } from '@supabase/auth-helpers-vue'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

const props = defineProps<{
  appId: string
  channelId: number
}>()

const { t } = useI18n()
const supabase = useSupabaseClient()
const toast = useToast()
const orgStore = useOrganizationStore()

// Pagination and sorting state
const page = ref(1)
const pageSize = ref(10)
const totalItems = ref(0)
const sort = ref({ deployed_at: 'desc' })
const loading = ref(false)
const deployHistory = ref<any[]>([])
const currentVersion = ref<any>(null)

// Memoized current version check for better performance
const _isCurrentVersion = computed(() => {
  const currentVersionId = currentVersion.value?.id
  return (versionId: number) => currentVersionId === versionId
})

// Fetch both deploy history and current version in parallel for better performance
async function fetchData() {
  loading.value = true
  try {
    // Use Promise.all to fetch both in parallel
    const [historyResponse, currentVersionResponse] = await Promise.all([
      fetchDeployHistory(),
      fetchCurrentVersion(),
    ])

    // Process history response
    const { data, error, count } = historyResponse
    if (error)
      throw error
    deployHistory.value = data || []
    totalItems.value = count || 0

    // Process current version response
    const { data: versionData, error: versionError } = currentVersionResponse
    if (versionError)
      throw versionError
    currentVersion.value = versionData?.version
  }
  catch (error) {
    console.error('Error fetching deploy history:', error)
    toast.error(t('error_fetching_data'))
  }
  finally {
    loading.value = false
  }
}

// Optimized query that only selects needed fields
async function fetchDeployHistory() {
  // Use the database function for better performance if available
  try {
    const { data, error, count: _count } = await supabase.rpc('get_deploy_history', {
      p_channel_id: props.channelId,
      p_app_id: props.appId,
      p_page: page.value,
      p_page_size: pageSize.value,
      p_sort_field: Object.keys(sort.value)[0],
      p_sort_direction: Object.values(sort.value)[0],
    })

    if (data) {
      return { data, error, count: data[0]?.total_count || 0 }
    }
  }
  catch (e) {
    // Fall back to regular query if RPC fails
    console.warn('Falling back to regular query:', e)
  }

  // Regular query as fallback
  return await supabase
    .from('deploy_history')
    .select(`
      id, 
      deployed_at,
      link,
      comment,
      is_current,
      version_id,
      version:version_id (
        id,
        name
      )
    `, { count: 'exact' })
    .eq('channel_id', props.channelId)
    .eq('app_id', props.appId)
    .order(Object.keys(sort.value)[0], { ascending: Object.values(sort.value)[0] === 'asc' })
    .range((page.value - 1) * pageSize.value, page.value * pageSize.value - 1)
}

async function fetchCurrentVersion() {
  return await supabase
    .from('channels')
    .select(`
      version,
      version:version (
        id,
        name
      )
    `)
    .eq('id', props.channelId)
    .single()
}

// Optimized rollback function with proper error handling
async function rollbackToVersion(item: any) {
  if (!orgStore.hasPermisisonsInRole(['write', 'admin', 'super_admin'])) {
    toast.error(t('no_permission'))
    return
  }

  try {
    loading.value = true
    const { error } = await supabase
      .from('channels')
      .update({
        version: item.version_id,
      })
      .eq('id', props.channelId)

    if (error)
      throw error

    toast.success(t('rollback_success'))
    await fetchData()
  }
  catch (error) {
    console.error('Error rolling back version:', error)
    toast.error(t('rollback_error'))
  }
  finally {
    loading.value = false
  }
}

// Watch for changes in pagination or sorting
watch([page, pageSize, sort], () => {
  fetchData()
}, { immediate: true })

// Expose methods for parent components
defineExpose({
  refresh: fetchData,
})
</script>

<template>
  <div>
    <div class="overflow-x-auto">
      <table class="table w-full">
        <thead>
          <tr>
            <th>{{ t('version') }}</th>
            <th>{{ t('deployed_at') }}</th>
            <th>{{ t('link') }}</th>
            <th>{{ t('comment') }}</th>
            <th>{{ t('actions') }}</th>
          </tr>
        </thead>
        <tbody v-if="loading">
          <tr v-for="i in 3" :key="`skeleton-${i}`">
            <td v-for="j in 5" :key="`skeleton-${i}-${j}`">
              <div class="skeleton h-4 w-full" />
            </td>
          </tr>
        </tbody>
        <tbody v-else-if="deployHistory.length === 0">
          <tr>
            <td colspan="5" class="text-center py-4">
              {{ t('no_deploy_history') }}
            </td>
          </tr>
        </tbody>
        <tbody v-else>
          <tr v-for="item in deployHistory" :key="item.id">
            <td>{{ item.version?.name }}</td>
            <td>{{ formatDate(item.deployed_at) }}</td>
            <td>
              <a v-if="item.link" :href="item.link" target="_blank" class="link link-primary">
                {{ t('view_release') }}
              </a>
            </td>
            <td>{{ item.comment }}</td>
            <td>
              <button
                v-if="!item.is_current"
                class="btn btn-sm btn-primary"
                :disabled="!orgStore.hasPermisisonsInRole(['write', 'admin', 'super_admin'])"
                @click="rollbackToVersion(item)"
              >
                {{ t('rollback') }}
              </button>
              <span v-else class="badge badge-success">{{ t('current') }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div class="flex justify-between items-center mt-4">
      <div>
        <span>{{ t('showing') }} {{ deployHistory.length }} {{ t('of') }} {{ totalItems }}</span>
      </div>
      <div class="join">
        <button
          class="join-item btn btn-sm"
          :disabled="page === 1"
          @click="page--"
        >
          «
        </button>
        <button class="join-item btn btn-sm">
          {{ page }}
        </button>
        <button
          class="join-item btn btn-sm"
          :disabled="page * pageSize >= totalItems"
          @click="page++"
        >
          »
        </button>
      </div>
    </div>
  </div>
</template>
