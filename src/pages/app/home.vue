<script setup lang="ts">
import { IonContent, IonHeader, IonItem, IonItemDivider, IonLabel, IonList, IonPage, IonTitle, IonToolbar, isPlatform } from '@ionic/vue'
import { CapacitorUpdater } from 'capacitor-updater'
import { useSupabase } from '~/services/supabase'
import type { definitions } from '~/types/supabase'

const { t } = useI18n()
const route = useRoute()
const supabase = useSupabase()
const auth = supabase.auth.user()
const apps = ref<definitions['apps'][]>()
const openUrl = async(app: definitions['apps']) => {
  const res = await supabase
    .storage
    .from(`apps/${app.user_id}`)
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
  if (route.path === '/app/home') {
    const { data } = await supabase
      .from<definitions['apps']>('apps')
      .select()
      .eq('user_id', auth?.id)
    if (data && data.length)
      apps.value = data
  }
})
</script>
<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ t('projects.title') }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content :fullscreen="true">
      <ion-header collapse="condense">
        <ion-toolbar>
          <ion-title size="large">
            {{ t('projects.title') }}
          </ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-list>
        <!-- <ion-item-divider>
          <ion-label>
            {{ t('projects.recentopen') }}
          </ion-label>
        </ion-item-divider> -->
        <!-- Add app in prod -->
        <ion-item-divider>
          <ion-label>
            {{ t('projects.recentdev') }}
          </ion-label>
        </ion-item-divider>
        <IonItem v-for="(app, index) in apps" :key="index" @click="openUrl(app)">
          <div slot="start" class="col-span-2 relative py-4">
            <img :src="app.icon" alt="bebe" class="rounded-xl h-15 w-15 object-cover">
          </div>
          <IonLabel>
            <div class="col-span-6 flex flex-col">
              <div class="flex justify-between items-center">
                <h2 class="text-sm text-bright-cerulean-500">
                  {{ app.name }}
                </h2>
              </div>
              <div class="flex justify-between items-center">
                <h3 class="text-true-gray-800 py-1 font-bold">
                  {{
                    app.version
                  }}
                </h3>
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
