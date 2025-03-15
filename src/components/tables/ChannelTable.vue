<script setup lang="ts">
import type { Ref } from 'vue'
import type { TableColumn } from '../comp_def'
import type { Database } from '~/types/supabase.types'
import { useI18n } from 'petite-vue-i18n'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import IconPlus from '~icons/heroicons/plus?width=2em&height=2em'
import IconTrash from '~icons/heroicons/trash?raw'
import { appIdToUrl } from '~/services/conversion'
import { formatDate } from '~/services/date'
import { useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'

const props = defineProps<{
  appId: string
}>()

const emit = defineEmits<{
  (event: 'misconfigured', misconfigured: boolean): void
}>()

interface Channel {
  version: {
    name: string
    created_at: string
    min_update_version: string | null
  }
  misconfigured: boolean | undefined
}
type Element = Database['public']['Tables']['channels']['Row'] & Channel
const columns: Ref<TableColumn[]> = ref<TableColumn[]>([])
const offset = 10
const { t } = useI18n()
const displayStore = useDisplayStore()
const organizationStore = useOrganizationStore()
const supabase = useSupabase()
const router = useRouter()
const main = useMainStore()
const total = ref(0)
const search = ref('')
const elements = ref<(Element)[]>([])
const isLoading = ref(false)
const currentPage = ref(1)
const versionId = ref<number>()
const filters = ref()
const currentVersionsNumber = computed(() => {
  return (currentPage.value - 1) * offset
})
const { currentOrganization } = storeToRefs(organizationStore)

async function didCancel(name: string) {
  displayStore.dialogOption = {
    header: t('alert-confirm-delete'),
    message: `${t('alert-not-reverse-message')} ${t('alert-delete-message')} ${name}?`,
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('button-delete'),
        role: 'danger',
        id: 'confirm-button',
      },
    ],
  }
  displayStore.showDialog = true
  return displayStore.onDialogDismiss()
}

function findUnknownVersion() {
  return supabase
    .from('app_versions')
    .select('id')
    .eq('app_id', props.appId)
    .eq('name', 'unknown')
    .throwOnError()
    .single()
    .then(({ data }) => data?.id)
}

async function addChannel(name: string) {
  if (!name || !versionId.value || !main.user)
    return
  try {
    console.log('addChannel', name, versionId.value, main.user)
    const currentGid = organizationStore.currentOrganization?.gid
    if (!currentGid)
      return
    // { name: channelId, app_id: appId, version: data.id, created_by: userId }
    const { data: dataChannel } = await supabase
      .from('channels')
      .insert([
        {
          name,
          app_id: props.appId,
          version: versionId.value as number,
          owner_org: currentGid as string,
        },
      ])
      .select()
    if (!dataChannel)
      return
    elements.value.push(dataChannel[0] as any)
  }
  catch (error) {
    console.error(error)
  }
}

