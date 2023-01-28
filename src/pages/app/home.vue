<script setup lang="ts">
import {
  IonContent,
  IonPage,
} from '@ionic/vue'
import { ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import Dashboard from '../dashboard/Dashboard.vue'
import Steps from '../onboarding/Steps.vue'
import { useSupabase } from '~/services/supabase'
import Spinner from '~/components/Spinner.vue'
import type { Database } from '~/types/supabase.types'
import { useMainStore } from '~/stores/main'

const isLoading = ref(false)
const route = useRoute()
const main = useMainStore()
const supabase = useSupabase()
const apps = ref<Database['public']['Tables']['apps']['Row'][]>([])
const sharedApps = ref<(Database['public']['Tables']['channel_users']['Row'] & ChannelUserApp)[]>([])

interface ChannelUserApp {
  app_id: Database['public']['Tables']['apps']['Row']
  channel_id: Database['public']['Tables']['channels']['Row'] & {
    version: Database['public']['Tables']['app_versions']['Row']
  }
}
const getMyApps = async () => {
  const { data } = await supabase
    .from('apps')
    .select()
    .eq('user_id', main.user?.id).order('name', { ascending: true })
  if (data && data.length)
    apps.value = data
  else
    apps.value = []
}

const onboardingDone = async () => {
  await getMyApps()
}

const getSharedWithMe = async () => {
  const { data } = await supabase
    .from('channel_users')
    .select(`
      id,
      app_id (
        app_id,
        name,
        updated_at,
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
    .eq('user_id', main.user?.id)
  if (data && data.length)
    sharedApps.value = data as (Database['public']['Tables']['channel_users']['Row'] & ChannelUserApp)[]
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
      <Dashboard v-if="apps.length > 0 || sharedApps.length > 0" :apps="apps" :shared-apps="sharedApps" @reload-app="getMyApps()" @reload-shared="getSharedWithMe()" />
      <Steps v-else-if="!isLoading" :onboarding="true" @done="onboardingDone" />
      <div v-else class="flex justify-center">
        <Spinner />
      </div>
    </IonContent>
  </IonPage>
</template>
