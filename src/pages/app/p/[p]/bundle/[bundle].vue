<script setup lang="ts">
import {
  IonContent,
  IonHeader, IonItem,
  IonItemDivider, IonLabel,
  IonList, IonListHeader, IonNote, IonPage,
  IonSearchbar, IonTitle, IonToolbar, actionSheetController, isPlatform, toastController,
} from '@ionic/vue'
import { computed, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { addOutline } from 'ionicons/icons'
import copy from 'copy-text-to-clipboard'
import Spinner from '~/components/Spinner.vue'
import { useSupabase } from '~/services/supabase'
import { formatDate } from '~/services/date'
import TitleHead from '~/components/TitleHead.vue'
import { openVersion } from '~/services/versions'
import { useMainStore } from '~/stores/main'
import type { Database } from '~/types/supabase.types'

const { t } = useI18n()
const route = useRoute()
const listRef = ref()
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
  const toast = await toastController
    .create({
      message: t('copied-to-clipboard'),
      duration: 2000,
    })
  await toast.present()
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
const bytesToMb = (bytes: number) => {
  const res = bytes / 1024 / 1024
  return `${res.toFixed(2)} MB`
}

const showSize = computed(() => {
  if (version_meta.value?.size)
    return bytesToMb(version_meta.value.size)
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
          const toast = await toastController
            .create({
              message: 'Cannot test app something wrong happened',
              duration: 2000,
            })
          await toast.present()
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
  const actionSheet = await actionSheetController.create({
    header: t('package.link_channel'),
    buttons,
  })
  await actionSheet.present()
}
const openPannel = async () => {
  if (!version.value || !main.auth)
    return
  const actionSheet = await actionSheetController.create({
    buttons: [
      {
        text: isPlatform('capacitor') ? t('package.test') : t('package.download'),
        handler: () => {
          actionSheet.dismiss()
          if (!version.value)
            return
          openVersion(version.value, main.auth?.id || '')
        },
      },
      {
        text: t('package.set'),
        handler: () => {
          actionSheet.dismiss()
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
  })
  await actionSheet.present()
}

const getVersion = async () => {
  if (!id.value)
    return
  try {
    const { data, error } = await supabase
      .from('app_versions')
      .select()
      .eq('app_id', packageId.value)
      .eq('id', id.value)
      .single()
    const { data: dataVersionsMeta, error: dataVersionsError } = await supabase
      .from('app_versions_meta')
      .select()
      .eq('id', id.value)
      .single()
    if (error || dataVersionsError) {
      console.error('no version', error, dataVersionsError)
      return
    }
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
  <IonPage>
    <TitleHead :title="t('package.versions')" color="warning" :default-back="`/app/package/${route.params.p}`" :plus-icon="addOutline" @plus-click="openPannel" />
    <IonContent :fullscreen="true">
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
          <IonItem>
            <IonLabel>
              <h2 class="text-sm text-azure-500">
                {{ t('checksum') }}
              </h2>
            </IonLabel>
            <IonNote slot="end">
              {{ version?.checksum }}
            </IonNote>
          </IonItem>
          <IonItem>
            <IonLabel>
              <h2 class="text-sm text-azure-500">
                {{ t('devices.title') }}
              </h2>
            </IonLabel>
            <IonNote slot="end">
              {{ version_meta?.devices }}
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
    </IonContent>
  </IonPage>
</template>

<style>
  #confirm-button {
    background-color: theme('colors.red.500');
    color: theme('colors.white');
  }
</style>
