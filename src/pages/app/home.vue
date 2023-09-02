<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import Dashboard from '../../components/dashboard/Dashboard.vue'
import Steps from '../../components/dashboard/Steps.vue'
import { useSupabase } from '~/services/supabase'
import Spinner from '~/components/Spinner.vue'
import type { Database } from '~/types/supabase.types'
import { useMainStore } from '~/stores/main'
import { useDisplayStore } from '~/stores/display'

const isLoading = ref(false)
const displayStore = useDisplayStore()
const route = useRoute()
const main = useMainStore()
const supabase = useSupabase()
const apps = ref<Database['public']['Tables']['apps']['Row'][]>([])
const sharedApps = ref<Database['public']['Tables']['apps']['Row'][]>([])

async function getMyApps() {
  const { data, error } = await supabase
    .from('apps')
    .select()
    .eq('user_id', main.user?.id).order('name', { ascending: true })

  console.log('my apps', data, error)

  if (data && data.length)
    apps.value = data
  else
    apps.value = []
}

async function onboardingDone() {
  await getMyApps()
}

async function getSharedWithMe() {
  const userId = main.user?.id
  if (!userId)
    return

  const { data, error } = await supabase
    .from('apps')
    .select()
    .neq('user_id', main.user?.id).order('name', { ascending: true })

  if (error) {
    console.log('Error get sharred: ', error)
    return
  }

  console.log('shared', data)
  sharedApps.value = data
}
watchEffect(async () => {
  if (route.path === '/app/home') {
    isLoading.value = true
    await getMyApps()
    await getSharedWithMe()
    isLoading.value = false
    displayStore.NavTitle = ''
  }
})
</script>

<template>
  <div>
    <Dashboard v-if="apps.length > 0 || sharedApps.length > 0" :apps="apps" :shared-apps="sharedApps" @reload-app="getMyApps()" @reload-shared="getSharedWithMe()" />
    <Steps v-else-if="!isLoading" :onboarding="true" @done="onboardingDone" />
    <div v-else class="flex flex-col items-center justify-center h-full">
      <Spinner size="w-40 h-40" />
    </div>
  </div>
</template>
