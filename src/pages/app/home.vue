<script setup lang="ts">
import {
  IonContent,
  IonPage,
  // alertController,
  // toastController,
} from '@ionic/vue'
import { ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
// import { useI18n } from 'vue-i18n'
import Dashboard from '../dashboard/Dashboard.vue'
import Steps from '../onboarding/Steps.vue'
import { useSupabase } from '~/services/supabase'
import type { definitions } from '~/types/supabase'
import Spinner from '~/components/Spinner.vue'

// const { t } = useI18n()
const isLoading = ref(false)
const route = useRoute()
const supabase = useSupabase()
const auth = supabase.auth.user()
const apps = ref<definitions['apps'][]>([])
const sharedApps = ref<(definitions['channel_users'] & ChannelUserApp)[]>([])

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
    .eq('user_id', auth?.id).order('name', { ascending: true })
  if (data && data.length)
    apps.value = data
  else
    apps.value = []
}

// const didCancel = async (name: string) => {
//   const alert = await alertController
//     .create({
//       header: t('alert.confirm-delete'),
//       message: `${t('alert.delete-message')} ${name}?`,
//       buttons: [
//         {
//           text: t('button.cancel'),
//           role: 'cancel',
//         },
//         {
//           text: t('button.delete'),
//           id: 'confirm-button',
//         },
//       ],
//     })
//   await alert.present()
//   return alert.onDidDismiss().then(d => (d.role === 'cancel'))
// }

// const deleteApp = async (app: definitions['apps']) => {
//   // console.log('deleteApp', app)
//   if (await didCancel(t('package.name')))
//     return
//   try {
//     const { data, error: vError } = await supabase
//       .from<definitions['app_versions']>('app_versions')
//       .select()
//       .eq('app_id', app.app_id)
//       .eq('user_id', app.user_id)

//     if (data && data.length) {
//       const filesToRemove = (data as definitions['app_versions'][]).map(x => `${app.user_id}/${app.app_id}/versions/${x.bucket_id}`)
//       const { error: delError } = await supabase
//         .storage
//         .from('apps')
//         .remove(filesToRemove)
//       if (delError) {
//         const toast = await toastController
//           .create({
//             message: t('cannot-delete-app-version'),
//             duration: 2000,
//           })
//         await toast.present()
//         return
//       }
//     }

//     const { error: dbAppError } = await supabase
//       .from<definitions['apps']>('apps')
//       .delete()
//       .eq('app_id', app.app_id)
//       .eq('user_id', app.user_id)
//     if (vError || dbAppError) {
//       const toast = await toastController
//         .create({
//           message: t('cannot-delete-app'),
//           duration: 2000,
//         })
//       await toast.present()
//     }
//     else {
//       const toast = await toastController
//         .create({
//           message: 'App deleted',
//           duration: 2000,
//         })
//       await toast.present()
//       await getMyApps()
//     }
//   }
//   catch (error) {
//     const toast = await toastController
//       .create({
//         message: t('cannot-delete-app'),
//         duration: 2000,
//       })
//     await toast.present()
//   }
// }

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
      <Dashboard v-if="apps.length > 0 || sharedApps.length > 0" :apps="apps" :shared-apps="sharedApps" />
      <Steps v-else-if="!isLoading" :onboarding="true" />
      <div v-else class="flex justify-center">
        <Spinner />
      </div>
    </IonContent>
  </IonPage>
</template>
