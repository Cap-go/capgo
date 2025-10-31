<script setup lang="ts">
import type { Database } from '~/types/supabase.types'
import { storeToRefs } from 'pinia'
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'
import { useOrganizationStore } from '~/stores/organization'

const route = useRoute('/dashboard')
const organizationStore = useOrganizationStore()
const isLoading = ref(true)
const stepsOpen = ref(false)
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

onMounted(async () => {
  if (route.path === '/dashboard') {
    displayStore.NavTitle = ''
    isLoading.value = true
    await getMyApps()
    isLoading.value = false
  }
})
displayStore.NavTitle = t('dashboard')
displayStore.defaultBack = '/app'
</script>

<template>
  <div>
    <div class="h-full pb-4 overflow-hidden">
      <div class="w-full h-full px-4 pt-2 md:pt-8 mx-auto mb-8 overflow-y-auto max-w-9xl max-h-fit lg:px-8 sm:px-6">
        <WelcomeBanner v-if="apps.length === 0" />
        <FailedCard />
        <Usage v-if="!organizationStore.currentOrganizationFailed" />
      </div>
    </div>
  </div>
</template>
