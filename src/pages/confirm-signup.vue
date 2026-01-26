<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import IconLoader from '~icons/lucide/loader-2'

const route = useRoute()
const isRedirecting = ref(true)
const error = ref('')

// Get the allowed hostname from VITE_APP_URL
const allowedHost = (() => {
  try {
    return new URL(import.meta.env.VITE_APP_URL).hostname
  }
  catch {
    return ''
  }
})()

function isAllowedConfirmationUrl(urlValue: string) {
  const url = new URL(urlValue, window.location.origin)

  // Allow localhost in dev mode
  if (import.meta.env.DEV) {
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1')
      return true
  }

  // Only allow https
  if (url.protocol !== 'https:')
    return false

  // Only allow the exact hostname from VITE_APP_URL
  return url.hostname === allowedHost
}
onMounted(() => {
  const confirmationUrl = route.query.confirmation_url as string

  if (!confirmationUrl) {
    isRedirecting.value = false
    error.value = 'Invalid confirmation URL. Please check your email link.'
    return
  }

  try {
    // Decode the URL if needed and redirect immediately
    const decodedUrl = decodeURIComponent(confirmationUrl)
    if (!isAllowedConfirmationUrl(decodedUrl)) {
      isRedirecting.value = false
      error.value = 'Invalid confirmation URL. Please check your email link.'
      return
    }
    window.location.href = decodedUrl
  }
  catch {
    isRedirecting.value = false
    error.value = 'Error redirecting to confirmation page. Please try again.'
  }
})
</script>

<template>
  <div class="flex flex-col justify-center items-center p-4 min-h-screen bg-gray-50">
    <div class="p-8 space-y-6 w-full max-w-md bg-white rounded-lg shadow-lg">
      <div class="text-center">
        <h1 class="text-2xl font-bold text-gray-900">
          Email Confirmation
        </h1>

        <div v-if="isRedirecting" class="mt-6 space-y-4">
          <div class="flex justify-center">
            <IconLoader class="w-10 h-10 text-blue-500 animate-spin" />
          </div>
          <p class="text-gray-700">
            Redirecting to confirmation page...
          </p>
          <p class="text-sm text-gray-500">
            Please wait while we redirect you to confirm your email address.
          </p>
        </div>

        <div v-else class="mt-6 space-y-4">
          <p class="font-medium text-red-600">
            {{ error }}
          </p>
          <p class="text-gray-700">
            If you continue to have trouble, please contact support.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
