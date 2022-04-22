<script setup lang="ts">
import {
  IonButton, IonButtons, IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemDivider,
  IonItemOption,
  IonItemOptions, IonItemSliding,
  IonLabel, IonList,
  IonNote, IonPage, IonRefresher, IonRefresherContent, IonSearchbar,
  IonTitle,
  IonToolbar,
  actionSheetController, isPlatform, toastController,
} from '@ionic/vue'
import dayjs from 'dayjs'
import { chevronBack, chevronForwardOutline } from 'ionicons/icons'
import { computed, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useSupabase } from '~/services/supabase'
import type { definitions } from '~/types/supabase'
import Spinner from '~/components/Spinner.vue'
import { openVersion } from '~/services/versions'

const listRef = ref()
const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const supabase = useSupabase()
const id = ref('')
const search = ref('')
const isLoading = ref(false)
const app = ref<definitions['apps']>()
const channels = ref<(definitions['channels'] & Channel)[]>([])
const versions = ref<definitions['app_versions'][]>([])

const versionFilter = computed(() => {
  const value = search.value
  if (value) {
    const filtered = versions.value.filter(version => version.name.toLowerCase().includes(value.toLowerCase()))
    return filtered
  }
  return versions.value
})
const loadData = async() => {
  try {
    const { data: dataApp } = await supabase
      .from<definitions['apps']>('apps')
      .select()
      .eq('app_id', id.value)
    const { data: dataVersions } = await supabase
      .from<definitions['app_versions']>('app_versions')
      .select()
      .eq('app_id', id.value)
      .eq('deleted', false)
      .order('created_at', { ascending: false })
    const { data: dataChannel } = await supabase
      .from<definitions['channels'] & Channel>('channels')
      .select(`
          id,
          name,
          app_id,
          version (
            name,
            created_at
          ),
          created_at,
          updated_at
          `)
      .eq('app_id', id.value)
      .order('updated_at', { ascending: false })
    app.value = dataApp?.length ? dataApp[0] : app.value
    versions.value = dataVersions || versions.value
    channels.value = dataChannel || channels.value
  }
  catch (error) {
    console.error(error)
  }
}

const refreshData = async(evt: RefresherCustomEvent | null = null) => {
  isLoading.value = true
  try {
    await loadData()
  }
  catch (error) {
    console.error(error)
  }
  isLoading.value = false
  evt?.target?.complete()
}

const deleteChannel = async(channel: definitions['channels']) => {
  console.log('deleteChannel', channel)
  if (listRef.value)
    listRef.value.$el.closeSlidingItems()
  try {
    const { error: delChannelUserError } = await supabase
      .from<definitions['channel_users']>('channel_users')
      .delete()
      .eq('app_id', channel.app_id)
    const { error: delChanError } = await supabase
      .from<definitions['channels']>('channels')
      .delete()
      .eq('app_id', channel.app_id)
      .eq('id', channel.id)
    if (delChanError || delChannelUserError) {
      const toast = await toastController
        .create({
          message: 'Cannot delete channel',
          duration: 2000,
        })
      await toast.present()
    }
    else {
      await refreshData()
      const toast = await toastController
        .create({
          message: 'Channel deleted',
          duration: 2000,
        })
      await toast.present()
    }
  }
  catch (error) {
    const toast = await toastController
      .create({
        message: 'Cannot delete channel',
        duration: 2000,
      })
    await toast.present()
  }
}

const deleteVersion = async(version: definitions['app_versions']) => {
  console.log('deleteVersion', version)
  if (listRef.value)
    listRef.value.$el.closeSlidingItems()
  try {
    const { error: delError } = await supabase
      .storage
      .from('apps')
      .remove([`${version.user_id}/${version.app_id}/versions/${version.bucket_id}`])
    const { error: delAppError } = await supabase
      .from<definitions['app_versions']>('app_versions')
      .update({ deleted: true })
      .eq('app_id', version.app_id)
      .eq('id', version.id)
    if (delAppError || delError) {
      const toast = await toastController
        .create({
          message: 'Cannot delete version',
          duration: 2000,
        })
      await toast.present()
    }
    else {
      const toast = await toastController
        .create({
          message: 'Version deleted',
          duration: 2000,
        })
      await toast.present()
      await refreshData()
    }
  }
  catch (error) {
    const toast = await toastController
      .create({
        message: 'Cannot delete channel',
        duration: 2000,
      })
    await toast.present()
  }
}

