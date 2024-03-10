<script setup lang="ts">
import { useRoute } from 'vue-router'
import { ref, watch, watchEffect } from 'vue'
import { storeToRefs } from 'pinia'
import Steps from '../../components/dashboard/Steps.vue'
import Dashboard from '../../components/dashboard/Dashboard.vue'
import { useOrganizationStore } from '~/stores/organization'
import Spinner from '~/components/Spinner.vue'
import { useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'
import type { Database } from '~/types/supabase.types'

const route = useRoute()
const organizationStore = useOrganizationStore()
const isLoading = ref(false)
const supabase = useSupabase()
const displayStore = useDisplayStore()
const apps = ref<Database['public']['Tables']['apps']['Row'][]>([])
const sharedApps = ref<Database['public']['Tables']['apps']['Row'][]>([])

const { currentOrganization } = storeToRefs(organizationStore)

async function getMyApps() {
  const currentGid = organizationStore.currentOrganization?.gid

  if (!currentGid) {
    console.error('Current organization is null, cannot fetch apps')
    apps.value = []
    return
  }

  const { data } = await supabase
    .from('apps')
    .select()
    .eq('owner_org', currentGid)
    // .eq('user_id', main.user?.id).order('name', { ascending: true })

  if (data && data.length)
    apps.value = data
  else
    apps.value = []
}

async function onboardingDone() {
  await getMyApps()
}

watch(currentOrganization, async () => {
  await getMyApps()
})

watchEffect(async () => {
  if (route.path === '/app/home') {
    isLoading.value = true
    // await organizationStore.dedupFetchOrganizations()
    await getMyApps()
    isLoading.value = false
    displayStore.NavTitle = ''
  }
})
</script>

<template>
  <div>
    <Dashboard v-if="apps.length > 0 || sharedApps.length > 0" :apps="apps" :shared-apps="sharedApps" @reload-app="getMyApps()" />
    <Steps v-else-if="!isLoading" :onboarding="true" @done="onboardingDone" />
    <div v-else class="flex flex-col items-center justify-center h-full">
      <Spinner size="w-40 h-40" />
    </div>
  </div>
</template>
