<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import DemoOnboardingModal from '~/components/dashboard/DemoOnboardingModal.vue'

const route = useRoute()
const router = useRouter()
const isMobileView = ref(false)
const forceOnboardingQueryParam = 'show-onboarding-demo'

function updateMobileView() {
  if (typeof window === 'undefined')
    return

  isMobileView.value = window.innerWidth < 768
}

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

  return shouldForceShowDemoOnboarding.value
})

function dismissDemoOnboarding() {
  if (route.query[forceOnboardingQueryParam] === '1')
    router.replace({ query: { ...route.query, [forceOnboardingQueryParam]: undefined } })
}

onMounted(() => {
  updateMobileView()
  window.addEventListener('resize', updateMobileView)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateMobileView)
})
</script>

<template>
  <DemoOnboardingModal :open="shouldShowDemoOnNoApps" @close="dismissDemoOnboarding" />
</template>
