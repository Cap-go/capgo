<script setup lang="ts">
import type { Database } from '~/types/supabase.types'
import { storeToRefs } from 'pinia'
import { computed, ref, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'
import { useOrganizationStore } from '~/stores/organization'

const route = useRoute('/app/')
const router = useRouter()
const organizationStore = useOrganizationStore()
const isLoading = ref(true)
const isTableLoading = ref(false)
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

// Check if user lacks security compliance (2FA or password) - don't load data in this case
const lacksSecurityAccess = computed(() => {
  const org = organizationStore.currentOrganization
  const lacks2FA = org?.enforcing_2fa === true && org?.['2fa_has_access'] === false
  const lacksPassword = org?.password_policy_config?.enabled && org?.password_has_access === false
  return lacks2FA || lacksPassword
})

// Payment failed state (subscription required)
const paymentFailed = computed(() => {
  return organizationStore.currentOrganizationFailed && !lacksSecurityAccess.value
})

// Demo apps for showing behind blur when payment fails
const demoApps = [
  {
    app_id: 'com.demo.production',
    name: 'Production App',
    icon_url: '',
    last_version: '2.1.0',
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    owner_org: '',
  },
  {
    app_id: 'com.demo.staging',
    name: 'Staging App',
    icon_url: '',
    last_version: '2.2.0-beta',
    updated_at: new Date(Date.now() - 86400000).toISOString(),
    created_at: new Date().toISOString(),
    owner_org: '',
  },
  {
    app_id: 'com.demo.beta',
    name: 'Beta App',
    icon_url: '',
    last_version: '3.0.0-alpha',
    updated_at: new Date(Date.now() - 172800000).toISOString(),
    created_at: new Date().toISOString(),
    owner_org: '',
  },
] as Database['public']['Tables']['apps']['Row'][]

// Apps to display - use demo apps when payment failed
const displayApps = computed(() => paymentFailed.value ? demoApps : apps.value)
const displayTotal = computed(() => paymentFailed.value ? demoApps.length : totalApps.value)

async function NextStep(appId: string) {
  console.log('Navigating to app with ID:', appId)
  router.push(`/app/${appId}`)
}
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
      apps.value = data
      stepsOpen.value = false
    }
    else {
      apps.value = []
      stepsOpen.value = totalApps.value === 0
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
    <!-- Show FailedCard when user lacks security access -->
    <div v-if="lacksSecurityAccess" class="overflow-y-auto px-0 pt-0 mx-auto mb-8 w-full h-full sm:px-6 md:pt-8 lg:px-8 max-w-9xl max-h-fit">
      <FailedCard />
    </div>
    <div v-else-if="!isLoading">
      <!-- Show onboarding steps when no apps and no payment issue -->
      <StepsApp v-if="stepsOpen && !paymentFailed" :onboarding="!apps.length" @done="NextStep" @close-step="stepsOpen = !stepsOpen" />
      <div v-else class="relative overflow-hidden pb-4 h-full">
        <div class="overflow-y-auto px-0 pt-0 mx-auto mb-8 w-full h-full sm:px-6 md:pt-8 lg:px-8 max-w-9xl max-h-fit">
          <!-- App table - blurred when payment failed -->
          <div
            :class="{ 'blur-sm pointer-events-none select-none': paymentFailed }"
            class="flex overflow-hidden overflow-y-auto flex-col bg-white border shadow-lg md:rounded-lg dark:bg-gray-800 border-slate-300 dark:border-slate-900"
          >
            <AppTable
              v-model:current-page="currentPage"
              v-model:search="searchQuery"
              :apps="displayApps"
              :total="displayTotal"
              :delete-button="!paymentFailed"
              :server-side-pagination="!paymentFailed"
              :is-loading="isTableLoading && !paymentFailed"
              @add-app="stepsOpen = !stepsOpen"
              @reload="getMyApps()"
              @reset="getMyApps()"
            />
          </div>
        </div>

        <!-- Payment required overlay -->
        <PaymentRequiredModal v-if="paymentFailed" />
      </div>
    </div>
    <div v-else class="flex flex-col justify-center items-center h-full">
      <Spinner size="w-40 h-40" />
    </div>
  </div>
</template>
