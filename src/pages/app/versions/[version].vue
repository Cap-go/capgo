<script setup lang="ts">
import { IonContent, IonHeader, IonItem, IonItemDivider, IonLabel, IonList, IonPage, IonTitle, IonToolbar, isPlatform } from '@ionic/vue'
import { CapacitorUpdater } from 'capacitor-updater'
import { useSupabase } from '~/services/supabase'
import type { definitions } from '~/types/supabase'

const { t } = useI18n()
const route = useRoute()
const supabase = useSupabase()
const auth = supabase.auth.user()
const id = ref('')
const appsProd = ref<definitions['app_versions'][]>()
const appsDev = ref<definitions['app_versions'][]>()
const openUrl = async(app: definitions['app_versions']) => {
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
  if (route.path.startsWith('/app/version')) {
    id.value = route.params.version as string
    try {
      const { data: dataProd } = await supabase
        .from<definitions['app_versions']>('app_versions')
        .select()
        .eq('app_id', id.value)
        .eq('mode', 'prod')
      const { data: dataDev } = await supabase
        .from<definitions['app_versions']>('app_versions')
        .select()
        .eq('app_id', id.value)
        .eq('mode', 'dev')
      if (dataProd && dataProd.length)
        appsProd.value = dataProd
      if (dataDev && dataDev.length)
        appsDev.value = dataDev
    }
    catch (error) {
      console.error(error)
    }
  }
})
</script>
<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ t('versions.title') }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content :fullscreen="true">
      <ion-header collapse="condense">
        <ion-toolbar>
          <ion-title size="large">
            {{ t('versions.title') }}
          </ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-list>
        <ion-item-divider v-if="appsProd?.length">
          <ion-label>
            {{ t('versions.prod_list') }}
          </ion-label>
        </ion-item-divider>
        <IonItem v-for="(app, index) in appsProd" :key="index" @click="openUrl(app)">
          <IonLabel>
            <div class="col-span-6 flex flex-col">
              <div class="flex justify-between items-center">
                <h2 class="text-sm text-bright-cerulean-500">
                  {{ app.name }}
                </h2>
              </div>
            </div>
          </IonLabel>
        </IonItem>
        <!-- Add app in prod -->
        <ion-item-divider v-if="appsDev?.length">
          <ion-label>
            {{ t('versions.dev_list') }}
          </ion-label>
        </ion-item-divider>
        <IonItem v-for="(app, index) in appsDev" :key="index" @click="openUrl(app)">
          <IonLabel>
            <div class="col-span-6 flex flex-col">
              <div class="flex justify-between items-center">
                <h2 class="text-sm text-bright-cerulean-500">
                  {{ app.name }}
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
