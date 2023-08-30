<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { setErrors } from '@formkit/core'
import { FormKitMessages } from '@formkit/vue'
import { toast } from 'vue-sonner'
import { useSupabase } from '~/services/supabase'
import Spinner from '~/components/Spinner.vue'
import { iconEmail, iconPassword } from '~/services/icons'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const supabase = useSupabase()
const step = ref(1)

const isLoading = ref(false)
const isLoadingMain = ref(true)

async function submit(form: { email: string; password: string }) {
  isLoading.value = true
  if (step.value === 1) {
    const redirectTo = `${import.meta.env.VITE_APP_URL}/forgot_password?step=2`
    // console.log('redirect', redirectTo)
    const { error } = await supabase.auth.resetPasswordForEmail(form.email, { redirectTo })
    setTimeout(() => {
      isLoading.value = false
    }, 5000)
    if (error)
      setErrors('forgot-password', [error.message], {})
    else toast.success(t('forgot-check-email'))
  }
  else if (step.value === 2 && route.hash) {
    const queryString = route.hash.replace('#', '')
    const urlParams = new URLSearchParams(queryString)
    const access_token = urlParams.get('access_token') || ''
    const refresh_token = urlParams.get('refresh_token') || ''
    // login with access_token
    const res = await supabase.auth.setSession({ refresh_token, access_token })
    if (res.error) {
      setErrors('forgot-password', [res.error.message], {})
      return
    }
    else {
      console.log('res', res)
    }
    const { error } = await supabase.auth.updateUser({ password: form.password })
    setTimeout(() => {
      isLoading.value = false
    }, 5000)
    if (error) {
      setErrors('forgot-password', [error.message], {})
    }
    else {
      toast.success(t('forgot-success'))
      await supabase.auth.signOut()
      router.push('/login')
    }
  }
}

watchEffect(() => {
  isLoadingMain.value = true
  if (route && route.path === '/forgot_password') {
    console.log('router.currentRoute.value.query', router.currentRoute.value.query)
    if (router.currentRoute.value.query && router.currentRoute.value.query.step)
      step.value = parseInt(router.currentRoute.value.query.step as string)
    isLoadingMain.value = false
  }
})
</script>

<template>
  <section v-if="isLoadingMain" class="flex justify-center">
    <Spinner size="w-40 h-40" class="my-auto" />
  </section>
  <div v-else>
    <section class="flex w-full h-full py-10 my-auto overflow-y-scroll lg:py-2 sm:py-8">
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
          <div class="overflow-hidden bg-white rounded-md shadow-md">
            <div class="px-4 py-6 sm:px-8 sm:py-7">
              <FormKit id="forgot-pass" type="form" :actions="false" @submit="submit">
                <div class="space-y-5">
                  <div v-if="step === 1">
                    <FormKit
                      type="email"
                      name="email"
                      :label="t('email')"
                      input-class="!text-black"
                      :disabled="isLoading"
                      :prefix-icon="iconEmail"
                      inputmode="email"
                      autocomplete="email"
                      validation="required:trim"
                    />
                  </div>

                  <div v-if="step === 2">
                    <FormKit
                      type="password"
                      name="password"
                      :prefix-icon="iconPassword"
                      autocomplete="new-password"
                      input-class="!text-black"
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
                      input-class="!text-black"
                      :disabled="isLoading"
                      :label="t('confirm-password')"
                      :help="t('confirm-password')"
                      validation="required|confirm"
                      validation-visibility="live"
                      :validation-label="t('password-confirmatio')"
                    />
                  </div>
                  <FormKitMessages />

                  <div>
                    <button type="submit" class="inline-flex items-center justify-center w-full">
                      <svg v-if="isLoading" class="inline-block w-5 h-5 mr-3 -ml-1 text-gray-900 align-middle animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
                      <button v-if="!isLoading" type="submit" class="inline-flex items-center justify-center w-full px-4 py-4 text-base font-semibold text-white transition-all duration-200 border border-transparent rounded-md bg-muted-blue-700 focus:bg-blue-700 hover:bg-blue-700 focus:outline-none">
                        {{ t('reset-password') }}
                      </button>
                    </button>
                  </div>
                </div>
              </FormKit>
            </div>
          </div>
          <div class="flex flex-row justify-center w-full mt-5">
            <router-link to="/login" class="font-medium text-orange-500 transition-all duration-200 hover:text-orange-600 hover:underline">
              {{ t('back-to-login-page') }}
            </router-link>
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
