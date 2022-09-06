<script setup lang="ts">
import {
  IonContent,
  IonPage,
} from '@ionic/vue'
import { ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import Steps from '../onboarding/Steps.vue'
import Dashboard from '../dashboard/Dashboard.vue'
import { useSupabase } from '~/services/supabase'
import type { definitions } from '~/types/supabase'
import Spinner from '~/components/Spinner.vue'

const isLoading = ref(false)
const route = useRoute()
const supabase = useSupabase()
const auth = supabase.auth.user()
const apps = ref<definitions['apps'][]>()
const sharedApps = ref<(definitions['channel_users'] & ChannelUserApp)[]>()

interface ChannelUserApp {
  app_id: definitions['apps']
  channel_id: definitions['channels'] & {
    version: definitions['app_versions']
  }
}
const getMyApps = async () => {
  const { data } = await supabase
    .from<definitions['apps']>('apps')
    .select()
    .eq('user_id', auth?.id)
  if (data && data.length)
    apps.value = data
  else
    apps.value = []
}

const getSharedWithMe = async () => {
  const { data } = await supabase
    .from<definitions['channel_users'] & ChannelUserApp>('channel_users')
    .select(`
      id,
      app_id (
        app_id,
        name,
        icon_url,
        last_version,
        user_id,
        created_at
      ),
      channel_id (
        version (
          bucket_id,
          app_id,
          name
        ),
        name,
        updated_at,
        created_at
      ),
      user_id
      `)
    .eq('user_id', auth?.id)
  if (data && data.length)
    sharedApps.value = data
}
watchEffect(async () => {
  if (route.path === '/app/home') {
    isLoading.value = true
    await getMyApps()
    await getSharedWithMe()
    isLoading.value = false
  }
})
</script>

<template>
  <IonPage>
    <IonContent :fullscreen="true">
      <!-- <IonList v-if="apps && apps?.length > 0" ref="listRef">
        <IonItemDivider>
          <IonLabel>
            {{ t('projects.list') }}
          </IonLabel>
        </IonItemDivider>
        <div v-if="isLoading" class="flex justify-center">
          <Spinner />
        </div>
        <template v-for="app in apps" v-else-if="apps?.length" :key="app.id">
          <IonItemSliding>
            <IonItem class="cursor-pointer" @click="openPackage(app.app_id)">
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
                      }} <p>
                        Last upload: {{
                          formatDate(app.updated_at)
                        }}
                      </p>
                    </h3>
                    <h3 v-else class="text-true-gray-800 py-1 font-bold">
                      No version upload yet
                    </h3>
                  </div>
                </div>
              </IonLabel>
            </IonItem>
            <IonItemOptions side="end">
              <IonItemOption color="warning" @click="deleteApp(app)">
                Delete
              </IonItemOption>
            </IonItemOptions>
          </IonItemSliding>
        </template>
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
        <IonItemDivider>
          <IonLabel>
            {{ t('projects.sharedlist') }}
          </IonLabel>
        </IonItemDivider>
        <IonItem v-for="(app, index) in sharedApps" :key="index" class="cursor-pointer" @click="openVersion(app.channel_id.version, app.app_id.user_id)">
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
                  }}<p>
                    Last upload: {{
                      formatDate(app.channel_id.updated_at)
                    }}
                  </p>
                </h3>
              </div>
            </div>
          </IonLabel>
        </IonItem>
      </IonList> -->
      <Dashboard v-if="!isLoading && apps && apps?.length > 0" />
      <Steps v-else-if="!isLoading" />
      <div v-else class="flex justify-center">
        <Spinner />
      </div>
    </IonContent>
  </IonPage>
</template>

<route lang="yaml">
meta:
  option: tabs
</route>
