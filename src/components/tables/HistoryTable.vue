<script setup lang="ts">
import type { TableColumn, TableSort } from '~/components/comp_def'
import type { Database } from '~/types/supabase.types'
import { useI18n } from 'petite-vue-i18n'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import IconRollback from '~icons/heroicons/backward'
import IconComment from '~icons/heroicons/chat-bubble-left-text'
import IconLink from '~icons/heroicons/link'
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

const deployHistory = ref<(Database['public']['Tables']['deploy_history']['Row'] & {
  version: Database['public']['Tables']['app_versions']['Row']
})[]>([])
const loading = ref(true)
const sort = ref<TableSort>({
  deployed_at: 'desc',
})
const search = ref('')
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)

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
    label: t('bundle-link'),
    key: 'link',
    mobile: false,
    icon: IconLink,
    onClick: (item) => {
      if (item.link) {
        window.open(item.link, '_blank')
      }
    },
    displayFunction: item => item.link || '-',
  },
  {
    label: t('bundle-comment'),
    key: 'comment',
    mobile: false,
    icon: IconComment,
    displayFunction: item => item.comment || '-',
  },
  {
    label: t('rollback-to-version'),
    key: 'rollback',
    mobile: false,
    icon: IconRollback,
    onClick: item => handleRollback(item),
    displayFunction: () => '',
  },
])

async function fetchDeployHistory() {
  loading.value = true
  try {
    const { data, error, count } = await supabase
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

    if (error) {
      console.error('Error fetching deploy history:', error)
      toast.error(t('error-fetching-deploy-history'))
      return
    }

    deployHistory.value = data as any
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

async function handleRollback(item: any) {
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

watch([() => props.channelId, () => props.appId, sort, page, pageSize], fetchDeployHistory, { immediate: true })
</script>

<template>
  <div>
    <Table
      :columns="columns"
      :data="deployHistory"
      :loading="loading"
      :sort="sort"
      :search="search"
      :page="page"
      :page-size="pageSize"
      :total="total"
      @update:sort="sort = $event"
      @update:search="search = $event"
      @update:page="page = $event"
      @update:page-size="pageSize = $event"
    />
    <div v-if="!loading && deployHistory.length === 0" class="flex flex-col items-center justify-center p-8">
      <p class="text-gray-500 dark:text-gray-400">
        {{ t('no-deploy-history') }}
      </p>
    </div>
  </div>
</template>