async function getData() {
  isLoading.value = true
  try {
    let req = supabase
      .from('channels')
      .select(`
          id,
          name,
          app_id,
          public,
          version (
            name,
            created_at,
            min_update_version
          ),
          created_at,
          updated_at,
          disable_auto_update
          `, { count: 'exact' })
      .eq('app_id', props.appId)
      .range(currentVersionsNumber.value, currentVersionsNumber.value + offset - 1)

    if (search.value)
      req = req.like('name', `%${search.value}%`)

    if (columns.value.length) {
      columns.value.forEach((col) => {
        if (col.sortable && typeof col.sortable === 'string')
          req = req.order(col.key as any, { ascending: col.sortable === 'asc' })
      })
    }
    const { data: dataVersions, count } = await req
    if (!dataVersions)
      return
    elements.value.length = 0
    elements.value.push(...dataVersions as any)
    // console.log('count', count)
    total.value = count || 0

    // Look for misconfigured channels
    // This will trigger if the channel disables updates based on metadata + if the metadata is undefined
    let anyMisconfigured = false
    const channels = dataVersions
      .filter(e => e.disable_auto_update === 'version_number')
      .map(e => e as any as Element)

    for (const channel of channels) {
      if (channel.version.min_update_version === null) {
        channel.misconfigured = true
        anyMisconfigured = true
      }
    }

    // Inform the parent component if there are any misconfigured channels
    emit('misconfigured', anyMisconfigured)
  }
  catch (error) {
    console.error(error)
  }
  isLoading.value = false
}
async function refreshData() {
  // console.log('refreshData')
  try {
    currentPage.value = 1
    elements.value.length = 0
    await getData()
    versionId.value = await findUnknownVersion()
  }
  catch (error) {
    console.error(error)
  }
}
async function deleteOne(one: Element) {
  // console.log('deleteBundle', bundle)
  if (!organizationStore.hasPermisisonsInRole(await organizationStore.getCurrentRoleForApp(one.app_id), ['admin', 'super_admin'])) {
    toast.error(t('no-permission'))
    return
  }

  if (await didCancel(t('channel')))
    return
  try {
    const { error: delChanError } = await supabase
      .from('channels')
      .delete()
      .eq('app_id', props.appId)
      .eq('id', one.id)
    if (delChanError) {
      toast.error(t('cannot-delete-channel'))
    }
    else {
      await refreshData()
      toast.success(t('channel-deleted'))
    }
  }
  catch (error) {
    console.error(error)
    toast.error(t('cannot-delete-channel'))
  }
}

columns.value = [
  {
    label: t('name'),
    key: 'name',
    mobile: true,
    sortable: true,
    head: true,
  },
  {
    label: t('last-upload'),
    key: 'updated_at',
    mobile: false,
    sortable: 'desc',
    displayFunction: (elem: Element) => formatDate(elem.updated_at || ''),
  },
  {
    label: t('last-version'),
    key: 'version',
    mobile: true,
    sortable: true,
    displayFunction: (elem: Element) => elem.version.name,
  },
  {
    label: t('misconfigured'),
    mobile: false,
    key: 'misconfigured',
    displayFunction: (elem: Element) => elem.misconfigured ? t('yes') : t('no'),
  },
  {
    label: t('action'),
    key: 'action',
    mobile: true,
    icon: IconTrash,
    class: 'text-red-500',
    onClick: deleteOne,
  },
]

async function reload() {
  console.log('reload')
  try {
    elements.value.length = 0
    await getData()
  }
  catch (error) {
    console.error(error)
  }
}
async function showAddModal() {
  if (!currentOrganization.value || (!organizationStore.hasPermisisonsInRole(organizationStore.currentRole, ['admin', 'super_admin']))) {
    toast.error(t('no-permission'))
    return
  }

  displayStore.dialogOption = {
    header: t('channel-create'),
    input: true,
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('button-confirm'),
        id: 'confirm-button',
        handler: async () => {
          const newName = displayStore.dialogInputText
          console.log('newName', newName)
          if (!newName)
            toast.error(t('missing-name'))
          await addChannel(newName)
        },
      },
    ],
  }
  displayStore.showDialog = true
  await displayStore.onDialogDismiss()
}

async function openOne(one: Element) {
  router.push(`/app/p/${appIdToUrl(props.appId)}/channel/${one.id}`)
}
onMounted(async () => {
  await refreshData()
})
watch(props, async () => {
  await refreshData()
})
</script>

<template>
  <div>
    <Table
      v-model:filters="filters" v-model:columns="columns" v-model:current-page="currentPage" v-model:search="search"
      :total="total" row-click :element-list="elements"
      filter-text="Filters"
      :is-loading="isLoading"
      :search-placeholder="t('search-by-name')"
      @reload="reload()" @reset="refreshData()"
      @row-click="openOne"
    />
    <button id="create_channel" class="fixed z-40 bg-gray-800 btn btn-circle btn-xl btn-outline right-4-safe bottom-20-safe md:right-4-safe md:bottom-4-safe secondary" @click="showAddModal">
      <IconPlus />
    </button>
  </div>
</template>
