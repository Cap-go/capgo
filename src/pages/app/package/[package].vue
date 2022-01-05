<script setup lang="ts">
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonItemDivider, IonLabel, IonList, IonPage, IonTitle, IonToolbar, actionSheetController, isPlatform } from '@ionic/vue'
import { chevronBack } from 'ionicons/icons'
import { CapacitorUpdater } from 'capacitor-updater'
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
    const { data: dataChannel } = await supabase
      .from<definitions['channels'] & Channel>('channels')
      .select(`
          id,
          name,
          version (
            name,
            created_at
          ),
          created_at
          `)
      .eq('app_id', id.value)
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
  // router.push(`/app/package/${id.value.replaceAll('.', '--')}/channel/${channel.id}`)
}

const openVersion = async(app: definitions['app_versions']) => {
  isLoading.value = true
  const res = await supabase
    .storage
    .from(`apps/${auth?.id}/versions/${app.app_id}`)
    .createSignedUrl(app.bucket_id, 60)

  const signedURL = res.data?.signedURL
  if (signedURL && isPlatform('capacitor')) {
    try {
      const newFolder = await CapacitorUpdater.download({
        url: signedURL,
      })
      await CapacitorUpdater.set(newFolder)
    }
    catch (error) {
      console.error(error)
    }
    isLoading.value = false
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
const ASChannel = async(v: definitions['app_versions']) => {
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
          ASChannel(v)
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
watchEffect(async() => {
  if (route.path.startsWith('/app/package')) {
    isLoading.value = true
    id.value = route.params.package as string
    id.value = id.value.replaceAll('--', '.')
    await loadData()
    isLoading.value = false
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
          <IonItem v-for="(ch, index) in channels" :key="index" @click="openChannel(ch)">
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
