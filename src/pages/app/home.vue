<script setup lang="ts">
import type { Database } from '~/types/supabase.types'
import { useI18n } from 'petite-vue-i18n'
import { storeToRefs } from 'pinia'
import { ref, watch, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import Spinner from '~/components/Spinner.vue'
import { useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'
import { useOrganizationStore } from '~/stores/organization'
import Dashboard from '../../components/dashboard/Dashboard.vue'
import Steps from '../../components/dashboard/Steps.vue'

const route = useRoute('/app/home')
const organizationStore = useOrganizationStore()
const isLoading = ref(false)
const supabase = useSupabase()
const { t } = useI18n()
const displayStore = useDisplayStore()
const apps = ref<Database['public']['Tables']['apps']['Row'][]>([])

const { currentOrganization } = storeToRefs(organizationStore)

async function getMyApps() {
  await organizationStore.awaitInitialLoad()
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
    displayStore.NavTitle = ''
    isLoading.value = true
    // await organizationStore.dedupFetchOrganizations()
    await getMyApps()
    isLoading.value = false
  }
})
displayStore.NavTitle = t('home')
displayStore.defaultBack = '/app/home'
</script>

<template>
  <div>
    <Dashboard v-if="apps.length > 0" :apps="apps" />
    <Steps v-else-if="!isLoading" :onboarding="true" @done="onboardingDone" />
    <div v-else class="flex flex-col items-center justify-center h-full">
      <Spinner size="w-40 h-40" />
    </div>
  </div>
</template>
