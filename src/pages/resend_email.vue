<!-- eslint-disable unused-imports/no-unused-vars -->
<script setup lang="ts">
import { setErrors } from '@formkit/core'
import { FormKit, FormKitMessages } from '@formkit/vue'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import iconEmail from '~icons/oui/email?raw'
import { getRecentEmailOtpVerification, sendEmailOtpVerification, verifyEmailOtp } from '~/services/emailOtp'
import { useSupabase } from '~/services/supabase'
import { useMainStore } from '~/stores/main'

const { t } = useI18n()
const supabase = useSupabase()
const route = useRoute()
const router = useRouter()
const main = useMainStore()
const isLoading = ref(false)
const isLoadingMain = ref(false)
const otpSending = ref(false)
const otpVerificationCode = ref('')
const otpVerificationLoading = ref(false)
const currentUserId = ref('')
const currentUserEmail = ref('')
const emailVerificationBlockingReason = computed(() => route.query.reason === 'email_not_verified')
const returnTo = computed(() => (typeof route.query.return_to === 'string' ? route.query.return_to : ''))
const usesEmailOtpFlow = computed(() => emailVerificationBlockingReason.value && !!currentUserId.value && !!currentUserEmail.value)

async function submit(form: { email: string, password: string }) {
  isLoading.value = true
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: form.email,
  })
  isLoading.value = false
  if (error)
    setErrors('resend-email', [error.message], {})
  else toast.success(t('confirm-email-sent'))
}

async function loadDeleteEmailVerificationState() {
  if (!emailVerificationBlockingReason.value)
    return

  isLoadingMain.value = true
  try {
    await main.awaitInitialLoad()
    const { data: sessionData } = await supabase.auth.getSession()
    currentUserId.value = sessionData.session?.user.id ?? main.auth?.id ?? ''
    currentUserEmail.value = sessionData.session?.user.email ?? main.auth?.email ?? main.user?.email ?? ''

    if (!currentUserId.value)
      return

    const { isVerified } = await getRecentEmailOtpVerification(supabase, currentUserId.value)
    if (isVerified)
      await router.replace(returnTo.value || '/settings/account')
  }
  catch (error) {
    console.error('Cannot load email verification state', error)
  }
  finally {
    isLoadingMain.value = false
  }
}

async function sendOtpCode() {
  if (!currentUserEmail.value || otpSending.value)
    return

  otpSending.value = true
  const { error } = await sendEmailOtpVerification(supabase, currentUserEmail.value)
  otpSending.value = false

  if (error) {
    toast.error(t('verification-failed'))
    console.error('Cannot send email OTP', error)
    return
  }

  toast.success(t('email-otp-sent'))
}

async function verifyOtpCode() {
  const token = otpVerificationCode.value.replaceAll(' ', '')
  if (!token) {
    toast.error(t('email-otp-code-required'))
    return
  }
  if (otpVerificationLoading.value)
    return

  otpVerificationLoading.value = true
  const { data, error } = await verifyEmailOtp(supabase, token)
  otpVerificationLoading.value = false

  if (error || !data?.verified_at) {
    toast.error(t('verification-failed'))
    console.error('Cannot verify email OTP', error)
    return
  }

  await router.replace(returnTo.value || '/settings/account')
}

onMounted(async () => {
  await loadDeleteEmailVerificationState()
})
</script>