const openChannel = (channel: definitions['channels']) => {
  router.push(`/app/p/${id.value.replaceAll('.', '--')}/channel/${channel.id}`)
}
const openDevices = () => {
  router.push(`/app/p/${id.value.replaceAll('.', '--')}/devices`)
}
const openStats = () => {
  router.push(`/app/p/${id.value.replaceAll('.', '--')}/stats`)
}
const formatDate = (date: string | undefined) => {
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

const setChannel = async(v: definitions['app_versions'], channel: definitions['channels']) => {
  return supabase
    .from<definitions['channels']>('channels')
    .update({
      version: v.id,
    })
    .eq('id', channel.id)
}
const ASChannelChooser = async(v: definitions['app_versions']) => {
  // const buttons
  const buttons = []
  for (const channel of channels.value) {
    buttons.push({
      text: channel.name,
      handler: async() => {
        isLoading.value = true
        try {
          await setChannel(v, channel)
          await loadData()
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
        isLoading.value = false
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
const ASVersion = async(v: definitions['app_versions']) => {
  const actionSheet = await actionSheetController.create({
    buttons: [
      {
        text: isPlatform('capacitor') ? t('package.test') : t('package.download'),
        handler: () => {
          actionSheet.dismiss()
          openVersion(v)
        },
      },
      {
        text: t('package.set'),
        handler: () => {
          actionSheet.dismiss()
          ASChannelChooser(v)
        },
      },
      {
        text: t('button.cancel'),
        role: 'cancel',
        handler: () => {
          console.log('Cancel clicked')
        },
      },
    ],
  })
  await actionSheet.present()
}
interface Channel {
  id: string
  version: {
    name: string
    created_at: string
  }
}
interface RefresherEventDetail {
  complete(): void
}
interface RefresherCustomEvent extends CustomEvent {
  detail: RefresherEventDetail
  target: HTMLIonRefresherElement
}

watchEffect(async() => {
  if (route.path.startsWith('/app/package')) {
    id.value = route.params.package as string
    id.value = id.value.replaceAll('--', '.')
    await refreshData()
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
          {{ app?.name }}
        </IonTitle>
      </IonToolbar>
    </IonHeader>
    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="refreshData($event)">
        <ion-refresher-content />
      </ion-refresher>
      <div v-if="isLoading" class="chat-items flex justify-center">
        <Spinner />
      </div>
      <div v-else>
        <ion-list ref="listRef">
          <IonItem @click="openStats()">
            <IonLabel>
              <h2 class="text-sm text-azure-500">
                {{ t('package.mobiles-stats') }}
              </h2>
            </IonLabel>
            <IonNote slot="end">
              <IonIcon :icon="chevronForwardOutline" class="text-azure-500" />
            </IonNote>
          </IonItem>
          <IonItem @click="openDevices()">
            <IonLabel>
              <h2 class="text-sm text-azure-500">
                {{ t('package.device_list') }}
              </h2>
            </IonLabel>
            <IonNote slot="end">
              <IonIcon :icon="chevronForwardOutline" class="text-azure-500" />
            </IonNote>
          </IonItem>
          <IonItemDivider v-if="channels?.length">
            <IonLabel>
              {{ t('package.channels') }}
            </IonLabel>
          </IonItemDivider>
          <template v-for="ch in channels" :key="ch.name">
            <IonItemSliding>
              <IonItem @click="openChannel(ch)">
                <IonLabel>
                  <h2 class="text-sm text-azure-500">
                    {{ ch.name }}
                  </h2>
                </IonLabel>
                <IonNote slot="end">
                  <p>{{ ch.version.name }}</p>
                  {{ formatDate(ch.created_at) }}
                </IonNote>
              </IonItem>
              <IonItemOptions side="end">
                <IonItemOption color="warning" @click="deleteChannel(ch)">
                  Delete
                </IonItemOption>
              </IonItemOptions>
            </IonItemSliding>
          </template>
          <IonItemDivider v-if="versions?.length">
            <IonLabel>
              {{ t('package.versions') }}
            </IonLabel>
          </IonItemDivider>
          <!-- add item with searchbar -->
          <IonItem>
            <IonSearchbar @IonChange="search = $event.detail.value" />
          </IonItem>
          <template v-for="v in versionFilter" :key="v.name">
            <IonItemSliding>
              <IonItem @click="ASVersion(v)">
                <IonLabel>
                  <h2 class="text-sm text-azure-500">
                    {{ v.name }}
                  </h2>
                </IonLabel>
                <IonNote slot="end">
                  {{ formatDate(v.created_at) }}
                </IonNote>
              </IonItem>
              <IonItemOptions side="end">
                <IonItemOption color="warning" @click="deleteVersion(v)">
                  Delete
                </IonItemOption>
              </IonItemOptions>
            </IonItemSliding>
          </template>
        </ion-list>
      </div>
    </ion-content>
  </ion-page>
</template>
