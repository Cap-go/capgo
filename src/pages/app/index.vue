<script setup lang="ts">
import type { Database } from '~/types/supabase.types'
import { useDebounceFn } from '@vueuse/core'
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
const currentPage = ref(1)
const pageSize = 10
const totalApps = ref(0)
const searchQuery = ref('')

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
    totalApps.value = 0
    return
  }

  const offset = (currentPage.value - 1) * pageSize

  // Build base query
  let countQuery = supabase
    .from('apps')
    .select('*', { count: 'exact', head: true })
    .eq('owner_org', currentGid)

  let dataQuery = supabase
    .from('apps')
    .select()
    .eq('owner_org', currentGid)

  // Apply search filters if search query exists
  if (searchQuery.value) {
    const search = searchQuery.value.trim()
    // Search by name (case-insensitive) or app_id (exact match)
    countQuery = countQuery.or(`name.ilike.%${search}%,app_id.ilike.%${search}%`)
    dataQuery = dataQuery.or(`name.ilike.%${search}%,app_id.ilike.%${search}%`)
  }

  // Get total count with filters
  const { count } = await countQuery
  totalApps.value = count || 0

  // Get paginated data with filters
  const { data } = await dataQuery
    .range(offset, offset + pageSize - 1)
    .order('updated_at', { ascending: false })

  if (data && data.length) {
    apps.value = data
    stepsOpen.value = false
  }
  else {
    apps.value = []
    stepsOpen.value = totalApps.value === 0
  }
}

watch(currentOrganization, async () => {
  currentPage.value = 1
  searchQuery.value = ''
  await getMyApps()
})

watch(currentPage, async () => {
  isLoading.value = true
  await getMyApps()
  isLoading.value = false
})

// Debounced search watcher - reset to page 1 when search changes
const debouncedSearch = useDebounceFn(async () => {
  currentPage.value = 1
  isLoading.value = true
  await getMyApps()
  isLoading.value = false
}, 300)

watch(searchQuery, () => {
  debouncedSearch()
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
      <div v-else class="overflow-hidden pb-4 h-full">
        <div class="overflow-y-auto px-0 pt-0 mx-auto mb-8 w-full h-full sm:px-6 md:pt-8 lg:px-8 max-w-9xl max-h-fit">
          <div class="flex overflow-hidden overflow-y-auto flex-col bg-white border shadow-lg md:rounded-lg dark:bg-gray-800 border-slate-300 dark:border-slate-900">
            <AppTable
              v-model:current-page="currentPage"
              v-model:search="searchQuery"
              :apps="apps"
              :total="totalApps"
              :delete-button="true"
              :server-side-pagination="true"
              @add-app="stepsOpen = !stepsOpen"
            />
          </div>
        </div>
      </div>
    </div>
    <div v-else class="flex flex-col justify-center items-center h-full">
      <Spinner size="w-40 h-40" />
    </div>
  </div>
</template>
