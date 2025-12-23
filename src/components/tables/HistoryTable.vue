<script setup lang="ts">
import type { TableColumn, TableSort } from '~/components/comp_def'

import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { formatDate } from '~/services/date'
import { useSupabase } from '~/services/supabase'
import { useDialogV2Store } from '~/stores/dialogv2'
import { useOrganizationStore } from '~/stores/organization'

// Define custom type for deploy_history since it doesn't exist in Database types
interface DeployHistory {
  id: number
  version_id: number
  app_id: string
  channel_id: number
  deployed_at: string
  version: {
    id: number
    name: string
    app_id: string
    created_at: string
    deleted?: boolean
  }
  channel?: {
    id: number
    name: string
  }
  created_by: string
  user: {
    uid: string
    email: string
  } | null
}

const props = defineProps<{
  channelId?: number
  bundleId?: number
  appId: string
}>()

const members = ref([] as ExtendedOrganizationMembers)
const { t } = useI18n()
const router = useRouter()
const supabase = useSupabase()
const organizationStore = useOrganizationStore()
const dialogStore = useDialogV2Store()

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

// Fetch current channel's version_id (only relevant for channel mode)
async function fetchCurrentVersion() {
  // Skip if in bundle mode
  if (props.bundleId)
    return

  if (!props.channelId)
    return

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

// Check if we're in bundle mode (showing deployment history for a specific bundle)
const isBundleMode = computed(() => !!props.bundleId)

function openOneChannel(item: DeployHistory) {
  if (item.channel?.id) {
    router.push(`/app/${props.appId}/channel/${item.channel.id}`)
  }
}

const columns = computed<TableColumn[]>(() => {
  // Bundle mode: show channel name instead of bundle name, and no rollback
  if (isBundleMode.value) {
    return [
      {
        label: t('channel'),
        key: 'channel.name',
        mobile: true,
        sortable: false,
        displayFunction: item => item.channel?.name || '-',
        onClick: (item: DeployHistory) => openOneChannel(item),
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
    ]
  }

  // Channel mode: show bundle name and rollback action
  return [
    {
      label: t('bundle-number'),
      key: 'version.name',
      mobile: true,
      sortable: true,
      displayFunction: item => item.version.name,
      onClick: (item: DeployHistory) => openOneVersion(item),
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
      label: t('action'),
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
        else {
          toast.error(t('cannot-rollback-to-current-version'))
        }
      },
    },
  ]
})

async function openOneVersion(item: DeployHistory) {
  router.push(`/app/${props.appId}/bundle/${item.version_id}`)
}

async function fetchDeployHistory() {
  loading.value = true
  try {
    deployHistory.value.length = 0
    await fetchCurrentVersion()
    members.value = await organizationStore.getMembers()

    // Build select query based on mode
    const selectFields = isBundleMode.value
      ? `
        *,
        version:version_id (
          id,
          name,
          app_id,
          created_at,
          deleted
        ),
        channel:channel_id (
          id,
          name
        )
      `
      : `
        *,
        version:version_id (
          id,
          name,
          app_id,
          created_at,
          deleted
        )
      `

    // Using "deploy_history" as a string rather than a type reference
    let query = supabase
      .from('deploy_history')
      .select(selectFields, { count: 'exact' })
      .eq('app_id', props.appId)
      .order(Object.keys(sort.value)[0], { ascending: Object.values(sort.value)[0] === 'asc' })

    // Apply filter based on mode
    if (isBundleMode.value) {
      query = query.eq('version_id', props.bundleId!)
    }
    else if (props.channelId) {
      query = query.eq('channel_id', props.channelId)
    }

    // Apply search filter based on mode
    if (search.value) {
      if (isBundleMode.value) {
        // In bundle mode, search by channel name
        query = query.like('channel.name', `%${search.value}%`)
      }
      else {
        // In channel mode, search by version name
        query = query.like('version.name', `%${search.value}%`)
      }
    }

    const { data, error, count } = await query
      .range((page.value - 1) * pageSize.value, page.value * pageSize.value - 1)

    if (error) {
      console.error('Error fetching deploy history:', error)
      toast.error(t('error-fetching-deploy-history'))
      return
    }

    // Filter out data based on mode
    const filteredData = data.filter((item) => {
      if (isBundleMode.value) {
        return item?.channel !== null
      }
      return item?.version !== null
    }) as unknown as DeployHistory[]

    deployHistory.value = filteredData
    for (const item of deployHistory.value) {
      const member = members.value.find(m => m.uid === item.created_by)
      if (member) {
        item.user = member
      }
    }
    console.log('Deploy History:', deployHistory.value)

    total.value = count ?? 0
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
  if (!organizationStore.hasPermissionsInRole(role, ['admin', 'super_admin', 'write'])) {
    toast.error(t('no-permission'))
    return
  }

  if (item.version?.deleted) {
    toast.error(t('version-deleted-cannot-rollback'))
    return
  }

  dialogStore.openDialog({
    title: t('rollback-to-version'),
    description: t('confirm-rollback-desc'),
    buttons: [
      {
        text: t('confirm'),
        role: 'primary',
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
  })
  await dialogStore.onDialogDismiss()
}

watch([() => props.channelId, () => props.bundleId, () => props.appId], () => {
  fetchDeployHistory()
})
</script>

<template>
  <Table
    :is-loading="loading"
    :search="search"
    :search-placeholder="t('search-by-name')"
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
