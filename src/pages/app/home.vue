<script setup lang="ts">
import {
  IonContent,
  IonPage,
} from '@ionic/vue'
import { ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { SafeArea } from 'capacitor-plugin-safe-area'
import Dashboard from '../dashboard/Dashboard.vue'
import Steps from '../onboarding/Steps.vue'
import { useSupabase } from '~/services/supabase'
import type { definitions } from '~/types/supabase'

const safeArea = ref(0)

const getSafeArea = async () => {
  SafeArea.getStatusBarHeight().then(({ statusBarHeight }) => {
    console.log(statusBarHeight, 'statusbarHeight')
    safeArea.value = statusBarHeight
  })
}

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
    await getSafeArea()
    isLoading.value = false
  }
})
</script>

<template>
  <IonPage>
    <IonContent :fullscreen="true">
      <Dashboard v-if="!isLoading && apps.length > 0" :apps="apps" :shared-apps="sharedApps" />
      <Steps v-else-if="!isLoading" />
      <div v-else class="flex justify-center">
        <Spinner />
      </div>
    </IonContent>
  </IonPage>
</template>
