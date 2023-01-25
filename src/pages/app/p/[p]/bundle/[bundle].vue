<script setup lang="ts">
import {
  IonHeader, IonItem,
  IonItemDivider, IonLabel,
  IonList, IonListHeader, IonNote,
  IonSearchbar, IonTitle, IonToolbar,
} from '@ionic/vue'
import { computed, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import copy from 'copy-text-to-clipboard'
import { Capacitor } from '@capacitor/core'
import ellipsisHorizontalCircle from '~icons/ion/ellipsis-horizontal-circle?raw'
import Spinner from '~/components/Spinner.vue'
import { useSupabase } from '~/services/supabase'
import { formatDate } from '~/services/date'
import TitleHead from '~/components/TitleHead.vue'
import { openVersion } from '~/services/versions'
import { useMainStore } from '~/stores/main'
import type { Database } from '~/types/supabase.types'
import { bytesToMbText } from '~/services/conversion'
import { useDisplayStore } from '~/stores/display'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const listRef = ref()
const displayStore = useDisplayStore()
const main = useMainStore()
const supabase = useSupabase()
const packageId = ref<string>('')
const id = ref<number>()
const loading = ref(true)
const version = ref<Database['public']['Tables']['app_versions']['Row']>()
const channels = ref<(Database['public']['Tables']['channels']['Row'])[]>([])
const version_meta = ref<Database['public']['Tables']['app_versions_meta']['Row']>()
const search = ref('')
const devices = ref<Database['public']['Tables']['devices']['Row'][]>([])

const copyToast = async (text: string) => {
  copy(text)
  displayStore.messageToast.push(t('copied-to-clipboard'))
}
const getDevices = async () => {
  if (!version.value)
    return
  try {
    const { data: dataDevices } = await supabase
      .from('devices')
      .select()
      .eq('version', id.value)
      .eq('app_id', version.value.app_id)
    if (dataDevices && dataDevices.length)
      devices.value = dataDevices
    else
      devices.value = []
  }
  catch (error) {
    console.error(error)
  }
}
const getChannels = async () => {
  if (!version.value)
    return
  const { data: dataChannel } = await supabase
    .from('channels')
    .select()
    .eq('app_id', version.value.app_id)
    .order('updated_at', { ascending: false })
  channels.value = dataChannel || channels.value
}

const showSize = computed(() => {
  if (version_meta.value?.size)
    return bytesToMbText(version_meta.value.size)
  else if (version.value?.external_url)
    return t('package.externally')
  else
    return t('package.not_available')
})
const setChannel = async (channel: Database['public']['Tables']['channels']['Row']) => {
  if (!version.value)
    return
  return supabase
    .from('channels')
    .update({
      version: version.value.id,
    })
    .eq('id', channel.id)
}
const ASChannelChooser = async () => {
  if (!version.value)
    return
  const buttons = []
  for (const channel of channels.value) {
    buttons.push({
      text: channel.name,
      handler: async () => {
        try {
          await setChannel(channel)
        }
        catch (error) {
          console.error(error)
          displayStore.messageToast.push(t('cannot-test-app-some'))
        }
      },
    })
  }
  buttons.push({
    text: t('button.cancel'),
    role: 'cancel',
    handler: () => {
      // console.log('Cancel clicked')
    },
  })
  displayStore.actionSheetOption = {
    header: t('package.link_channel'),
    buttons,
  }
  displayStore.showActionSheet = true
}
const openPannel = async () => {
  if (!version.value || !main.auth)
    return
  displayStore.actionSheetOption = {
    buttons: [
      {
        text: Capacitor.isNativePlatform() ? t('package.test') : t('package.download'),
        handler: () => {
          displayStore.showActionSheet = false
          if (!version.value)
            return
          openVersion(version.value, main.user?.id || '')
        },
      },
      {
        text: t('package.set'),
        handler: () => {
          displayStore.showActionSheet = false
          ASChannelChooser()
        },
      },
      {
        text: t('button.cancel'),
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
    packageId.value = packageId.value.replace(/--/g, '.')
    id.value = Number(route.params.bundle as string)
    await getVersion()
    await getChannels()
    await getDevices()
    loading.value = false
  }
})

const hideString = (str: string) => {
  const first = str.slice(0, 5)
  const last = str.slice(-5)
  return `${first}...${last}`
}

const devicesFilter = computed(() => {
  const value = search.value
  if (value) {
    const filtered = devices.value.filter(device => device.device_id.toLowerCase().includes(value.toLowerCase()))
    return filtered
  }
  return devices.value
})
</script>

<template>
  <TitleHead :title="t('package.versions')" color="warning" :default-back="`/app/package/${route.params.p}`" :plus-icon="ellipsisHorizontalCircle" @plus-click="openPannel" />
  <IonHeader collapse="condense">
    <IonToolbar mode="ios">
      <IonTitle color="warning" size="large">
        {{ t('package.versions') }}
      </IonTitle>
    </IonToolbar>
  </IonHeader>
  <IonList ref="listRef">
    <template v-if="!loading">
      <IonListHeader>
        <span class="text-vista-blue-500">
          {{ t('informations') }}
        </span>
      </IonListHeader>
      <IonItem>
        <IonLabel>
          <h2 class="text-sm text-azure-500">
            {{ t('bundle-number') }}
          </h2>
        </IonLabel>
        <IonNote slot="end">
          {{ version?.name }}
        </IonNote>
      </IonItem>
      <IonItem>
        <IonLabel>
          <h2 class="text-sm text-azure-500">
            {{ t('id') }}
          </h2>
        </IonLabel>
        <IonNote slot="end">
          {{ version?.id }}
        </IonNote>
      </IonItem>
      <IonItem v-if="version?.created_at">
        <IonLabel>
          <h2 class="text-sm text-azure-500">
            {{ t('device.created_at') }}
          </h2>
        </IonLabel>
        <IonNote slot="end">
          {{ formatDate(version?.created_at) }}
        </IonNote>
      </IonItem>
      <IonItem v-if="version?.updated_at">
        <IonLabel>
          <h2 class="text-sm text-azure-500">
            {{ t('updated-at') }}
          </h2>
        </IonLabel>
        <IonNote slot="end">
          {{ formatDate(version?.updated_at) }}
        </IonNote>
      </IonItem>
      <IonItem v-if="version?.checksum">
        <IonLabel>
          <h2 class="text-sm text-azure-500">
            {{ t('checksum') }}
          </h2>
        </IonLabel>
        <IonNote slot="end">
          {{ version.checksum }}
        </IonNote>
      </IonItem>
      <IonItem v-if="version_meta?.devices">
        <IonLabel>
          <h2 class="text-sm text-azure-500">
            {{ t('devices.title') }}
          </h2>
        </IonLabel>
        <IonNote slot="end">
          {{ version_meta.devices }}
        </IonNote>
      </IonItem>
      <IonItem v-if="version?.session_key">
        <IonLabel>
          <h2 class="text-sm text-azure-500">
            {{ t('session_key') }}
          </h2>
        </IonLabel>
        <IonNote slot="end" @click="copyToast(version?.session_key || '')">
          {{ hideString(version.session_key) }}
        </IonNote>
      </IonItem>
      <IonItem v-if="version?.external_url">
        <IonLabel>
          <h2 class="text-sm text-azure-500">
            {{ t('url') }}
          </h2>
        </IonLabel>
        <IonNote slot="end">
          {{ version.external_url }}
        </IonNote>
      </IonItem>
      <IonItem v-else>
        <IonLabel>
          <h2 class="text-sm text-azure-500">
            {{ t('size') }}
          </h2>
        </IonLabel>
        <IonNote slot="end">
          {{ showSize }}
        </IonNote>
      </IonItem>
      <IonItemDivider v-if="devices?.length">
        <IonLabel>
          {{ t('devices-using-this-b') }}
        </IonLabel>
      </IonItemDivider>
      <!-- add item with searchbar -->
      <IonItem v-if="devices?.length">
        <IonSearchbar @ion-change="search = ($event.detail.value || '')" />
      </IonItem>
      <template v-for="d in devicesFilter" :key="d.device_id">
        <IonItem class="cursor-pointer">
          <IonLabel>
            <h2 class="text-sm text-azure-500">
              {{ d.device_id }}
            </h2>
          </IonLabel>
          <IonNote slot="end">
            {{ formatDate(d.created_at || '') }}
          </IonNote>
        </IonItem>
      </template>
    </template>
    <div v-else class="flex justify-center">
      <Spinner />
    </div>
  </IonList>
</template>

<style>
  #confirm-button {
    background-color: theme('colors.red.500');
    color: theme('colors.white');
  }
</style>
