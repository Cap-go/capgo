<script setup lang="ts">
import {
  IonButton,
  IonButtons, IonContent, IonHeader, IonIcon, IonItem,
  IonItemDivider, IonLabel, IonList, IonListHeader, IonNote, IonPage,
  IonTitle, IonToolbar, actionSheetController, toastController,
} from '@ionic/vue'
import dayjs from 'dayjs'
import { chevronBack } from 'ionicons/icons'
import { ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useSupabase } from '~/services/supabase'
import type { definitions } from '~/types/supabase'

interface Device {
  version: definitions['app_versions']
}
interface Channel {
  version: definitions['app_versions']
}
interface ChannelDev {
  channel_id: definitions['channels'] & Channel
}
const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const supabase = useSupabase()
const packageId = ref<string>('')
const id = ref<string>()
const isLoading = ref(true)
const device = ref<definitions['devices'] & Device>()
const deviceOverride = ref<definitions['devices_override'] & Device>()
const channels = ref<(definitions['channels'] & Channel)[]>([])
const versions = ref<definitions['app_versions'][]>([])
const channelDevice = ref<definitions['channel_devices'] & ChannelDev>()

const getVersion = async() => {
  try {
    const { data: dataVersions } = await supabase
      .from<definitions['app_versions']>('app_versions')
      .select()
      .eq('app_id', packageId.value)
      .eq('deleted', false)
      .order('created_at', { ascending: false })
    versions.value = dataVersions || versions.value
  }
  catch (error) {
    console.error(error)
  }
}
const getChannels = async() => {
  try {
    const { data: dataChannels } = await supabase
      .from<definitions['channels'] & Channel>('channels')
      .select(`
        id,
        name,
        created_at,
        updated_at
      `)
      .eq('app_id', packageId.value)
    channels.value = dataChannels || channels.value
  }
  catch (error) {
    console.error(error)
  }
}
const getChannelOverride = async() => {
  const { data: dataDev } = await supabase
    .from<definitions['channel_devices'] & ChannelDev>('channel_devices')
    .select(`
      device_id,
      app_id,
      channel_id (
        name,
        version (
          name
        )
      ),
      created_at,
      updated_at
    `)
    .eq('app_id', packageId.value)
  channelDevice.value = dataDev?.length ? dataDev[0] : undefined
}
const getDeviceOverride = async() => {
  const { data: dataDev } = await supabase
    .from<definitions['devices_override'] & Device>('devices_override')
    .select(`
      device_id,
      app_id,
      version (
          name
      ),
      created_at,
      updated_at
    `)
    .eq('app_id', packageId.value)
  deviceOverride.value = dataDev?.length ? dataDev[0] : undefined
}
const getDevice = async() => {
  if (!id.value)
    return
  try {
    const { data } = await supabase
      .from<definitions['devices'] & Device>('devices')
      .select(`
          device_id,
          app_id,
          platform,
          os_version,
          version (
            name,
            app_id,
            bucket_id,
            created_at
          ),
          created_at,
          plugin_version,
          updated_at
        `)
      .eq('device_id', id.value)
    if (data && data.length)
      device.value = data[0]
    else
      console.log('no channel')
    console.log('channel', device.value)
  }
  catch (error) {
    console.error(error)
  }
}

const loadData = async() => {
  isLoading.value = true
  await Promise.all([
    getDevice(),
    getDeviceOverride(),
    getChannelOverride(),
    getChannels(),
    getVersion(),
  ])
  isLoading.value = false
}
const formatDate = (date: string | undefined) => {
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}
const upsertDevVersion = async(device: string, v: definitions['app_versions']) => {
  return supabase
    .from<definitions['devices_override']>('devices_override')
    .upsert({
      device_id: device,
      version: v.id,
      app_id: packageId.value,
    })
}
const delDevVersion = async(device: string) => {
  return supabase
    .from<definitions['devices_override']>('devices_override')
    .delete()
    .eq('device_id', device)
    .eq('app_id', packageId.value)
}
const updateOverride = async() => {
  const buttons = []
  for (const version of versions.value) {
    buttons.push({
      text: version.name,
      handler: async() => {
        if (!device.value?.device_id)
          return
        isLoading.value = true
        try {
          await upsertDevVersion(device.value?.device_id, version)
          const toast = await toastController
            .create({
              message: t('device.link_version'),
              duration: 2000,
            })
          await toast.present()
          await loadData()
        }
        catch (error) {
          console.error(error)
          const toast = await toastController
            .create({
              message: t('device.link_fail'),
              duration: 2000,
            })
          await toast.present()
        }
        isLoading.value = false
      },
    })
  }
  if (channelDevice.value) {
    buttons.push({
      text: t('button.remove'),
      handler: async() => {
        device.value?.device_id && delDevVersion(device.value?.device_id)
        const toast = await toastController
          .create({
            message: t('device.unlink_version'),
            duration: 2000,
          })
        await toast.present()
        await loadData()
      },
    })
  }
  buttons.push({
    text: t('button.cancel'),
    role: 'cancel',
    handler: () => {
      console.log('Cancel clicked')
    },
  })
  const actionSheet = await actionSheetController.create({
    header: t('package.link_version'),
    buttons,
  })
  await actionSheet.present()
}
const upsertDevChannel = async(device: string, channel: definitions['channels']) => {
  return supabase
    .from<definitions['channel_devices']>('channel_devices')
    .upsert({
      device_id: device,
      channel_id: channel.id,
      app_id: packageId.value,
    })
}
const delDevChannel = async(device: string) => {
  return supabase
    .from<definitions['channel_devices']>('channel_devices')
    .delete()
    .eq('device_id', device)
    .eq('app_id', packageId.value)
}
const updateChannel = async() => {
  const buttons = []
  for (const channel of channels.value) {
    buttons.push({
      text: channel.name,
      handler: async() => {
        if (!device.value?.device_id)
          return
        isLoading.value = true
        try {
          await upsertDevChannel(device.value?.device_id, channel)
          const toast = await toastController
            .create({
              message: t('device.link_channel'),
              duration: 2000,
            })
          await toast.present()
          await loadData()
        }
        catch (error) {
          console.error(error)
          const toast = await toastController
            .create({
              message: t('device.link_fail'),
              duration: 2000,
            })
          await toast.present()
        }
        isLoading.value = false
      },
    })
  }
  if (channelDevice.value) {
    buttons.push({
      text: t('button.remove'),
      handler: async() => {
        device.value?.device_id && delDevChannel(device.value?.device_id)
        const toast = await toastController
          .create({
            message: t('device.unlink_channel'),
            duration: 2000,
          })
        await toast.present()
        await loadData()
      },
    })
  }
  buttons.push({
    text: t('button.cancel'),
    role: 'cancel',
    handler: () => {
      console.log('Cancel clicked')
    },
  })
  const actionSheet = await actionSheetController.create({
    header: t('package.link_channel'),
    buttons,
  })
  await actionSheet.present()
}

