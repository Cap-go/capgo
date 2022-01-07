<script setup lang="ts">
import {
  IonButton, IonButtons, IonContent,
  IonHeader, IonIcon, IonItem, IonItemDivider,
  IonLabel, IonList, IonPage, IonRefresher, IonRefresherContent,
  IonTitle,
  IonToolbar,
  actionSheetController, isPlatform, toastController,
} from '@ionic/vue'
import { chevronBack } from 'ionicons/icons'
import { CapacitorUpdater } from 'capacitor-updater'
import { SplashScreen } from '@capacitor/splash-screen'
import { useSupabase } from '~/services/supabase'
import type { definitions } from '~/types/supabase'
import Spinner from '~/components/Spinner.vue'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const supabase = useSupabase()
const auth = supabase.auth.user()
const id = ref('')
const isLoading = ref(false)
const app = ref<definitions['apps']>()
const channels = ref<(definitions['channels'] & Channel)[]>([])
const versions = ref<definitions['app_versions'][]>([])

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
// const openChannel = async(channel: definitions['channels']) => {
//   router.push(`/app/package/${id.value.replaceAll('.', '--')}/channel/${channel.id}`)
// }

const openVersion = async(app: definitions['app_versions']) => {
  isLoading.value = true
  const res = await supabase
    .storage
    .from(`apps/${auth?.id}/${app.app_id}/versions`)
    .createSignedUrl(app.bucket_id, 60)

  const signedURL = res.data?.signedURL
  if (signedURL && isPlatform('capacitor')) {
    try {
      SplashScreen.show()
      const newFolder = await CapacitorUpdater.download({
        url: signedURL,
      })
      await CapacitorUpdater.set(newFolder)
    }
    catch (error) {
      console.error(error)
      const toast = await toastController
        .create({
          message: 'Cannot set this version',
          duration: 2000,
        })
      await toast.present()
    }
    SplashScreen.show()
    isLoading.value = false
  }
  else {
    isLoading.value = false
    console.error('no signedURL')
    const toast = await toastController
      .create({
        message: isPlatform('capacitor') ? 'Cannot get the test version' : 'Cannot test in web browser',
        duration: 2000,
      })
    await toast.present()
  }
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
    text: 'Cancel',
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
const ASChannel = async(ch: definitions['channels']) => {
  const actionSheet = await actionSheetController.create({
    buttons: [
      {
        text: 'Test channel version',
        handler: () => {
          actionSheet.dismiss()
          versions.value.forEach((v) => {
            if (v.id === ch.version)
              return openVersion(v)
          })
        },
      },
      // {
      //   text: 'Info channel',
      //   handler: () => {
      //     actionSheet.dismiss()
      //     openChannel(v)
      //   },
      // },
      {
        text: 'Cancel',
        role: 'cancel',
        handler: () => {
          console.log('Cancel clicked')
        },
      },
    ],
  })
  await actionSheet.present()
}
const ASVersion = async(v: definitions['app_versions']) => {
  const actionSheet = await actionSheetController.create({
    buttons: [
      {
        text: 'Test version',
        handler: () => {
          actionSheet.dismiss()
          openVersion(v)
        },
      },
      {
        text: 'Set version to channel',
        handler: () => {
          actionSheet.dismiss()
          ASChannelChooser(v)
        },
      },
      {
        text: 'Cancel',
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
            <ion-title size="large">
              {{ app?.name }}
            </ion-title>
          </ion-toolbar>
        </ion-header>
        <img
          class="my-8 mx-auto w-30 h-30 object-cover rounded-5xl"
          :src="app?.icon_url"
        >
        <ion-list>
          <ion-item-divider v-if="channels?.length">
            <ion-label>
              {{ t('package.channels') }}
            </ion-label>
          </ion-item-divider>
          <IonItem v-for="(ch, index) in channels" :key="index" @click="ASChannel(ch)">
            <IonLabel>
              <div class="col-span-6 flex flex-col">
                <div class="flex justify-between items-center">
                  <h2 class="text-sm text-bright-cerulean-500">
                    {{ ch.name }}
                  </h2>
                  <p>{{ ch.version.name }}</p>
                </div>
              </div>
            </IonLabel>
          </IonItem>
          <ion-item-divider v-if="versions?.length">
            <ion-label>
              {{ t('package.versions') }}
            </ion-label>
          </ion-item-divider>
          <IonItem v-for="(v, index) in versions" :key="index" @click="ASVersion(v)">
            <IonLabel>
              <div class="col-span-6 flex flex-col">
                <div class="flex justify-between items-center">
                  <h2 class="text-sm text-bright-cerulean-500">
                    {{ v.name }}
                  </h2>
                </div>
              </div>
            </IonLabel>
          </IonItem>
        </ion-list>
      </div>
    </ion-content>
  </ion-page>
</template>
