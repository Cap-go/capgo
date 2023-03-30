<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import copy from 'copy-text-to-clipboard'
import { Capacitor } from '@capacitor/core'
import { toast } from 'vue-sonner'
import { useSupabase } from '~/services/supabase'
import { formatDate } from '~/services/date'
import { openVersion } from '~/services/versions'
import { useMainStore } from '~/stores/main'
import type { Database } from '~/types/supabase.types'
import { appIdToUrl, bytesToMbText, urlToAppId } from '~/services/conversion'
import { useDisplayStore } from '~/stores/display'
import IconDevice from '~icons/heroicons/device-phone-mobile'
import IconInformations from '~icons/material-symbols/info-rounded'
import type { Tab } from '~/components/comp_def'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const displayStore = useDisplayStore()
const main = useMainStore()
const supabase = useSupabase()
const ActiveTab = ref('info')
const packageId = ref<string>('')
const id = ref<number>()
const loading = ref(true)
const version = ref<Database['public']['Tables']['app_versions']['Row']>()
const channels = ref<(Database['public']['Tables']['channels']['Row'])[]>([])
const channel = ref<(Database['public']['Tables']['channels']['Row'])>()
const version_meta = ref<Database['public']['Tables']['app_versions_meta']['Row']>()

const copyToast = async (text: string) => {
  copy(text)
  toast.success(t('copied-to-clipboard'))
}

const tabs: Tab[] = [
  {
    label: t('info'),
    icon: IconInformations,
    key: 'info',
  },
  {
    label: t('devices'),
    icon: IconDevice,
    key: 'devices',
  },
]

const getChannels = async () => {
  if (!version.value)
    return
  channel.value = undefined
  const { data: dataChannel } = await supabase
    .from('channels')
    .select()
    .eq('app_id', version.value.app_id)
    .order('updated_at', { ascending: false })
  channels.value = dataChannel || channels.value
  // search if the bundle is used in a channel
  channels.value.forEach((chan) => {
    const v: number = chan.version as any
    if (version.value && v === version.value.id)
      channel.value = chan
  })
}

const openChannelLink = async () => {
  if (!version.value || !channel.value)
    return
  router.push(`/app/p/${appIdToUrl(version.value.app_id)}/channel/${channel.value?.id}`)
}

const showSize = computed(() => {
  if (version_meta.value?.size)
    return bytesToMbText(version_meta.value.size)
  else if (version.value?.external_url)
    return t('stored-externally')
  else
    return t('app-not-found')
})

const getUnknowBundleId = async () => {
  if (!version.value)
    return
  const { data } = await supabase
    .from('app_versions')
    .select()
    .eq('app_id', version.value.app_id)
    .eq('name', 'unknown')
    .single()
  return data?.id
}

const setChannel = async (channel: Database['public']['Tables']['channels']['Row'], id: number) => {
  return supabase
    .from('channels')
    .update({
      version: id,
    })
    .eq('id', channel.id)
}

const ASChannelChooser = async () => {
  if (!version.value)
    return
  const buttons = []
  for (const chan of channels.value) {
    const v: number = chan.version as any
    buttons.push({
      text: chan.name,
      selected: version.value.id === v,
      handler: async () => {
        if (!version.value)
          return
        try {
          await setChannel(chan, version.value.id)
          await getChannels()
        }
        catch (error) {
          console.error(error)
          toast.error(t('cannot-test-app-some'))
        }
      },
    })
  }
  buttons.push({
    text: t('button-cancel'),
    role: 'cancel',
    handler: () => {
      // console.log('Cancel clicked')
    },
  })
  displayStore.actionSheetOption = {
    header: t('channel-linking'),
    buttons,
  }
  displayStore.showActionSheet = true
}
const openChannel = async () => {
  if (!version.value || !main.auth)
    return
  if (!channel.value)
    return ASChannelChooser()
  displayStore.actionSheetOption = {
    buttons: [
      {
        text: t('set-bundle'),
        handler: () => {
          displayStore.showActionSheet = false
          ASChannelChooser()
        },
      },
      {
        text: t('button-cancel'),
        role: 'cancel',
        handler: () => {
          // console.log('Cancel clicked')
        },
      },
    ],
  }
  // push in button at index 1 if channel is set
  if (channel.value && displayStore.actionSheetOption.buttons) {
    displayStore.actionSheetOption.buttons.splice(1, 0, {
      text: t('open-channel'),
      handler: () => {
        displayStore.showActionSheet = false
        openChannelLink()
      },
    })
    displayStore.actionSheetOption.buttons.splice(2, 0, {
      text: t('unlink-channel'),
      handler: async () => {
        displayStore.showActionSheet = false
        try {
          if (!channel.value)
            return
          const id = await getUnknowBundleId()
          if (!id)
            return
          await setChannel(channel.value, id)
          await getChannels()
        }
        catch (error) {
          console.error(error)
          toast.error(t('cannot-test-app-some'))
        }
      },
    })
  }
  displayStore.showActionSheet = true
}
const openDownload = async () => {
  if (!version.value || !main.auth)
    return
  displayStore.actionSheetOption = {
    buttons: [
      {
        text: Capacitor.isNativePlatform() ? t('launch-bundle') : t('download'),
        handler: () => {
          displayStore.showActionSheet = false
          if (!version.value)
            return
          openVersion(version.value)
        },
      },
      {
        text: t('set-bundle'),
        handler: () => {
          displayStore.showActionSheet = false
          ASChannelChooser()
        },
      },
      {
        text: t('button-cancel'),
        role: 'cancel',
        handler: () => {
          // console.log('Cancel clicked')
        },
      },
    ],
  }
  displayStore.showActionSheet = true
}

