<script setup lang="ts">
import type { RefresherCustomEvent } from '@ionic/vue'
import {
  IonContent,
  IonItem, IonItemDivider, IonItemOption,
  IonItemOptions, IonItemSliding,
  IonLabel,
  IonList,
  IonPage,
  IonRefresher, IonRefresherContent, alertController,
  toastController,
} from '@ionic/vue'
import { ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import Steps from '../onboarding/Steps.vue'
import { useSupabase } from '~/services/supabase'
import type { definitions } from '~/types/supabase'
import Spinner from '~/components/Spinner.vue'
import { openVersion } from '~/services/versions'
import { formatDate } from '~/services/date'

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
  router.push(`/app/package/${appId.replace(/\./g, '--')}`)
}

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

const didCancel = async (name: string) => {
  const alert = await alertController
    .create({
      header: t('alert.confirm-delete'),
      message: `${t('alert.delete-message')} ${name}?`,
      buttons: [
        {
          text: t('button.cancel'),
          role: 'cancel',
        },
        {
          text: t('button.delete'),
          id: 'confirm-button',
        },
      ],
    })
  await alert.present()
  return alert.onDidDismiss().then(d => (d.role === 'cancel'))
}

const deleteApp = async (app: definitions['apps']) => {
  console.log('deleteApp', app)
  if (listRef.value)
    listRef.value.$el.closeSlidingItems()
  if (await didCancel(t('package.name')))
    return
  try {
    const { data, error: vError } = await supabase
      .from<definitions['app_versions']>('app_versions')
      .select()
      .eq('app_id', app.app_id)
      .eq('user_id', app.user_id)

    if (data && data.length) {
      const filesToRemove = (data as definitions['app_versions'][]).map(x => `${app.user_id}/${app.app_id}/versions/${x.bucket_id}`)
      const { error: delError } = await supabase
        .storage
        .from('apps')
        .remove(filesToRemove)
      if (delError) {
        const toast = await toastController
          .create({
            message: t('cannot-delete-app-version'),
            duration: 2000,
          })
        await toast.present()
        return
      }
    }

    const { error: dbAppError } = await supabase
      .from<definitions['apps']>('apps')
      .delete()
      .eq('app_id', app.app_id)
      .eq('user_id', app.user_id)
    if (vError || dbAppError) {
      const toast = await toastController
        .create({
          message: t('cannot-delete-app'),
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
        message: t('cannot-delete-app'),
        duration: 2000,
      })
    await toast.present()
  }
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
const refreshData = async (evt: RefresherCustomEvent | null = null) => {
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
  <IonPage>
    <IonContent :fullscreen="true">
      <!-- <TitleHead :title="t('projects.title')" no-back big color="warning" /> -->
      <IonRefresher slot="fixed" @ion-refresh="refreshData($event)">
        <IonRefresherContent />
      </IonRefresher>
      <IonList v-if="apps && apps?.length > 0" ref="listRef">
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
      </IonList>
      <Steps v-else />
    </IonContent>
  </IonPage>
</template>

<route lang="yaml">
meta:
  option: tabs
</route>
