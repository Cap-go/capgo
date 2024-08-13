<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import ky from 'ky'
import { toast } from 'vue-sonner'
import type { TableColumn } from '../comp_def'
import type { Database } from '~/types/supabase.types'
import { formatDate } from '~/services/date'
import { defaultApiHost, useSupabase } from '~/services/supabase'
import { appIdToUrl } from '~/services/conversion'
import plusOutline from '~icons/ion/add-outline?width=2em&height=2em'

const props = defineProps<{
  appId: string
  ids?: string[]
  channel?: ExtraChannel
  versionId?: number | undefined
}>()

type Element = Database['public']['Tables']['devices']['Row'] & { version: Database['public']['Tables']['app_versions']['Row'] }
type ExtraChannel = (Database['public']['Tables']['channels']['Row'] & { version: Database['public']['Tables']['app_versions']['Row'] })

const { t } = useI18n()
const supabase = useSupabase()
const router = useRouter()
const displayStore = useDisplayStore()
const total = ref(0)
const search = ref('')
const elements = ref<Element[]>([])
const isLoading = ref(false)
const currentPage = ref(1)
const filters = ref({
  Override: false,
})
const offset = 10
const currentVersionsNumber = computed(() => {
  return (currentPage.value - 1) * offset
})
const columns = ref<TableColumn[]>([
  {
    label: t('device-id'),
    key: 'device_id',
    class: 'truncate max-w-10',
    mobile: true,
    sortable: true,
    head: true,
  },
  {
    label: t('updated-at'),
    key: 'updated_at',
    mobile: false,
    sortable: 'desc',
    displayFunction: (elem: Element) => formatDate(elem.updated_at || ''),
  },
  {
    label: t('platform'),
    key: 'platform',
    mobile: true,
    sortable: true,
    head: true,
    displayFunction: (elem: Element) => `${elem.platform} ${elem.os_version}`,
  },
  {
    label: t('bundle'),
    key: 'version',
    mobile: true,
    sortable: true,
    head: true,
    displayFunction: (elem: Element) => elem.version.name,
  },
])

async function getDevicesID() {
  let req = supabase
    .from('channel_devices')
    .select('device_id')
    .eq('app_id', props.appId)

  if (props.ids)
    req = req.in('device_id', props.ids)

  const { data } = await req

  let reqq = supabase
    .from('devices_override')
    .select('device_id')
    .eq('app_id', props.appId)

  if (props.ids)
    reqq = reqq.eq('device_id', props.ids)

  const { data: dataOverride } = await reqq

  const channelDev = data?.map(d => d.device_id) || []
  const overrideDev = dataOverride?.map(d => d.device_id) || []
  return [...channelDev, ...overrideDev]
}

interface DeviceData {
  app_id: string
  device_id: string
  version: number
  created_at: string
}

async function countDevices() {
  const { data: currentSession } = await supabase.auth.getSession()!
  if (!currentSession.session)
    return 0
  const currentJwt = currentSession.session.access_token
  const dataD = await ky
    .post(`${defaultApiHost}/private/devices`, {
      headers: {
        'Content-Type': 'application/json',
        'authorization': `Bearer ${currentJwt || ''}`,
      },
      body: JSON.stringify({
        count: true,
        // devicesId: props.ids?.length ? props.ids : undefined,
        appId: props.appId,
      }),
    })
    .then(res => res.json<{ count: number }>())
    .catch((err) => {
      console.log('Cannot get devices', err)
      return { count: 0 }
    })
  return dataD.count
}

async function getData() {
  isLoading.value = true
  try {
    let ids: string[] = []
    if (filters.value.Override)
      ids = await getDevicesID()
    // if (props.ids)
    //   ids = props.ids

    const { data: currentSession } = await supabase.auth.getSession()!
    if (!currentSession.session)
      return
    const currentJwt = currentSession.session.access_token
    const dataD = await ky
      .post(`${defaultApiHost}/private/devices`, {
        headers: {
          'Content-Type': 'application/json',
          'authorization': `Bearer ${currentJwt || ''}`,
        },
        body: JSON.stringify({
          appId: props.appId,
          versionId: props.versionId,
          devicesId: ids.length ? ids : undefined,
          search: search.value ? search.value : undefined,
          order: columns.value.filter(elem => elem.sortable).map(elem => ({ key: elem.key as string, sortable: elem.sortable })),
          rangeStart: currentVersionsNumber.value,
          rangeEnd: currentVersionsNumber.value + offset - 1,
        }),
      })
      .then(res => res.json<DeviceData[]>())
      .catch((err) => {
        console.log('Cannot get devices', err)
        return [] as DeviceData[]
      })
    // console.log('dataD', dataD)

    const versionPromises = dataD.map((element) => {
      return supabase
        .from('app_versions')
        .select('name')
        .eq('id', element.version)
        .single()
    })

    // Cast so that we can set version from the other request
    const finalData = dataD as any as Database['public']['Tables']['devices']['Row'] & { version: Database['public']['Tables']['app_versions']['Row'] }[]

    // This is faster then awaiting in a big loop
    const versionData = await Promise.all(versionPromises)
    versionData.forEach((version, index) => {
      if (version.error)
        finalData[index].version = { name: 'unknown' } as any
      else
        finalData[index].version = version.data as any
    })

    elements.value.push(...finalData as any)
  }
  catch (error) {
    console.error(error)
  }
  isLoading.value = false
}

async function reload() {
  // console.log('reload')
  try {
    elements.value.length = 0
    await getData()
  }
  catch (error) {
    console.error(error)
  }
}

