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
const stepsOpen = ref(false)
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
      <div class="overflow-y-auto px-4 pt-2 mx-auto mb-8 w-full h-full sm:px-6 md:pt-8 lg:px-8 max-w-9xl max-h-fit">
        <WelcomeBanner v-if="apps.length === 0 && !lacksSecurityAccess" />
        <FailedCard />
        <Usage v-if="!organizationStore.currentOrganizationFailed && !lacksSecurityAccess" />
      </div>
    </div>
  </div>
</template>