<template>
  <section v-if="isLoadingMain" class="flex justify-center">
    <Spinner size="w-40 h-40" class="my-auto" />
  </section>
  <div v-else>
    <section class="flex overflow-y-auto py-10 my-auto w-full h-full sm:py-8 lg:py-2">
      <div class="px-4 my-auto mx-auto max-w-7xl sm:px-6 lg:px-8">
        <div class="mx-auto max-w-2xl text-center">
          <img src="/capgo.webp" alt="logo" class="mx-auto mb-6 w-1/6 rounded-sm invert dark:invert-0">
          <h1 class="text-3xl font-bold leading-tight text-black sm:text-4xl lg:text-5xl dark:text-white">
            {{ t('resend-email') }}
          </h1>
        </div>

        <div class="relative mx-auto mt-8 max-w-md md:mt-4">
          <div class="overflow-hidden bg-white rounded-md shadow-md dark:bg-slate-800">
            <div class="py-6 px-4 sm:py-7 sm:px-8">
              <div v-if="emailVerificationBlockingReason" class="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100">
                <p class="mb-1">
                  {{ t('email-not-verified-banner-title') }}
                </p>
                <p class="text-xs leading-5">
                  {{ t('email-not-verified-banner-body') }}
                </p>
                <p v-if="returnTo" class="mt-2 text-xs font-medium">
                  {{ t('attempted-destination') }} {{ returnTo }}
                </p>
              </div>

              <div v-if="usesEmailOtpFlow" class="space-y-5 text-gray-500">
                <div class="rounded-md border border-slate-200 px-4 py-3 text-sm dark:border-slate-700">
                  <p class="mb-1 font-medium text-gray-700 dark:text-gray-100">
                    {{ currentUserEmail }}
                  </p>
                  <p class="text-xs leading-5">
                    {{ t('email-otp-code-required') }}
                  </p>
                </div>

                <button
                  type="button"
                  class="inline-flex justify-center items-center py-4 px-4 w-full text-base font-semibold text-white rounded-md border border-transparent transition-all duration-200 hover:bg-blue-700 focus:bg-blue-700 bg-muted-blue-700 focus:outline-hidden disabled:opacity-60"
                  :disabled="otpSending || otpVerificationLoading"
                  @click="sendOtpCode"
                >
                  <svg v-if="otpSending" class="inline-block mr-3 -ml-1 w-5 h-5 text-gray-100 align-middle animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span v-else>{{ t('email-otp-send-code') }}</span>
                </button>

                <FormKit
                  v-model="otpVerificationCode"
                  type="text"
                  name="email_otp"
                  :label="t('email-otp-code-required')"
                  inputmode="numeric"
                  autocomplete="one-time-code"
                  validation="required:trim|length:6"
                />

                <button
                  type="button"
                  class="inline-flex justify-center items-center py-4 px-4 w-full text-base font-semibold text-white rounded-md border border-transparent transition-all duration-200 hover:bg-blue-700 focus:bg-blue-700 bg-muted-blue-700 focus:outline-hidden disabled:opacity-60"
                  :disabled="otpVerificationLoading || otpSending"
                  @click="verifyOtpCode"
                >
                  <svg v-if="otpVerificationLoading" class="inline-block mr-3 -ml-1 w-5 h-5 text-gray-100 align-middle animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span v-else>{{ t('validate-email') }}</span>
                </button>
              </div>

              <FormKit v-else id="resend-email" type="form" :actions="false" @submit="submit">
                <div class="space-y-5 text-gray-500">
                  <FormKit
                    type="email"
                    name="email"
                    :label="t('email')"
                    :disabled="isLoading"
                    :prefix-icon="iconEmail"
                    inputmode="email"
                    autocomplete="email"
                    validation="required:trim"
                  />

                  <FormKitMessages />

                  <div>
                    <button type="submit" class="inline-flex justify-center items-center w-full">
                      <svg v-if="isLoading" class="inline-block mr-3 -ml-1 w-5 h-5 text-gray-900 align-middle animate-spin dark:text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle
                          class="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          stroke-width="4"
                        />
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <div v-if="!isLoading" class="inline-flex justify-center items-center py-4 px-4 w-full text-base font-semibold text-white rounded-md border border-transparent transition-all duration-200 hover:bg-blue-700 focus:bg-blue-700 bg-muted-blue-700 focus:outline-hidden">
                        Submit
                      </div>
                    </button>
                  </div>
                </div>
              </FormKit>
              <div class="flex flex-row justify-center mt-5 w-full">
                <router-link to="/login" class="text-sm font-medium text-orange-500 transition-all duration-200 hover:text-orange-600 hover:underline focus:text-orange-600">
                  {{ t('back-to-login-page') }}
                </router-link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<route lang="yaml">
meta:
  layout: naked
</route>