async function refreshData() {
  try {
    currentPage.value = 1
    elements.value.length = 0
    total.value = await countDevices()
    await getData()
  }
  catch (error) {
    console.error(error)
  }
}
async function openOne(one: Element) {
  router.push(`/app/p/${appIdToUrl(props.appId)}/d/${one.device_id}`)
}

function countLowercaseLetters(str: string) {
  const matches = str.match(/[a-z]/g)
  return matches ? matches.length : 0
}

function countCapitalLetters(str: string) {
  const matches = str.match(/[A-Z]/g)
  return matches ? matches.length : 0
}

const deviceIdRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function customDeviceOverwritePart2() {
  displayStore.dialogOption = {
    header: t('type-device-id'),
    message: `${t('type-device-id-msg')}`,
    buttonCenter: true,
    headerStyle: 'w-full text-center',
    textStyle: 'w-full text-center',
    preventAccidentalClose: true,
    input: true,
    size: 'max-w-xl',
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('continue'),
        id: 'confirm-button',
        preventClose: true,
        handler: async () => {
          await customDeviceOverwritePart3()
        },
      },
    ],
  }
  displayStore.showDialog = true
}

async function customDeviceOverwritePart3() {
  const input = displayStore.dialogInputText
  const deviceId = input

  if (!deviceIdRegex.test(input)) {
    toast.error(t('invalid-uuid'))
    return
  }

  const bigLetters = countCapitalLetters(input)
  const smallLetters = countLowercaseLetters(input)

  if (bigLetters === smallLetters) {
    toast.error(t('cannot-determine-platform'))
    return
  }
  const platform = bigLetters > smallLetters ? 'ios' : 'android'

  if (props.channel) {
    await customDeviceOverwritePart4(deviceId, props.channel, platform)
    return
  }

  const { data: channelsR, error } = await supabase
    .from('channels')
    .select('id, name, owner_org, version ( id, name )')
    .eq('app_id', props.appId)

  if (error) {
    toast.error(t('cannot-fetch-channels'))
    console.error('chan error', error)
    return
  }

  const channels = channelsR as any as ExtraChannel[]

  const buttons = channels.map((chan) => {
    return {
      text: chan.name,
      id: chan.id,
      handler: async () => {
        await customDeviceOverwritePart4(deviceId, chan, platform)
      },
    }
  })

  displayStore.dialogOption = {
    header: t('select-channel'),
    message: `${t('select-channel-msg')}`,
    headerStyle: 'w-full text-center',
    textStyle: 'w-full text-center',
    preventAccidentalClose: true,
    buttonVertical: true,
    size: 'max-w-xl',
    buttons: Array.prototype.concat(
      buttons,
      [
        {
          text: t('button-cancel'),
          role: 'cancel',
        },
      ],
    ),
  }
  displayStore.showDialog = true
}

async function customDeviceOverwritePart4(
  deviceId: string,
  chan: ExtraChannel,
  platform: 'ios' | 'android',
) {
  displayStore.dialogOption = {
    buttonCenter: true,
    headerStyle: 'w-full text-center',
    textStyle: 'w-full text-center',
    preventAccidentalClose: true,
    header: t('confirm-overwrite'),
    message: `${t('confirm-overwrite-msg').replace('$1', deviceId).replace('$2', chan.name).replace('$3', chan.version.name)}`,
    size: 'max-w-xl',
    buttons: [
      {
        text: t('yes'),
        role: 'yes',
        handler: async () => {
          await customDeviceOverwritePart5(deviceId, chan, platform)
        },
      },
      {
        text: t('no'),
        role: 'cancel',
      },
    ],
  }
  displayStore.showDialog = true
}

async function customDeviceOverwritePart5(
  deviceId: string,
  chan: ExtraChannel,
  platform: 'ios' | 'android',
) {
  const { error: addDeviceError } = await supabase.functions.invoke('private/create_device', {
    body: {
      device_id: deviceId,
      app_id: props.appId,
      platform,
      version: chan.version.id,
    },
  })

  if (addDeviceError) {
    console.error('addDeviceError', addDeviceError)
    toast.error(t('cannot-create-empty-device'))
    return
  }

  const { error: overwriteError } = await supabase.from('channel_devices')
    .insert({
      app_id: props.appId,
      channel_id: chan.id,
      device_id: deviceId,
      owner_org: chan.owner_org,
    })

  if (overwriteError) {
    console.error('overwriteError', overwriteError)
    toast.error(t('cannot-create-overwrite'))
  }

  router.push(`/app/p/${appIdToUrl(props.appId)}/d/${deviceId}`)
}

async function handlePlus() {
  displayStore.dialogOption = {
    header: t('generate-device-overwrite'),
    message: `${t('generate-device-overwrite-msg')}`,
    buttonCenter: true,
    headerStyle: 'w-full text-center',
    textStyle: 'w-full text-center',
    size: 'max-w-xl',
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('continue'),
        id: 'confirm-button',
        handler: async () => {
          await customDeviceOverwritePart2()
        },
      },
    ],
  }
  displayStore.showDialog = true
}
onMounted(async () => {
  await refreshData()
})
</script>

<template>
  <Table
    v-model:filters="filters" v-model:columns="columns" v-model:current-page="currentPage" v-model:search="search"
    :total="total" row-click :element-list="elements"
    filter-text="Filters"
    :plus-button="true"
    :is-loading="isLoading"
    :search-placeholder="t('search-by-device-id')"
    @reload="reload()" @reset="refreshData()"
    @row-click="openOne"
  />
  <button class="fixed z-20 bg-gray-800 btn btn-circle btn-lg btn-outline right-4-safe bottom-4-safe secondary" @click="handlePlus">
    <plusOutline />
  </button>
</template>
