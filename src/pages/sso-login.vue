<script setup lang="ts">
import { FormKit, FormKitMessages } from '@formkit/vue'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import iconEmail from '~icons/oui/email?raw'
import { useSSODetection } from '~/composables/useSSODetection'
import { openSupport } from '~/services/support'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const isLoading = ref(false)
const emailInput = ref('')

const { checkSSO, initiateSSO } = useSSODetection()

const version = import.meta.env.VITE_APP_VERSION

async function continueWithSSO(form: { email: string }) {
  if (!form.email || !form.email.includes('@')) {
    toast.error(t('invalid-email', 'Please enter a valid email address'))
    return
  }

  console.log('🔵 SSO Login - Starting flow for:', form.email)
  isLoading.value = true

  try {
    // Check if SSO is available for this domain
    console.log('🔵 SSO Login - Checking SSO availability...')
    const hasSSO = await checkSSO(form.email)
    console.log('🔵 SSO Login - SSO available:', hasSSO)

    if (!hasSSO) {
      console.error('❌ SSO Login - SSO not configured for this email domain')
      toast.error(t('sso-not-configured', 'SSO is not configured for this email domain. Please contact your administrator.'))
      isLoading.value = false
      return
    }

    // Initiate SSO authentication
    const redirectTo = route.query.to && typeof route.query.to === 'string'
      ? route.query.to
      : '/dashboard'

    console.log('🔵 SSO Login - Initiating SSO with redirectTo:', redirectTo)
    await initiateSSO(redirectTo, form.email)
    console.log('🔵 SSO Login - initiateSSO completed (should have redirected)')
  }
  catch (error: any) {
    console.error('❌ SSO login error:', error)
    toast.error(t('sso-login-failed', 'Failed to initiate SSO login'))
    isLoading.value = false
  }
}

function goBack() {
  router.push('/login')
}
</script>

<template>
  <section class="flex overflow-y-auto py-10 my-auto w-full h-full sm:py-8 lg:py-2">
    <div class="px-4 my-auto mx-auto max-w-7xl sm:px-6 lg:px-8">
      <div class="mx-auto max-w-2xl text-center">
        <img src="/capgo.webp" alt="logo" class="mx-auto mb-6 w-1/6 rounded-sm invert dark:invert-0">
        <h1 class="text-3xl font-bold leading-tight text-black sm:text-4xl lg:text-5xl dark:text-white">
          {{ t('sso-login-title', 'Single Sign-On') }}
        </h1>
        <p class="mx-auto mt-4 max-w-xl text-base leading-relaxed text-gray-600 dark:text-gray-300">
          {{ t('sso-login-subtitle', 'Sign in with your organization account') }}
        </p>
      </div>

      <div class="relative mx-auto mt-8 max-w-md md:mt-4">
        <div class="overflow-hidden bg-white rounded-md shadow-md dark:bg-slate-800">
          <div class="py-6 px-4 text-gray-500 sm:py-7 sm:px-8">
            <FormKit id="sso-login-form" type="form" :actions="false" @submit="continueWithSSO">
              <div class="space-y-5">
                <FormKit
                  v-model="emailInput"
                  type="email"
                  name="email"
                  :disabled="isLoading"
                  enterkeyhint="send"
                  :placeholder="t('email')"
                  :prefix-icon="iconEmail"
                  inputmode="email"
                  :label="t('work-email', 'Work Email')"
                  autocomplete="email"
                  validation="required:trim|email"
                  data-test="sso-email"
                />

                <FormKitMessages data-test="form-error" />

                <!-- Continue Button -->
                <div>
                  <button
                    type="submit"
                    data-test="sso-continue"
                    :disabled="isLoading"
                    class="inline-flex justify-center items-center gap-3 py-4 px-4 w-full text-base font-semibold text-white rounded-md transition-all duration-200 bg-muted-blue-700 hover:bg-blue-700 focus:bg-blue-700 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg v-if="isLoading" class="w-5 h-5 text-white animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    {{ t('continue', 'Continue') }}
                  </button>
                </div>

                <!-- Info Box -->
                <div class="p-4 border rounded-lg bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
                  <div class="flex items-start gap-3">
                    <svg class="flex-shrink-0 mt-0.5 w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div class="flex-1">
                      <p class="text-sm text-blue-800 dark:text-blue-300">
                        {{ t('sso-info', 'You will be redirected to your organization\'s login page to authenticate.') }}
                      </p>
                    </div>
                  </div>
                </div>

                <div class="text-center">
                  <button
                    type="button"
                    class="text-sm font-medium text-orange-500 transition-all duration-200 hover:text-orange-600 hover:underline focus:text-orange-600"
                    @click="goBack"
                  >
                    {{ t('back-to-login', 'Back to login') }}
                  </button>
                  <p class="pt-2 text-gray-300">
                    {{ version }}
                  </p>
                </div>
              </div>
            </FormKit>
          </div>
        </div>
        <section class="flex flex-col items-center mt-6">
          <div class="mx-auto">
            <LangSelector />
          </div>
          <button class="p-2 mt-3 text-gray-500 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600" @click="openSupport">
            {{ t("support") }}
          </button>
        </section>
      </div>
    </div>
  </section>
</template>

<route lang="yaml">
meta:
  layout: naked
</route>
