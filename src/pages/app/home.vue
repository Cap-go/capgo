<script setup lang="ts">
import type { RefresherCustomEvent } from '@ionic/vue'
import {
  IonContent,
  IonHeader, IonItem, IonItemDivider,
  IonItemOption, IonItemOptions,
  IonItemSliding,
  IonLabel,
  IonList,
  IonPage, IonRefresher, IonRefresherContent, IonTitle, IonToolbar,
  toastController,
} from '@ionic/vue'
import { ref, watchEffect } from 'vue'
import dayjs from 'dayjs'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useSupabase } from '~/services/supabase'
import type { definitions } from '~/types/supabase'
import Spinner from '~/components/Spinner.vue'
import { openVersion } from '~/services/versions'

const listRef = ref()
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
const formatDate = (date: string | undefined) => {
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}
const getMyApps = async() => {
  const { data } = await supabase
    .from<definitions['apps']>('apps')
    .select()
    .eq('user_id', auth?.id)
  if (data && data.length)
    apps.value = data
}

const deleteApp = async(app: definitions['apps']) => {
  console.log('deleteApp', app)
  if (listRef.value)
    listRef.value.$el.closeSlidingItems()
  try {
    await supabase
      .from<definitions['stats']>('stats')
      .delete()
      .eq('app_id', app.app_id)
    await supabase
      .from<definitions['devices']>('devices')
      .delete()
      .eq('app_id', app.app_id)

    const { data, error: vError } = await supabase
      .from<definitions['app_versions']>('app_versions')
      .select()
      .eq('app_id', app.app_id)
      .eq('user_id', app.user_id)
    const { error: delChanError } = await supabase
      .from<definitions['channels']>('channels')
      .delete()
      .eq('app_id', app.app_id)

    if (data && data.length) {
      const filesToRemove = (data as definitions['app_versions'][]).map(x => `${app.user_id}/${app.app_id}/versions/${x.bucket_id}`)
      const { error: delError } = await supabase
        .storage
        .from('apps')
        .remove(filesToRemove)
      if (delError) {
        const toast = await toastController
          .create({
            message: 'Cannot delete channel',
            duration: 2000,
          })
        await toast.present()
        return
      }
    }

    const { error: delAppVersionError } = await supabase
      .from<definitions['app_versions']>('app_versions')
      .delete()
      .eq('app_id', app.app_id)
      .eq('user_id', app.user_id)

    const { error: dbAppError } = await supabase
      .from<definitions['apps']>('apps')
      .delete()
      .eq('app_id', app.app_id)
      .eq('user_id', app.user_id)
    if (delChanError || vError || delAppVersionError || dbAppError) {
      const toast = await toastController
        .create({
          message: 'Cannot delete App',
          duration: 2000,
        })
      await toast.present()
    }
    else {
      const toast = await toastController
        .create({
          message: 'App deleted',
          duration: 2000,
        })
      await toast.present()
      await getMyApps()
    }
  }
  catch (error) {
    const toast = await toastController
      .create({
        message: 'Cannot delete app',
        duration: 2000,
      })
    await toast.present()
  }
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
        updated_at,
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
const refreshData = async(evt: RefresherCustomEvent | null = null) => {
  isLoading.value = true
  try {
    await getMyApps()
    await getSharedWithMe()
  }
  catch (error) {
    console.error(error)
  }
  isLoading.value = false
  evt?.target?.complete()
}
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
      <ion-refresher slot="fixed" @ionRefresh="refreshData($event)">
        <ion-refresher-content />
      </ion-refresher>
      <ion-list ref="listRef">
        <ion-item-divider>
          <ion-label>
            {{ t('projects.list') }}
          </ion-label>
        </ion-item-divider>
        <div v-if="isLoading" class="flex justify-center">
          <Spinner />
        </div>
        <template v-for="app in apps" v-else-if="apps?.length" :key="app.id">
          <IonItemSliding>
            <IonItem @click="openPackage(app.app_id)">
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
      </ion-list>
    </ion-content>
  </ion-page>
</template>

<route lang="yaml">
meta:
  option: tabs
</route>
