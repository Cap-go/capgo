<script setup lang="ts">
import type { Database } from '~/types/supabase.types'
import { storeToRefs } from 'pinia'
import { computed, ref, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { createSignedImageUrl } from '~/services/storage'
import { useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'
import { useOrganizationStore } from '~/stores/organization'

const route = useRoute('/apps')
const router = useRouter()
const organizationStore = useOrganizationStore()
const isLoading = ref(true)
const isTableLoading = ref(false)
const supabase = useSupabase()
const { t } = useI18n()
const displayStore = useDisplayStore()
const apps = ref<Database['public']['Tables']['apps']['Row'][]>([])
const currentPage = ref(1)
const pageSize = 10
const totalApps = ref(0)
const searchQuery = ref('')

const { currentOrganization } = storeToRefs(organizationStore)

// Check if user lacks security compliance (2FA or password) - don't load data in this case
const lacksSecurityAccess = computed(() => {
  const org = organizationStore.currentOrganization
  const lacks2FA = org?.enforcing_2fa === true && org?.['2fa_has_access'] === false
  const lacksPassword = org?.password_policy_config?.enabled && org?.password_has_access === false
  return lacks2FA || lacksPassword
})

async function getMyApps() {
  isTableLoading.value = true
  try {
    await organizationStore.awaitInitialLoad()

    // Don't fetch apps if user lacks security access - data would be rejected anyway
    if (lacksSecurityAccess.value) {
      apps.value = []
      totalApps.value = 0
      return
    }

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
      const signedApps = await Promise.all(
        data.map(async (app) => {
          return {
            ...app,
            icon_url: await createSignedImageUrl(app.icon_url),
          }
        }),
      )
      apps.value = signedApps
    }
    else {
      apps.value = []
    }
  }
  finally {
    isTableLoading.value = false
  }
}

watch(currentOrganization, async () => {
  currentPage.value = 1
  searchQuery.value = ''
  await getMyApps()
})

watchEffect(async () => {
  if (route.path === '/apps') {
    displayStore.NavTitle = ''
    isLoading.value = true
    await getMyApps()
    isLoading.value = false
  }
})
displayStore.NavTitle = t('apps')
displayStore.defaultBack = '/apps'
</script>

<template>
  <div>
    <!-- Show FailedCard when user lacks security access -->
    <div v-if="lacksSecurityAccess" class="overflow-y-auto px-0 pt-0 mx-auto mb-8 w-full h-full sm:px-6 md:pt-8 lg:px-8 max-w-9xl max-h-fit">
      <FailedCard />
    </div>
    <div v-else-if="!isLoading">
      <div class="relative overflow-hidden pb-4 h-full">
        <div class="overflow-y-auto px-0 pt-0 mx-auto mb-8 w-full h-full sm:px-6 md:pt-8 lg:px-8 max-w-9xl max-h-fit">
          <div
            v-if="totalApps === 0 && !searchQuery"
            class="p-6 mb-6 bg-white border shadow-lg md:rounded-lg dark:bg-gray-800 border-slate-300 dark:border-slate-900"
          >
            <h2 class="text-xl font-semibold text-slate-900 dark:text-slate-50">
              {{ t('start-using-capgo') }} <span class="font-prompt">Capgo</span> !
            </h2>
            <p class="mt-2 text-slate-600 dark:text-slate-200">
              {{ t('add-your-first-app-t') }}
            </p>
            <button class="mt-4 d-btn d-btn-primary" @click="router.push('/apps/new')">
              {{ t('add-app') }}
            </button>
          </div>
          <!-- App table - always visible even when payment failed -->
          <div class="flex overflow-hidden overflow-y-auto flex-col bg-white border shadow-lg md:rounded-lg dark:bg-gray-800 border-slate-300 dark:border-slate-900">
            <AppTable
              :current-page="currentPage"
              :search="searchQuery"
              :apps="apps"
              :total="totalApps"
              :delete-button="!organizationStore.currentOrganizationFailed"
              :server-side-pagination="true"
              :is-loading="isTableLoading"
              @add-app="router.push('/apps/new')"
              @update:current-page="(page) => { currentPage = page; getMyApps() }"
              @update:search="(query) => { searchQuery = query; currentPage = 1; getMyApps() }"
              @reload="getMyApps()"
              @reset="getMyApps()"
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
