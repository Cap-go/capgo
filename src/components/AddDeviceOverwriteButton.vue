<script setup lang="ts">
import plusOutline from '~icons/ion/add-outline?width=2em&height=2em'
import { toast } from 'vue-sonner'
import { appIdToUrl } from '~/services/conversion'
import { useSupabase } from '~/services/supabase'
import type { Database } from '~/types/supabase.types'

type ExtraChannel = (Database['public']['Tables']['channels']['Row'] & { version: Database['public']['Tables']['app_versions']['Row'] })

const props = defineProps<{
  channel?: ExtraChannel
  appId: string
}>()

const displayStore = useDisplayStore()
const { t } = useI18n()
const supabase = useSupabase()
const router = useRouter()

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
</script>

<template>
  <button class="fixed z-20 bg-gray-800 btn btn-circle btn-lg btn-outline right-4-safe bottom-4-safe secondary" @click="handlePlus">
    <plusOutline />
  </button>
</template>