watchEffect(async() => {
  if (route.path.includes('/d/')) {
    packageId.value = route.params.p as string
    packageId.value = packageId.value.replaceAll('--', '.')
    id.value = route.params.device as string
    await loadData()
  }
})
const back = () => {
  router.go(-1)
}
</script>
<template>
  <ion-page>
    <IonHeader class="header-custom">
      <IonToolbar class="toolbar-no-border">
        <IonButtons slot="start" class="mx-3">
          <IonButton @click="back">
            <IonIcon :icon="chevronBack" class="text-grey-dark" /> {{ t('button.back') }}
          </IonButton>
        </IonButtons>
        <IonTitle color="warning">
          {{ t('device.title') }}
        </IonTitle>
      </IonToolbar>
    </IonHeader>
    <ion-content :fullscreen="true">
      <ion-header collapse="condense">
        <ion-toolbar>
          <ion-title color="warning" size="large">
            {{ t('device.title') }}
          </ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-list>
        <ion-list-header>
          <span class="text-vista-blue-500">
            {{ device?.device_id }}
          </span>
        </ion-list-header>
        <ion-item-divider>
          <ion-label>
            {{ t('device.info') }}
          </ion-label>
        </ion-item-divider>
        <IonItem v-if="device">
          <IonLabel>
            <h2 class="text-sm text-azure-500">
              {{ t('device.platform') }}
            </h2>
          </IonLabel>
          <IonNote slot="end">
            {{ device.platform }}
          </IonNote>
        </IonItem>
        <IonItem v-if="device">
          <IonLabel>
            <h2 class="text-sm text-azure-500">
              {{ t('device.plugin_version') }}
            </h2>
          </IonLabel>
          <IonNote slot="end">
            {{ device.plugin_version }}
          </IonNote>
        </IonItem>
        <IonItem v-if="device">
          <IonLabel>
            <h2 class="text-sm text-azure-500">
              {{ t('device.version') }}
            </h2>
          </IonLabel>
          <IonNote slot="end">
            {{ device.version.name }}
          </IonNote>
        </IonItem>
        <IonItem v-if="device">
          <IonLabel>
            <h2 class="text-sm text-azure-500">
              {{ t('device.last_update') }}
            </h2>
          </IonLabel>
          <IonNote slot="end">
            {{ formatDate(device.updated_at) }}
          </IonNote>
        </IonItem>
        <IonItem v-if="device">
          <IonLabel>
            <h2 class="text-sm text-azure-500">
              {{ t('device.os_version') }}
            </h2>
          </IonLabel>
          <IonNote slot="end">
            {{ device.os_version || 'unknow' }}
          </IonNote>
        </IonItem>
        <IonItem v-if="device">
          <IonLabel>
            <h2 class="text-sm text-azure-500">
              {{ t('device.created_at') }}
            </h2>
          </IonLabel>
          <IonNote slot="end">
            {{ formatDate(device.created_at) }}
          </IonNote>
        </IonItem>
        <IonItem v-if="device" class="cursor-pointer" @click="updateOverride">
          <IonLabel>
            <h2 class="text-sm text-azure-500">
              {{ t('device.force_version') }}
            </h2>
          </IonLabel>
          <IonNote slot="end">
            {{ deviceOverride?.version?.name || t('device.no_override') }}
          </IonNote>
        </IonItem>
        <IonItem v-if="device" class="cursor-pointer" @click="updateChannel">
          <IonLabel>
            <h2 class="text-sm text-azure-500">
              {{ t('device.channel') }}
            </h2>
          </IonLabel>
          <IonNote slot="end">
            {{ channelDevice?.channel_id.name || t('device.no_channel') }}
          </IonNote>
        </IonItem>
      </ion-list>
    </ion-content>
  </ion-page>
</template>