const getVersion = async () => {
  if (!id.value)
    return
  try {
    const { data } = await supabase
      .from('app_versions')
      .select()
      .eq('app_id', packageId.value)
      .eq('id', id.value)
      .single()
    const { data: dataVersionsMeta } = await supabase
      .from('app_versions_meta')
      .select()
      .eq('id', id.value)
      .single()
    if (!data) {
      console.error('no version found')
      router.back()
      return
    }
    if (dataVersionsMeta)
      version_meta.value = dataVersionsMeta

    version.value = data
  }
  catch (error) {
    console.error(error)
  }
}

watchEffect(async () => {
  if (route.path.includes('/bundle/')) {
    loading.value = true
    packageId.value = route.params.p as string
    packageId.value = urlToAppId(packageId.value)
    id.value = Number(route.params.bundle as string)
    await getVersion()
    await getChannels()
    loading.value = false
    displayStore.NavTitle = t('bundle')
    displayStore.defaultBack = `/app/package/${route.params.p}/bundles`
  }
})

const hideString = (str: string) => {
  const first = str.slice(0, 5)
  const last = str.slice(-5)
  return `${first}...${last}`
}
// const failPercent = computed(() => {
//   if (!version.value)
//     return '0%'
//   const total = version_meta.value?.installs || 1
//   const fail = version_meta.value?.fails || 1
//   return `${Math.round((fail / total) * 100).toLocaleString()}%`
// })
</script>

<template>
  <div>
    <div v-if="version" class="h-full overflow-y-scroll md:py-4">
      <Tabs v-model:active-tab="ActiveTab" :tabs="tabs" />
      <div v-if="ActiveTab === 'info'" id="devices" class="flex flex-col">
        <div class="flex flex-col overflow-y-scroll border-slate-200 shadow-lg md:mx-auto md:mt-5 md:w-2/3 md:border dark:border-slate-900 md:rounded-lg dark:bg-gray-800">
          <dl class="divide-y divide-gray-500">
            <InfoRow :label="t('bundle-number')" :value="version.name" />
            <InfoRow :label="t('id')" :value="version.id.toString()" />
            <InfoRow v-if="version.created_at" :label="t('created-at')" :value="formatDate(version.created_at)" />
            <InfoRow v-if="version.updated_at" :label="t('updated-at')" :value="formatDate(version.updated_at)" />
            <!-- Checksum -->
            <InfoRow v-if="version.checksum" :label="t('checksum')" :value="version.checksum" />
            <!-- meta devices -->
            <InfoRow v-if="version_meta?.devices" :label="t('devices')" :value="version_meta.devices.toLocaleString()" />
            <InfoRow v-if="version_meta?.installs" :label="t('install')" :value="version_meta.installs.toLocaleString()" />
            <InfoRow v-if="version_meta?.uninstalls" :label="t('uninstall')" :value="version_meta.uninstalls.toLocaleString()" />
            <InfoRow v-if="version_meta?.fails" :label="t('fail')" :value="version_meta.fails.toLocaleString()" />
            <!-- <InfoRow v-if="version_meta?.installs && version_meta?.fails" :label="t('percent-fail')" :value="failPercent" /> -->
            <InfoRow :label="t('channel')" :value="channel ? channel.name : t('set-bundle')" :is-link="true" @click="openChannel()" />
            <!-- session_key -->
            <InfoRow v-if="version.session_key" :label="t('session_key')" :value="hideString(version.session_key)" :is-link="true" @click="copyToast(version?.session_key || '')" />
            <!-- version.external_url -->
            <InfoRow v-if="version.external_url" :label="t('url')" :value="version.external_url" :is-link="true" @click="copyToast(version?.external_url || '')" />
            <!-- size -->
            <InfoRow :label="t('size')" :value="showSize" :is-link="true" @click="openDownload()" />
          </dl>
        </div>
      </div>
      <div v-else-if="ActiveTab === 'devices'" id="devices" class="flex flex-col">
        <div class="mx-auto flex flex-col overflow-y-scroll border-slate-200 shadow-lg md:mt-5 md:w-2/3 md:border dark:border-slate-900 md:rounded-lg dark:bg-gray-800">
          <DeviceTable
            class="p-3"
            :app-id="packageId"
            :version-id="version.id"
          />
        </div>
      </div>
    </div>
  </div>
</template>
