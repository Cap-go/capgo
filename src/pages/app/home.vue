<script setup lang="ts">
import { IonContent, IonHeader, IonItem, IonItemDivider, IonLabel, IonList, IonPage, IonTitle, IonToolbar } from '@ionic/vue'
import { ref } from 'vue'
import { useSupabase } from '~/services/supabase'
import type { definitions } from '~/types/supabase'
import Spinner from '~/components/Spinner.vue'
import { openVersion } from '~/services/versions'

const { t } = useI18n()
const isLoading = ref(false)
const route = useRoute()
const router = useRouter()
const supabase = useSupabase()
const auth = supabase.auth.user()
const apps = ref<definitions['apps'][]>()
const sharedApps = ref<(definitions['channel_users'] & ChannelUserApp)[]>()
const openPackage = (appId: string) => {
  router.push(`/app/package/${appId.replaceAll('.', '--')}`)
}

interface ChannelUserApp {
  app_id: definitions['apps']
  channel_id: definitions['channels'] & {
    version: definitions['app_versions']
  }
}
const getMyApps = async() => {
  const { data } = await supabase
    .from<definitions['apps']>('apps')
    .select()
    .eq('user_id', auth?.id)
  if (data && data.length)
    apps.value = data
}
const getSharedWithMe = async() => {
  const { data } = await supabase
    .from<definitions['channel_users'] & ChannelUserApp>('channel_users')
    .select(`
      id,
      app_id (
        app_id,
        name,
        icon_url,
        last_version,
        created_at
      ),
      channel_id (
        version (
          bucket_id,
          app_id,
          name
        ),
        name,
        created_at
      ),
      user_id
      `)
    .eq('user_id', auth?.id)
  if (data && data.length)
    sharedApps.value = data
}
watchEffect(async() => {
  if (route.path === '/app/home') {
    isLoading.value = true
    await getMyApps()
    await getSharedWithMe()
    isLoading.value = false
  }
})
</script>
<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title color="warning">
          {{ t('projects.title') }}
        </ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content :fullscreen="true">
      <ion-header collapse="condense">
        <ion-toolbar>
          <ion-title color="warning" size="large">
            {{ t('projects.title') }}
          </ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-list>
        <ion-item-divider>
          <ion-label>
            {{ t('projects.list') }}
          </ion-label>
        </ion-item-divider>
        <div v-if="isLoading" class="flex justify-center">
          <Spinner />
        </div>
        <IonItem v-for="(app, index) in apps" v-else-if="apps?.length" :key="index" class="cursor-pointer" @click="openPackage(app.app_id)">
          <div slot="start" class="col-span-2 relative py-4">
            <img :src="app.icon_url" alt="logo" class="rounded-xl h-15 w-15 object-cover">
          </div>
          <IonLabel>
            <div class="col-span-6 flex flex-col">
              <div class="flex justify-between items-center">
                <h2 class="text-sm text-azure-500">
                  {{ app.name }}
                </h2>
              </div>
              <div class="flex justify-between items-center">
                <h3 v-if="app.last_version" class="text-true-gray-800 py-1 font-bold">
                  Last version: {{
                    app.last_version
                  }}
                </h3>
                <h3 v-else class="text-true-gray-800 py-1 font-bold">
                  No version upload yet
                </h3>
              </div>
            </div>
          </IonLabel>
        </IonItem>
        <IonItem v-else>
          <IonLabel>
            <div class="col-span-6 flex flex-col">
              <div class="flex justify-between items-center">
                <h2 class="text-sm text-azure-500">
                  No app yet
                </h2>
              </div>
              <div class="flex justify-between items-center">
                <h3 class="text-true-gray-800 py-1 font-bold">
                  To create one use the <a href="/app/apikeys" class="cursor-pointer underline">CLI</a> capgo with your APIKEY
                </h3>
              </div>
            </div>
          </IonLabel>
        </IonItem>
        <ion-item-divider>
          <ion-label>
            {{ t('projects.sharedlist') }}
          </ion-label>
        </ion-item-divider>
        <IonItem v-for="(app, index) in sharedApps" :key="index" class="cursor-pointer" @click="openVersion(app.channel_id.version)">
          <div slot="start" class="col-span-2 relative py-4">
            <img :src="app.app_id.icon_url" alt="logo" class="rounded-xl h-15 w-15 object-cover">
          </div>
          <IonLabel>
            <div class="col-span-6 flex flex-col">
              <div class="flex justify-between items-center">
                <h2 class="text-sm text-azure-500">
                  {{ app.app_id.name }}
                </h2>
              </div>
              <div class="flex justify-between items-center">
                <h3 v-if="app.channel_id" class="text-true-gray-800 py-1 font-bold">
                  {{ app.channel_id.name }}: {{
                    app.channel_id.version.name
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
