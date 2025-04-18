<script setup lang="ts">
import type { TableColumn, TableSort } from '~/components/comp_def'

import { useI18n } from 'petite-vue-i18n'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { appIdToUrl } from '~/services/conversion'
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
    deleted?: boolean
  }
  user?: {
    id: string
    first_name: string
    last_name: string
  }
}

const props = defineProps<{
  channelId: number
  appId: string
}>()

const { t } = useI18n()
const router = useRouter()
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
    onClick: (item: DeployHistory) => openOneVersion(item),
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
    mobile: true,
    class: 'text-center',
    displayFunction: (item) => {
      if (item.version?.deleted) {
        return t('bundle-deleted')
      }
      return isCurrentVersion(item) ? t('current') : t('rollback')
    },
    onClick: (item) => {
      if (!isCurrentVersion(item) && !item.version?.deleted) {
        handleRollback(item)
      }
    },
  },
])

async function openOneVersion(item: DeployHistory) {
  router.push(`/app/p/${appIdToUrl(props.appId)}/bundle/${item.version_id}`)
}

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
          comment,
          deleted
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

  if (item.version?.deleted) {
    toast.error(t('version-deleted-cannot-rollback'))
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
  <Table
    :is-loading="loading"
    :search="search"
    :total="total"
    :current-page="page"
    :columns="columns"
    :element-list="deployHistory"
    @update:search="search = $event"
    @update:current-page="page = $event"
    @update:columns="columns = $event"
    @reload="fetchDeployHistory"
  />
</template>
