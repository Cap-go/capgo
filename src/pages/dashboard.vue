<script setup lang="ts">
import type { Database } from '~/types/supabase.types'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'
import { useOrganizationStore } from '~/stores/organization'

const route = useRoute('/dashboard')
const organizationStore = useOrganizationStore()
const isLoading = ref(true)
const supabase = useSupabase()
const { t } = useI18n()
const displayStore = useDisplayStore()
const apps = ref<Database['public']['Tables']['apps']['Row'][]>([])

const { currentOrganization } = storeToRefs(organizationStore)

// Check if user lacks security compliance (2FA or password) - don't load data in this case
const lacksSecurityAccess = computed(() => {
  const org = organizationStore.currentOrganization
  const lacks2FA = org?.enforcing_2fa === true && org?.['2fa_has_access'] === false
  const lacksPassword = org?.password_policy_config?.enabled && org?.password_has_access === false
  return lacks2FA || lacksPassword
})

const hasNoApps = computed(() => apps.value.length === 0 && !isLoading.value)

async function getMyApps() {
  await organizationStore.awaitInitialLoad()

  // Don't fetch apps if user lacks security access - data would be rejected anyway
  if (lacksSecurityAccess.value) {
    apps.value = []
    return
  }

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

  apps.value = data ?? []
}

watch(currentOrganization, async () => {
  await getMyApps()
})

onMounted(async () => {
  if (route.path === '/dashboard') {
    isLoading.value = true
    await getMyApps()
    isLoading.value = false
    displayStore.NavTitle = t('dashboard')
  }
})
displayStore.NavTitle = t('dashboard')
displayStore.defaultBack = '/app'
</script>

<template>
  <div>
    <div class="overflow-hidden pb-4 h-full">
      <div class="relative overflow-y-auto px-4 pt-2 mx-auto mb-8 w-full h-full sm:px-6 md:pt-8 lg:px-8 max-w-9xl max-h-fit">
        <FailedCard />
        <div :class="{ 'blur-sm pointer-events-none select-none': hasNoApps }">
          <Usage v-if="!organizationStore.currentOrganizationFailed && !lacksSecurityAccess" />
        </div>
        <!-- Overlay for empty state -->
        <div
          v-if="hasNoApps && !lacksSecurityAccess"
          class="flex absolute inset-0 z-10 flex-col justify-center items-center bg-white/60 dark:bg-gray-900/60"
        >
          <div class="p-8 text-center bg-white rounded-xl border shadow-lg dark:bg-gray-800 dark:border-gray-700">
            <h2 class="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
              {{ t('no-apps-yet') }}
            </h2>
            <p class="mb-6 text-gray-600 dark:text-gray-400">
              {{ t('add-your-first-app-to-see-dashboard') }}
            </p>
            <router-link
              to="/app"
              class="inline-flex gap-2 items-center px-6 py-3 text-white bg-blue-600 rounded-lg transition-colors hover:bg-blue-700"
            >
              <span class="i-heroicons-plus-circle text-xl" />
              {{ t('add-app') }}
            </router-link>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
