<script setup lang="ts">
import {
  IonButton, IonButtons, IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemDivider,
  IonItemOption, IonItemOptions, IonItemSliding, IonLabel,
  IonList, IonNote, IonPage, IonRefresher, IonRefresherContent,
  IonTitle,
  IonToolbar,
  actionSheetController, isPlatform, toastController,
} from '@ionic/vue'
import dayjs from 'dayjs'
import { chevronBack } from 'ionicons/icons'
import { useSupabase } from '~/services/supabase'
import type { definitions } from '~/types/supabase'
import Spinner from '~/components/Spinner.vue'
import { openVersion } from '~/services/versions'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const supabase = useSupabase()
const id = ref('')
const isLoading = ref(false)
const app = ref<definitions['apps']>()
const channels = ref<(definitions['channels'] & Channel)[]>([])
const versions = ref<definitions['app_versions'][]>([])

const deleteChannel = async(channel: definitions['channels'] & Channel) => {
  console.log('deleteChannel', channel)
  try {
    const { error: delChanError } = await supabase
      .from<definitions['channels']>('channels')
      .delete()
      .eq('app_id', channel.app_id)
      .eq('id', channel.id)
    if (delChanError) {
      const toast = await toastController
        .create({
          message: 'Cannot delete channel',
          duration: 2000,
        })
      await toast.present()
    }
    else {
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
  try {
    const { error: delError } = await supabase
      .storage
      .from('apps')
      .remove([`${version.user_id}/${version.app_id}/versions/${version.bucket_id}`])
    const { error: delAppError } = await supabase
      .from<definitions['app_versions']>('app_versions')
      .delete()
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
      .order('created_at', { ascending: false })
    const { data: dataChannel } = await supabase
      .from<definitions['channels'] & Channel>('channels')
      .select(`
          id,
          name,
          version (
            name,
            created_at
          ),
          created_at,
          updated_at
          `)
      .eq('app_id', id.value)
      .order('updated_at', { ascending: false })
    if (dataApp && dataApp.length)
      app.value = dataApp[0]
    if (dataVersions && dataVersions.length)
      versions.value = dataVersions
    if (dataChannel && dataChannel.length)
      channels.value = dataChannel
  }
  catch (error) {
    console.error(error)
  }
}
const openChannel = async(channel: definitions['channels']) => {
  router.push(`/app/p/${id.value.replaceAll('.', '--')}/channel/${channel.id}`)
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
        <ion-header>
          <ion-toolbar>
            <ion-title color="warning" size="large">
              {{ app?.name }}
            </ion-title>
          </ion-toolbar>
        </ion-header>
        <img
          class="my-8 mx-auto w-30 h-30 object-cover rounded-5xl"
          :src="app?.icon_url"
        >
        <ion-list>
          <IonItemDivider v-if="channels?.length">
            <IonLabel>
              {{ t('package.channels') }}
            </IonLabel>
          </IonItemDivider>
          <IonItemSliding v-for="(ch, index) in channels" :key="index">
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
              <IonItemOptions side="end">
                <IonItemOption color="warning" @click="deleteChannel(ch)">
                  Delete
                </IonItemOption>
              </IonItemOptions>
            </IonItem>
          </IonItemSliding>
          <IonItemDivider v-if="versions?.length">
            <IonLabel>
              {{ t('package.versions') }}
            </IonLabel>
          </IonItemDivider>
          <IonItemSliding v-for="(v, index) in versions" :key="index">
            <IonItem @click="ASVersion(v)">
              <IonLabel>
                <h2 class="text-sm text-azure-500">
                  {{ v.name }}
                </h2>
              </IonLabel>
              <IonNote slot="end">
                {{ formatDate(v.created_at) }}
              </IonNote>
              <IonItemOptions side="end">
                <IonItemOption color="warning" @click="deleteVersion(v)">
                  Delete
                </IonItemOption>
              </IonItemOptions>
            </IonItem>
          </IonItemSliding>
        </ion-list>
      </div>
    </ion-content>
  </ion-page>
</template>
