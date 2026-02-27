<script setup lang="ts">
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

async function exchangeCode() {
  const code = route.query.code as string | undefined

  if (!code) {
    isLoading.value = false
    errorMessage.value = 'No authentication code found'
    return
  }

  try {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      isLoading.value = false
      errorMessage.value = error.message || 'Failed to authenticate with SSO'
      toast.error(errorMessage.value)
      return
    }

    // Auto-provision user on first SSO login
    if (data.session) {
      await provisionUser(data.session)
    }

    const redirectTo = route.query.to as string | undefined
    router.replace(redirectTo || '/dashboard')
  }
  catch (err) {
    isLoading.value = false
    errorMessage.value = err instanceof Error ? err.message : 'An unexpected error occurred'
    toast.error(errorMessage.value)
  }
}

onMounted(exchangeCode)
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
