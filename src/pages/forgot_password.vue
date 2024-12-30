<script setup lang="ts">
import { setErrors } from '@formkit/core'
import { FormKit, FormKitMessages } from '@formkit/vue'
import { useI18n } from 'petite-vue-i18n'
import { ref, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import VueTurnstile from 'vue-turnstile'
import iconEmail from '~icons/oui/email?raw'
import iconPassword from '~icons/ph/key?raw'
import Spinner from '~/components/Spinner.vue'
import { useSupabase } from '~/services/supabase'

const { t } = useI18n()
const router = useRouter()
const route = useRoute('/forgot_password')
const supabase = useSupabase()
const step = ref(1)
const turnstileToken = ref('')

const captchaKey = ref(import.meta.env.VITE_CAPTCHA_KEY)
const displayStore = useDisplayStore()

const isLoading = ref(false)
const isLoadingMain = ref(true)

async function submit(form: { email: string, password: string, password_confirm: string }) {
  isLoading.value = true
  if (step.value === 1) {
    const redirectTo = `${import.meta.env.VITE_APP_URL}/forgot_password?step=2`
    // console.log('redirect', redirectTo)
    const { error } = await supabase.auth.resetPasswordForEmail(form.email, { redirectTo, captchaToken: turnstileToken.value })
    if (error) {
      if (error.message.includes('captcha')) {
        toast.error(t('captcha-fail'))
      }
      setErrors('forgot-password', [error.message], {})
      console.error('error reset', error)
    }
    else {
      toast.success(t('forgot-check-email'))
    }
    isLoading.value = false
  }
  else if (step.value === 2 && route.hash) {
    const queryString = route.hash.replace('#', '')
    const urlParams = new URLSearchParams(queryString)
    const access_token = urlParams.get('access_token') || ''
    const refresh_token = urlParams.get('refresh_token') || ''
    // login with access_token
    const { error } = await supabase.auth.setSession({ refresh_token, access_token })
    if (error) {
      setErrors('forgot-password', [error.message], {})
      return
    }
    const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    const { currentLevel, nextLevel } = aal.data!
    if (nextLevel !== currentLevel) {
      const { data: mfaFactors, error: mfaError } = await supabase.auth.mfa.listFactors()
      if (mfaError) {
        setErrors('forgot-password', [mfaError.message], {})
        console.error('Cannot get MFA factors', mfaError)
        return
      }
      const factor = mfaFactors.all.find(factor => factor.status === 'verified')
      if (!factor) {
        setErrors('forgot-password', ['Cannot find MFA factor'], {})
        console.error('Cannot get MFA factors', mfaError)
        return
      }

      const { data: challenge, error: errorChallenge } = await supabase.auth.mfa.challenge({ factorId: factor.id })
      if (errorChallenge) {
        setErrors('forgot-password', [errorChallenge.message], {})
        console.error('Cannot challenge MFA factor', errorChallenge)
        return
      }

      displayStore.dialogOption = {
        header: t('alert-2fa-required'),
        message: t('alert-2fa-required-message'),
        preventAccidentalClose: true,
        input: true,
        buttons: [
          {
            text: t('button-confirm'),
            role: 'confirm',
            handler: async () => {
              const { data: _verify, error: errorVerify } = await supabase.auth.mfa.verify({
                factorId: factor.id,
                challengeId: challenge.id,
                code: displayStore.dialogInputText.replace(' ', ''),
              })
              if (errorVerify) {
                displayStore.showDialog = true
                toast.error(t('invalid-mfa-code'))
              }
            },
          },
        ],
      }
      displayStore.showDialog = true
      await displayStore.onDialogDismiss()
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: form.password })
    isLoading.value = false
    if (updateError) {
      setErrors('forgot-password', [updateError.message], {})
    }
    else {
      form.password = ''
      form.password_confirm = ''
      toast.success(t('forgot-success'))
      await supabase.auth.signOut()
      router.push('/login')
    }
  }
}

watchEffect(() => {
  isLoadingMain.value = true
  if (route && route.path === '/forgot_password') {
    // console.log('router.currentRoute.value.query', router.currentRoute.value.query)
    if (router.currentRoute.value.query && router.currentRoute.value.query.step)
      step.value = Number.parseInt(router.currentRoute.value.query.step as string)
    isLoadingMain.value = false
  }
})
</script>

<template>
  <section v-if="isLoadingMain" class="flex justify-center">
    <Spinner size="w-40 h-40" class="my-auto" />
  </section>
  <div v-else>
    <section class="flex w-full h-full py-10 my-auto overflow-y-auto lg:py-2 sm:py-8">
      <div class="px-4 mx-auto my-auto max-w-7xl lg:px-8 sm:px-6">
        <div class="max-w-2xl mx-auto text-center">
          <img src="/capgo.webp" alt="logo" class="w-1/6 mx-auto mb-6 rounded invert dark:invert-0">
          <h1 class="text-3xl font-bold leading-tight text-black lg:text-5xl sm:text-4xl dark:text-white">
            {{ t('reset-your-password') }}
          </h1>
          <p v-if="step === 1" class="max-w-xl mx-auto mt-4 text-base leading-relaxed text-gray-600 dark:text-gray-300">
            {{ t('enter-your-email-add') }}
          </p>
          <p v-else>
            {{ t('enter-your-new-passw') }}
          </p>
        </div>

        <div class="relative max-w-md mx-auto mt-8 md:mt-4">
          <div class="overflow-hidden bg-white rounded-md shadow-md dark:bg-slate-800">
            <div class="px-4 py-6 sm:px-8 sm:py-7">
              <FormKit id="forgot-password" type="form" :actions="false" @submit="submit">
                <div class="space-y-5 text-gray-500">
                  <div v-if="step === 1">
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
                    <template v-if="!!captchaKey">
                      <VueTurnstile v-model="turnstileToken" size="flexible" :site-key="captchaKey" />
                    </template>
                    <FormKitMessages />
                  </div>

                  <div v-if="step === 2">
                    <FormKit
                      type="password"
                      name="password"
                      :prefix-icon="iconPassword"
                      autocomplete="new-password"
                      enterkeyhint="send"
                      :disabled="isLoading"
                      :label="t('password')"
                      :help="t('6-characters-minimum')"
                      validation="required|length:6"
                      validation-visibility="live"
                    />
                  </div>

                  <div v-if="step === 2">
                    <FormKit
                      type="password"
                      :prefix-icon="iconPassword"
                      name="password_confirm"
                      autocomplete="new-password"
                      :disabled="isLoading"
                      :label="t('confirm-password')"
                      :help="t('confirm-password')"
                      validation="required|confirm"
                      validation-visibility="live"
                      :validation-label="t('password-confirmatio')"
                    />
                  </div>

                  <div>
                    <button type="submit" class="inline-flex items-center justify-center w-full">
                      <svg v-if="isLoading" class="inline-block w-5 h-5 mr-3 -ml-1 text-gray-900 align-middle dark:text-white animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
                      <div v-if="!isLoading" class="inline-flex items-center justify-center w-full px-4 py-4 text-base font-semibold text-white transition-all duration-200 border border-transparent rounded-md bg-muted-blue-700 focus:bg-blue-700 hover:bg-blue-700 focus:outline-none">
                        {{ t('reset-password') }}
                      </div>
                    </button>
                  </div>
                </div>
              </FormKit>
              <div class="flex flex-row justify-center w-full mt-5">
                <router-link to="/login" class="text-sm font-medium text-orange-500 transition-all duration-200 focus:text-orange-600 hover:text-orange-600 hover:underline">
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
