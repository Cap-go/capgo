<script setup lang="ts">
import type { Ref } from 'vue'
import type { TableColumn } from '../comp_def'
import type { OrganizationRole } from '~/stores/organization'
import type { Database } from '~/types/supabase.types'
import { Capacitor } from '@capacitor/core'
import { useI18n } from 'petite-vue-i18n'
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import IconTrash from '~icons/heroicons/trash?raw'
import { appIdToUrl, bytesToMbText } from '~/services/conversion'
import { formatDate } from '~/services/date'
import { useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'

const props = defineProps<{
  appId: string
}>()

type Element = Database['public']['Tables']['app_versions']['Row'] & Database['public']['Tables']['app_versions_meta']['Row']

const role = ref<OrganizationRole | null>(null)
const isMobile = Capacitor.isNativePlatform()
const offset = 10
const { t } = useI18n()
const showSteps = ref(false)
const displayStore = useDisplayStore()
const supabase = useSupabase()
const router = useRouter()
const organizationStore = useOrganizationStore()
const total = ref(0)
const search = ref('')
const columns: Ref<TableColumn[]> = ref<TableColumn[]>([])
const elements = ref<Element[]>([])
const selectedElements = ref<Element[]>([])
const isLoading = ref(false)
const currentPage = ref(1)
const filters = ref({
  'external-storage': false,
  'deleted': false,
  'encrypted': false,
})
const channelCache = ref<Record<number, { name: string, id?: number }>>({})

function onboardingDone() {
  reload()
  showSteps.value = !showSteps.value
}
const currentVersionsNumber = computed(() => {
  return (currentPage.value - 1) * offset
})
async function didCancel(name: string, isPlural = false, askForMethod = true): Promise<boolean | 'normal' | 'unsafe'> {
  let method: 'normal' | 'unsafe' | null = null
  if (askForMethod) {
    displayStore.dialogOption = {
      header: t('select-style-of-deletion'),
      message: t('select-style-of-deletion-msg').replace('$1', `<a href="https://capgo.app/docs/webapp/bundles/#delete-a-bundle">${t('here')}</a>`),
      buttons: [
        {
          text: t('normal'),
          role: 'normal',
          handler: () => {
            method = 'normal'
          },
        },
        {
          text: t('unsafe'),
          role: 'danger',
          id: 'unsafe',
          handler: async () => {
            if (!organizationStore.hasPermisisonsInRole(await organizationStore.getCurrentRoleForApp(props.appId), ['super_admin'])) {
              toast.error(t('no-permission-ask-super-admin'))
              return
            }
            method = 'unsafe'
          },
        },
      ],
    }
    displayStore.showDialog = true
    if (await displayStore.onDialogDismiss() || !method) {
      return true
    }
  }
  else {
    method = 'unsafe'
  }
  displayStore.dialogOption = {
    header: t('alert-confirm-delete'),
    message: isPlural
      ? `${t('alert-not-reverse-message')} ${t('alert-delete-message-plural')} ${t('bundles').toLowerCase()}?`
      : askForMethod
        ? `${t('alert-not-reverse-message')} ${t('alert-delete-message')} ${name} ${t('you-cannot-reuse')}.`
        : !isPlural
            ? `${t('alert-not-reverse-message')} ${t('alert-delete-message')} ${name}?\n${t('you-are-deleting-unsafely').replace('$1', '<b><u>').replace('$2', '</u></b>').replace('$3', '<a href="https://capgo.app/docs/webapp/bundles/#delete-a-bundle">').replace('$4', '</a>')}.`
            : `${t('alert-not-reverse-message')} ${t('alert-delete-message')} ${name}?\n${t('you-are-deleting-unsafely-plural').replace('$1', '<b><u>').replace('$2', '</u></b>').replace('$3', '<a href="https://capgo.app/docs/webapp/bundles/#delete-a-bundle">').replace('$4', '</a>')}.`,

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
  if (await displayStore.onDialogDismiss())
    return true
  if (method === null)
    throw new Error('Unreachable, method = null')
  return method
}
async function enhenceVersionElems(dataVersions: Database['public']['Tables']['app_versions']['Row'][]) {
  const { data: dataVersionsMeta } = await supabase
    .from('app_versions_meta')
    .select()
    .in('id', dataVersions.map(({ id }) => id))
  const newVersions = dataVersions.map(({ id, ...rest }) => {
    const version = dataVersionsMeta ? dataVersionsMeta.find(({ id: idMeta }) => idMeta === id) : { size: 0, checksum: '' }
    return { id, ...rest, ...version } as Element
  })
  return newVersions
}
async function getData() {
  isLoading.value = true
  try {
    let channelsToSearch = null

    // If search term might be a channel name, find versions linked to channels with that name
    if (search.value) {
      const { data: channels } = await supabase
        .from('channels')
        .select('id, version')
        .eq('app_id', props.appId)
        .ilike('name', `%${search.value}%`)

      if (channels && channels.length > 0) {
        channelsToSearch = channels.map(c => c.version)
      }
    }

    let req = supabase
      .from('app_versions')
      .select('*', { count: 'exact' })
      .eq('app_id', props.appId)
      .neq('storage_provider', 'revert_to_builtin')
      .range(currentVersionsNumber.value, currentVersionsNumber.value + offset - 1)

    if (search.value) {
      if (channelsToSearch && channelsToSearch.length > 0) {
        // Search by both version name or linked channel
        req = req.or(`name.ilike.%${search.value}%,id.in.(${channelsToSearch.join(',')})`)
      }
      else {
        // Search by version name only
        req = req.like('name', `%${search.value}%`)
      }
    }

    req = req.eq('deleted', filters.value.deleted)
    if (filters.value['external-storage'])
      req = req.neq('external_url', null)
    if (filters.value.encrypted)
      req = req.neq('session_key', null)
    if (columns.value.length) {
      columns.value.forEach((col) => {
        if (col.sortable && typeof col.sortable === 'string')
          req = req.order(col.key as any, { ascending: col.sortable === 'asc' })
      })
    }
    const { data: dataVersions, count } = await req
    if (!dataVersions)
      return
    const enhancedVersions = await enhenceVersionElems(dataVersions)
    await fetchChannelsForVersions(enhancedVersions)
    elements.value = enhancedVersions as any
    total.value = count || 0
  }
  catch (error) {
    console.error(error)
  }
  isLoading.value = false
}
async function fetchChannelsForVersions(versions: Element[]) {
  const versionIds = versions.map(v => v.id)
  const { data: channelData, error } = await supabase
    .from('channels')
    .select('name, version, id')
    .eq('app_id', props.appId)
    .in('version', versionIds)
  if (error) {
    console.error('Error fetching channels:', error)
    return
  }
  versionIds.forEach((id) => {
    const channel = channelData?.find(c => c.version === id)
    channelCache.value[id] = channel ? { name: channel.name, id: channel.id } : { name: '' }
  })
}
async function refreshData() {
  try {
    currentPage.value = 1
    elements.value.length = 0
    selectedElements.value.length = 0
    channelCache.value = {} // Clear cache on refresh
    await getData()
  }
  catch (error) {
    console.error(error)
  }
}
async function deleteOne(one: Element) {
  // console.log('deleteBundle', bundle)

  if (role.value && !organizationStore.hasPermisisonsInRole(role.value, ['admin', 'write', 'super_admin'])) {
    toast.error(t('no-permission'))
    return
  }

  try {
    // todo: fix this for AB testing
    const { data: channelFound, error: errorChannel } = await supabase
      .from('channels')
      .select('id, name, version(name)')
      .eq('app_id', one.app_id)
      .eq('version', one.id)

    let unlink = [] as Database['public']['Tables']['channels']['Row'][]
    if ((channelFound && channelFound.length) || errorChannel) {
      displayStore.dialogOption = {
        header: t('want-to-unlink'),
        message: t('channel-bundle-linked').replace('%', channelFound?.map(ch => `${ch.name} (${ch.version.name})`).join(', ') ?? ''),
        buttons: [
          {
            text: t('yes'),
            role: 'yes',
            id: 'yes',
            handler: () => {
              if (channelFound)
                unlink = channelFound as any
            },
          },
          {
            text: t('no'),
            id: 'cancel',
            role: 'cancel',
          },
        ],
      }
      displayStore.showDialog = true
      if (await displayStore.onDialogDismiss()) {
        toast.error(t('canceled-delete'))
        return
      }
    }

    if (one.name === 'unknown' || one.name === 'builtin') {
      return
    }

    const didCancelRes = await didCancel(t('version'), false, !one.deleted)
    if (typeof didCancelRes === 'boolean' && didCancelRes === true)
      return

    if (unlink.length > 0) {
      const { data: unknownVersion, error: unknownError } = await supabase
        .from('app_versions')
        .select()
        .eq('app_id', one.app_id)
        .eq('name', 'unknown')
        .single()

      if (unknownError) {
        toast.error(t('cannot-find-unknown-version'))
        console.error('Cannot find unknown', JSON.stringify(unknownError))
        return
      }

      const { error: updateError } = await supabase
        .from('channels')
        .update({ version: unknownVersion.id })
        .in('id', unlink.map(c => c.id))

      if (updateError) {
        toast.error(t('unlink-error'))
        console.error('unlink error (updateError)', updateError)
        return
      }
    }

    const { error: delAppError } = await (didCancelRes === 'normal'
      ? supabase
          .from('app_versions')
          .update({ deleted: true })
          .eq('app_id', one.app_id)
          .eq('id', one.id)
      : supabase
          .from('app_versions')
          .delete()
          .eq('app_id', one.app_id)
          .eq('id', one.id)
    )

    if (delAppError) {
      toast.error(t('cannot-delete-bundle'))
    }
    else {
      toast.success(t('bundle-deleted'))
      await refreshData()
    }
  }
  catch (error) {
    console.error(error)
    toast.error(t('cannot-delete-bundle'))
  }
}

columns.value = [
  {
    label: t('name'),
    key: 'name',
    mobile: true,
    sortable: true,
    head: true,
    onClick: (elem: Element) => openOne(elem),
  },
  {
    label: t('created-at'),
    key: 'created_at',
    mobile: true,
    sortable: 'desc',
    displayFunction: (elem: Element) => formatDate(elem.created_at || ''),
  },
  {
    label: t('channel'),
    key: 'channel',
    mobile: false,
    sortable: false,
    displayFunction: (elem: Element) => {
      if (elem.deleted)
        return t('deleted')
      return channelCache.value[elem.id]?.name || ''
    },
    onClick: async (elem: Element) => {
      if (elem.deleted || !channelCache.value[elem.id] || !channelCache.value[elem.id].id)
        return
      router.push(`/app/p/${appIdToUrl(props.appId)}/channel/${channelCache.value[elem.id].id}`)
    },
  },
  {
    label: t('size'),
    mobile: false,
    key: 'size',
    sortable: true,
    displayFunction: (elem: Element) => {
      if (elem.size)
        return bytesToMbText(elem.size)
      else if (elem.external_url)
        return t('stored-externally')
      else if (elem.deleted)
        return t('deleted')
      else
        return t('size-not-found')
    },
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
  elements.value.length = 0
  getData()
    .then(() => {
      if (total.value === 0) {
        showSteps.value = true
      }
      return organizationStore.getCurrentRoleForApp(props.appId)
    })
    .then((r) => {
      role.value = r
    })
    .catch(console.error)
}

async function massDelete() {
  console.log('massDelete')
  if (role.value && !organizationStore.hasPermisisonsInRole(role.value, ['admin', 'write', 'super_admin'])) {
    toast.error(t('no-permission'))
    return
  }

  if (selectedElements.value.length > 0 && !!(selectedElements.value as any).find((val: Element) => val.name === 'unknown' || val.name === 'builtin')) {
    toast.error(t('cannot-delete-unknown-or-builtin'))
    return
  }

  const didCancelRes = await didCancel(t('version'), true, !filters.value.deleted)
  if (typeof didCancelRes === 'boolean' && didCancelRes === true)
    return

  const linkedChannels = (await Promise.all((selectedElements.value as any).map(async (element: Element) => {
    return {
      data: (await supabase
        .from('channels')
        .select('id, name, version(name)')
        .eq('app_id', element.app_id)
        .eq('version', element.id)),
      element,
    }
  }))).map(({ data: { data, error }, element }) => {
    if (error) {
      throw new Error('Cannot find channel')
    }
    return {
      element,
      channelFound: (data?.length ?? 0) > 0,
      rawChannel: data,
    }
  })
  console.log('linkedChannels', linkedChannels)

  const linkedChannelsList = linkedChannels.filter(({ channelFound }) => channelFound)
  console.log('linkedChannelsList', linkedChannelsList)
  let unlink = [] as Database['public']['Tables']['channels']['Row'][]
  if (linkedChannelsList.length > 0) {
    displayStore.dialogOption = {
      header: t('want-to-unlink'),
      message: t('channel-bundle-linked').replace('%', linkedChannelsList.map(val => val.rawChannel?.map((ch: any) => `${ch.name} (${ch.version.name})`).join(', ')).join(', ') ?? ''),
      buttons: [
        {
          text: t('yes'),
          role: 'yes',
          id: 'yes',
          handler: () => {
            unlink = linkedChannelsList.map(val => val.rawChannel) as any
          },
        },
        {
          text: t('no'),
          id: 'cancel',
          role: 'cancel',
        },
      ],
    }
    displayStore.showDialog = true
    if (await displayStore.onDialogDismiss()) {
      toast.error(t('canceled-delete'))
      return
    }
  }

  if (unlink.length > 0) {
    const { data: unknownVersion, error: unknownError } = await supabase
      .from('app_versions')
      .select()
      .eq('app_id', props.appId)
      .eq('name', 'unknown')
      .single()

    if (unknownError) {
      toast.error(t('cannot-find-unknown-version'))
      console.error('Cannot find unknown', JSON.stringify(unknownError))
      return
    }

    const { error: updateError } = await supabase
      .from('channels')
      .update({ version: unknownVersion.id })
      .in('id', unlink.map(c => c.id).flat())

    if (updateError) {
      toast.error(t('unlink-error'))
      console.error('unlink error (updateError)', updateError)
      return
    }
  }

  if (didCancelRes === 'normal') {
    const { error: updateError } = await supabase
      .from('app_versions')
      .update({ deleted: true })
      .in('id', (selectedElements.value as any).map((val: Element) => val.id))

    if (updateError) {
      toast.error(t('cannot-delete-bundles'))
    }
    else {
      toast.success(t('bundles-deleted'))
      await refreshData()
    }
  }
  else {
    const { error: delAppError } = await supabase
      .from('app_versions')
      .delete()
      .in('id', (selectedElements.value as any).map((val: Element) => val.id))

    if (delAppError) {
      toast.error(t('cannot-delete-bundles'))
    }
    else {
      toast.success(t('bundles-deleted'))
      await refreshData()
    }
  }
}

function selectedElementsFilter(val: boolean[]) {
  console.log('selectedElementsFilter', val)
  selectedElements.value = (elements.value as any).filter((_: any, i: number) => val[i])
}

async function openOne(one: Element) {
  if (one.deleted)
    return
  router.push(`/app/p/${appIdToUrl(props.appId)}/bundle/${one.id}`)
}
watch(props, async () => {
  await refreshData()
  role.value = await organizationStore.getCurrentRoleForApp(props.appId)
})
</script>

<template>
  <div>
    <Table
      v-if="!showSteps"
      v-model:filters="filters" v-model:columns="columns" v-model:current-page="currentPage" v-model:search="search"
      :total="total"
      :show-add="!isMobile"
      :element-list="elements"
      filter-text="Filters"
      mass-select
      :is-loading="isLoading"
      :search-placeholder="t('search-bundle-id')"
      @add="showSteps = !showSteps"
      @reload="reload()" @reset="refreshData()"
      @mass-delete="massDelete()"
      @select-row="selectedElementsFilter"
    />
    <StepsBundle v-else :onboarding="!total" :app-id="props.appId" @done="onboardingDone" @close-step="showSteps = !showSteps" />
  </div>
</template>
