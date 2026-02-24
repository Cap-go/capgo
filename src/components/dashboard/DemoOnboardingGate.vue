<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import DemoOnboardingModal from '~/components/dashboard/DemoOnboardingModal.vue'
import { useSupabase } from '~/services/supabase'
import { useOrganizationStore } from '~/stores/organization'

const route = useRoute()
const router = useRouter()
const organizationStore = useOrganizationStore()
const supabase = useSupabase()
const { currentOrganization } = storeToRefs(organizationStore)
const appsCount = ref<number | null>(null)
const hasCheckedAppsCount = ref(false)
const isDemoOnboardingClosed = ref(false)
const shouldShowDemoOnboarding = ref(false)
const isMobileView = ref(false)
const forceOnboardingQueryParam = 'show-onboarding-demo'

function updateMobileView() {
  if (typeof window === 'undefined')
    return

  isMobileView.value = window.innerWidth < 768
}

const lacksSecurityAccess = computed(() => {
  const org = organizationStore.currentOrganization
  const lacks2FA = org?.enforcing_2fa === true && org?.['2fa_has_access'] === false
  const lacksPassword = org?.password_policy_config?.enabled && org?.password_has_access === false
  return lacks2FA || lacksPassword
})

const paymentFailed = computed(() => {
  return organizationStore.currentOrganizationFailed && !lacksSecurityAccess.value
})

const hasNoApps = computed(() => {
  return hasCheckedAppsCount.value && (appsCount.value ?? 0) === 0 && !lacksSecurityAccess.value && !paymentFailed.value
})

const shouldForceShowDemoOnboarding = computed(() => {
  return route.query[forceOnboardingQueryParam] === '1'
})

const shouldShowDemoOnNoApps = computed(() => {
  if (isMobileView.value)
    return false

  const path = route.path
  if (path.startsWith('/admin'))
    return false

  if (path === '/login' || path === '/register' || path === '/forgot_password' || path === '/resend_email' || path === '/onboarding' || path === '/scan')
    return false

  if (shouldForceShowDemoOnboarding.value)
    return true

  return shouldShowDemoOnboarding.value && !isDemoOnboardingClosed.value
})

function updateDemoOnboardingState() {
  shouldShowDemoOnboarding.value = hasNoApps.value
}

function dismissDemoOnboarding() {
  isDemoOnboardingClosed.value = true
  if (route.query[forceOnboardingQueryParam] === '1')
    router.replace({ query: { ...route.query, [forceOnboardingQueryParam]: undefined } })
}

async function fetchAppsCount() {
  if (lacksSecurityAccess.value) {
    appsCount.value = 0
    hasCheckedAppsCount.value = true
    shouldShowDemoOnboarding.value = false
    return
  }

  const orgId = currentOrganization.value?.gid
  if (!orgId) {
    hasCheckedAppsCount.value = false
    return
  }

  hasCheckedAppsCount.value = false

  const { count, error } = await supabase
    .from('apps')
    .select('id', { count: 'exact', head: true })
    .eq('owner_org', orgId)

  if (error) {
    console.error('Failed to fetch app count for no-app onboarding modal:', error)
    appsCount.value = 0
    hasCheckedAppsCount.value = true
    shouldShowDemoOnboarding.value = true
    return
  }

  appsCount.value = count ?? 0
  hasCheckedAppsCount.value = true
  shouldShowDemoOnboarding.value = (appsCount.value ?? 0) === 0 && !paymentFailed.value
}

async function initDemoOnboarding() {
  await organizationStore.awaitInitialLoad()
  updateDemoOnboardingState()
  await fetchAppsCount()
}

watch(currentOrganization, async () => {
  await initDemoOnboarding()
})

onMounted(() => {
  updateMobileView()
  window.addEventListener('resize', updateMobileView)
  initDemoOnboarding()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateMobileView)
})
</script>

<template>
  <DemoOnboardingModal :open="shouldShowDemoOnNoApps" @close="dismissDemoOnboarding" />
</template>
