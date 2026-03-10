<script setup lang="ts">
import type { Session } from '@supabase/supabase-js'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import IconLoader from '~icons/lucide/loader-2'
import { useSSOProvisioning } from '~/composables/useSSOProvisioning'
import { useSupabase } from '~/services/supabase'

const route = useRoute()
const router = useRouter()
const supabase = useSupabase()
const isLoading = ref(true)
const errorMessage = ref('')
const { provisionUser } = useSSOProvisioning()

function validateRedirectPath(path: string | undefined): string {
  // Default fallback
  if (!path) {
    return '/dashboard'
  }

  // Only allow relative paths starting with / but not //
  if (!path.startsWith('/') || path.startsWith('//')) {
    return '/dashboard'
  }

  // Reject paths containing scheme-like patterns (http:, https:, javascript:, etc.)
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) {
    return '/dashboard'
  }

  return path
}

function getSsoCallbackParams() {
  const hashParams = new URLSearchParams(globalThis.location.hash.replace('#', ''))
  const queryParams = new URLSearchParams(globalThis.location.search)

  return {
    accessToken: hashParams.get('access_token') ?? queryParams.get('access_token') ?? '',
    refreshToken: hashParams.get('refresh_token') ?? queryParams.get('refresh_token') ?? '',
    code: queryParams.get('code') ?? hashParams.get('code') ?? '',
    error: queryParams.get('error') ?? hashParams.get('error') ?? '',
    errorDescription: queryParams.get('error_description') ?? hashParams.get('error_description') ?? '',
  }
}

function clearAuthParamsFromUrl() {
  const parsedUrl = new URL(globalThis.location.href)
  const hashParams = new URLSearchParams(parsedUrl.hash.replace('#', ''))

  parsedUrl.searchParams.delete('access_token')
  parsedUrl.searchParams.delete('refresh_token')
  hashParams.delete('access_token')
  hashParams.delete('refresh_token')

  const nextHash = hashParams.toString()
  parsedUrl.hash = nextHash ? `#${nextHash}` : ''

  globalThis.history.replaceState({}, '', parsedUrl.toString())
}

async function completeSsoLogin() {
  const { accessToken, refreshToken, code, error, errorDescription } = getSsoCallbackParams()
  clearAuthParamsFromUrl()

  if (error) {
    isLoading.value = false
    errorMessage.value = errorDescription || error
    toast.error(errorMessage.value)
    return
  }

  try {
    let session: Session | null = null

    if (accessToken && refreshToken) {
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })

      if (error) {
        isLoading.value = false
        errorMessage.value = error.message || 'Failed to authenticate with SSO'
        toast.error(errorMessage.value)
        return
      }

      session = data.session
    }
    else if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)

      if (error) {
        isLoading.value = false
        errorMessage.value = error.message || 'Failed to authenticate with SSO'
        toast.error(errorMessage.value)
        return
      }

      session = data.session
    }
    else {
      isLoading.value = false
      errorMessage.value = 'No authentication data found'
      return
    }

    if (session) {
      await provisionUser(session)
    }

    // Validate redirect path to prevent open redirect
    const redirectTo = route.query.to as string | undefined
    const validatedPath = validateRedirectPath(redirectTo)
    router.replace(validatedPath)
  }
  catch (err) {
    isLoading.value = false
    errorMessage.value = err instanceof Error ? err.message : 'An unexpected error occurred'
    toast.error(errorMessage.value)
  }
}

onMounted(completeSsoLogin)
</script>

<template>
  <div class="flex flex-col justify-center items-center p-4 min-h-screen bg-gray-50 dark:bg-slate-900">
    <div class="p-8 space-y-6 w-full max-w-md bg-white rounded-lg shadow-lg dark:bg-slate-800">
      <div class="text-center">
        <img src="/capgo.webp" alt="logo" class="mx-auto mb-4 w-16 rounded-sm invert dark:invert-0">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
          SSO Authentication
        </h1>

        <div v-if="isLoading" class="mt-6 space-y-4">
          <div class="flex justify-center">
            <IconLoader class="w-10 h-10 text-blue-500 animate-spin" />
          </div>
          <p class="text-gray-700 dark:text-gray-300">
            Completing sign in...
          </p>
        </div>

        <div v-else class="mt-6 space-y-4">
          <p class="font-medium text-red-600">
            {{ errorMessage }}
          </p>
          <p class="text-gray-700 dark:text-gray-300">
            Please try again or contact your administrator.
          </p>
          <router-link
            to="/login"
            class="inline-flex justify-center items-center py-3 px-6 text-base font-semibold text-white rounded-md transition-all duration-200 hover:bg-blue-700 focus:bg-blue-700 bg-muted-blue-700 focus:outline-hidden"
          >
            Back to Login
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: naked
</route>
