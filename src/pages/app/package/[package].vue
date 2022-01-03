<script setup lang="ts">
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonItemDivider, IonLabel, IonList, IonPage, IonTitle, IonToolbar, isPlatform } from '@ionic/vue'
import { chevronBack } from 'ionicons/icons'
import { CapacitorUpdater } from 'capacitor-updater'
import { useSupabase } from '~/services/supabase'
import type { definitions } from '~/types/supabase'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const supabase = useSupabase()
const auth = supabase.auth.user()
const id = ref('')
const app = ref<definitions['apps']>()
const channels = ref<definitions['channels'][]>()
const versions = ref<definitions['app_versions'][]>()
const openVersion = async(app: definitions['app_versions']) => {
  const res = await supabase
    .storage
    .from(`apps/${auth?.id}/versions/${app.app_id}`)
    .createSignedUrl(app.bucket_id, 60)

  const signedURL = res.data?.signedURL
  if (signedURL && isPlatform('capacitor')) {
    const newFolder = await CapacitorUpdater.download({
      url: signedURL,
    })
    console.log('newFolder', newFolder)
    CapacitorUpdater.set(newFolder).then(() => {
      console.log('done update', newFolder)
    })
  }
}
watchEffect(async() => {
  if (route.path.startsWith('/app/package')) {
    id.value = route.params.package as string
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
        .from<definitions['channels']>('channels')
        .select()
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
            <IonIcon :icon="chevronBack" class="text-grey-dark" />
          </IonButton>
        </IonButtons>
        <div class="flex justify-between items-center">
          <div class="flex">
            <div class="relative">
              <img :src="app?.icon_url" class="h-15 w-15 object-cover bg-grey rounded-xl mr-4">
            </div>
            <div class="flex flex-col justify-center">
              <p class="text-left text-bright-cerulean-500 text-sm font-bold">
                {{ app?.name }}
              </p>
            </div>
          </div>
        </div>
      </IonToolbar>
    </IonHeader>
    <ion-content :fullscreen="true">
      <ion-header>
        <ion-toolbar>
          <ion-title size="large">
            {{ t('package.title') }}
          </ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-list>
        <ion-item-divider v-if="versions?.length">
          <ion-label>
            {{ t('package.versions') }}
          </ion-label>
        </ion-item-divider>
        <IonItem v-for="(v, index) in versions" :key="index" @click="openVersion(v)">
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
        <!-- Add app in prod -->
        <ion-item-divider v-if="channels?.length">
          <ion-label>
            {{ t('package.channels') }}
          </ion-label>
        </ion-item-divider>
        <IonItem v-for="(ch, index) in channels" :key="index">
          <IonLabel>
            <div class="col-span-6 flex flex-col">
              <div class="flex justify-between items-center">
                <h2 class="text-sm text-bright-cerulean-500">
                  {{ ch.name }}
                </h2>
              </div>
            </div>
          </IonLabel>
        </IonItem>
      </ion-list>
    </ion-content>
  </ion-page>
</template>

<route lang="yaml">
meta:
  option: tabs
</route>
