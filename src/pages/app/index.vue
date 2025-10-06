<script setup lang="ts">
import type { Database } from '~/types/supabase.types'
import { storeToRefs } from 'pinia'
import { ref, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'
import { useOrganizationStore } from '~/stores/organization'

const route = useRoute('/app/')
const router = useRouter()
const organizationStore = useOrganizationStore()
const isLoading = ref(true)
const stepsOpen = ref(false)
const supabase = useSupabase()
const { t } = useI18n()
const displayStore = useDisplayStore()
const apps = ref<Database['public']['Tables']['apps']['Row'][]>([])

const { currentOrganization } = storeToRefs(organizationStore)

async function NextStep(appId: string) {
  console.log('Navigating to app with ID:', appId)
  router.push(`/app/p/${appId}`)
}
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

  if (data && data.length) {
    apps.value = data
    stepsOpen.value = false
  }
  else {
    apps.value = []
    stepsOpen.value = true
  }
}

watch(currentOrganization, async () => {
  await getMyApps()
})

watchEffect(async () => {
  if (route.path === '/app') {
    displayStore.NavTitle = ''
    isLoading.value = true
    await getMyApps()
    isLoading.value = false
  }
})
displayStore.NavTitle = t('apps')
displayStore.defaultBack = '/app'
</script>

<template>
  <div>
    <div v-if="!isLoading">
      <StepsApp v-if="stepsOpen" :onboarding="!apps.length" @done="NextStep" @close-step="stepsOpen = !stepsOpen" />
      <div v-else class="h-full pb-4 overflow-hidden">
        <div class="w-full h-full px-0 pt-0 md:pt-8 mx-auto mb-8 overflow-y-auto max-w-9xl max-h-fit sm:px-6 lg:px-8">
          <div class="flex flex-col overflow-hidden overflow-y-auto bg-white border border-slate-300 shadow-lg md:rounded-lg dark:border-slate-900 dark:bg-gray-800">
            <AppTable :apps="apps" :delete-button="true" @add-app="stepsOpen = !stepsOpen" />
          </div>
        </div>
      </div>
    </div>
    <div v-else class="flex flex-col items-center justify-center h-full">
      <Spinner size="w-40 h-40" />
    </div>
  </div>
</template>
