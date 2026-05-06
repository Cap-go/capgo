<script setup lang="ts">
import type { Database } from '~/types/supabase.types'
import { storeToRefs } from 'pinia'
import { computed, ref, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { createSignedImageUrl, resolveImagePath } from '~/services/storage'
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
type AppRow = Database['public']['Tables']['apps']['Row']
const apps = ref<AppRow[]>([])
const currentPage = ref(1)
const pageSize = 10
const totalApps = ref(0)
const searchQuery = ref('')
const { currentOrganization } = storeToRefs(organizationStore)
let appIconLoadRun = 0

// Check if user lacks security compliance (2FA or password) - don't load data in this case
const lacksSecurityAccess = computed(() => {
  const org = organizationStore.currentOrganization
  const lacks2FA = org?.enforcing_2fa === true && org?.['2fa_has_access'] === false
  const lacksPassword = org?.password_policy_config?.enabled && org?.password_has_access === false
  return lacks2FA || lacksPassword
})

function appWithImmediateIcon(app: AppRow) {
  const { normalized, shouldSign } = resolveImagePath(app.icon_url)
  return {
    ...app,
    icon_url: shouldSign ? '' : normalized,
  }
}

async function loadAppIcons(sourceApps: AppRow[], runId: number) {
  const signedIcons = (await Promise.all(sourceApps.map(async (app) => {
    const { shouldSign } = resolveImagePath(app.icon_url)
    if (!shouldSign)
      return null

    try {
      const signedIcon = await createSignedImageUrl(app.icon_url)
      return signedIcon ? { appId: app.app_id, signedIcon } : null
    }
    catch (error) {
      console.warn('Cannot load signed app icon', { appId: app.app_id, error })
      return null
    }
  })))
    .filter((entry): entry is { appId: string, signedIcon: string } => !!entry)

  if (appIconLoadRun !== runId || signedIcons.length === 0)
    return

  const iconByAppId = new Map<string, string>(signedIcons.map(({ appId, signedIcon }) => [appId, signedIcon]))
  let hasIconUpdate = false
  for (const app of apps.value) {
    const signedIcon = iconByAppId.get(app.app_id)
    if (signedIcon) {
      app.icon_url = signedIcon
      hasIconUpdate = true
    }
  }
  if (hasIconUpdate)
    apps.value = Array.from(apps.value)
}

async function getMyApps() {
  const currentRun = ++appIconLoadRun
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

    apps.value = data?.map(appWithImmediateIcon) ?? []
    if (data?.length)
      void loadAppIcons(data, currentRun)
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
    <div v-if="lacksSecurityAccess" class="w-full h-full px-0 pt-0 mx-auto mb-8 overflow-y-auto sm:px-6 md:pt-8 lg:px-8 max-w-9xl max-h-fit">
      <FailedCard />
    </div>
    <div v-else-if="!isLoading">
      <div class="relative h-full pb-4 overflow-hidden">
        <div class="w-full h-full px-0 pt-0 mx-auto mb-8 overflow-y-auto sm:px-6 md:pt-8 lg:px-8 max-w-9xl max-h-fit">
          <div
            v-if="totalApps === 0 && !searchQuery"
            class="relative p-8 mb-6 overflow-hidden bg-white border shadow-lg rounded-2xl border-violet-200/70 dark:border-slate-900 dark:bg-gray-900"
          >
            <span class="inline-flex rounded-full bg-violet-50 px-3 py-1 text-[11px] font-semibold tracking-[0.08em] text-violet-700 dark:bg-violet-900/30 dark:text-violet-200 dark:border-violet-800">
              {{ t('get-started') }}
            </span>
            <h2 class="mt-4 text-2xl font-semibold md:text-3xl text-slate-900 dark:text-slate-50">
              {{ t('start-using-capgo') }} <span class="font-prompt">Capgo</span> !
            </h2>
            <p class="max-w-2xl mt-3 text-slate-700 dark:text-slate-200">
              {{ t('add-your-first-app-t') }}
            </p>
            <div class="flex flex-col gap-3 mt-5 sm:flex-row sm:items-center">
              <button class="d-btn d-btn-primary" @click="router.push('/app/new')">
                {{ t('start-onboarding') }}
              </button>
            </div>
          </div>
          <!-- App table - always visible even when payment failed -->
          <div class="flex flex-col overflow-hidden overflow-y-auto bg-white border shadow-lg md:rounded-lg dark:bg-gray-800 border-slate-300 dark:border-slate-900">
            <AppTable
              :current-page="currentPage"
              :search="searchQuery"
              :apps="apps"
              :total="totalApps"
              :delete-button="!organizationStore.currentOrganizationFailed"
              :server-side-pagination="true"
              :is-loading="isTableLoading"
              @add-app="router.push('/app/new')"
              @update:current-page="(page) => { currentPage = page; getMyApps() }"
              @update:search="(query) => { searchQuery = query; currentPage = 1; getMyApps() }"
              @reload="getMyApps()"
              @reset="getMyApps()"
            />
          </div>
        </div>
      </div>
    </div>
    <div v-else class="flex flex-col items-center justify-center h-full">
      <Spinner size="w-40 h-40" />
    </div>
  </div>
</template>
