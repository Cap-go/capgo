<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { setErrors } from '@formkit/core'
import { FormKitMessages } from '@formkit/vue'
import { toast } from 'vue-sonner'
import { useSupabase } from '~/services/supabase'
import Spinner from '~/components/Spinner.vue'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const supabase = useSupabase()
const step = ref(1)

const isLoading = ref(false)
const isLoadingMain = ref(true)

const submit = async (form: { email: string; password: string }) => {
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
    <section class="my-auto h-full w-full flex overflow-y-scroll py-10 lg:py-2 sm:py-8">
      <div class="mx-auto my-auto max-w-7xl px-4 lg:px-8 sm:px-6">
        <div class="mx-auto max-w-2xl text-center">
          <img src="/capgo.webp" alt="logo" class="mx-auto mb-6 w-1/6 rounded">
          <h1 class="text-3xl font-bold leading-tight text-black lg:text-5xl sm:text-4xl dark:text-white">
            {{ t('reset-your-password') }}
          </h1>
          <p v-if="step === 1" class="mx-auto mt-4 max-w-xl text-base leading-relaxed text-gray-600 dark:text-gray-300">
            {{ t('enter-your-email-add') }}
          </p>
          <p v-else>
            {{ t('enter-your-new-passw') }}
          </p>
        </div>

        <div class="relative mx-auto mt-8 max-w-md md:mt-4">
          <div class="overflow-hidden rounded-md bg-white shadow-md">
            <div class="px-4 py-6 sm:px-8 sm:py-7">
              <FormKit id="forgot-pass" messages-class="text-red-500" type="form" :actions="false" @submit="submit">
                <div class="space-y-5">
                  <div v-if="step === 1">
                    <label for="" class="text-base font-medium text-gray-900"> {{ t('email-address') }} </label>
                    <div class="relative mt-2.5 text-gray-400 focus-within:text-gray-600">
                      <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                        </svg>
                      </div>
                      <FormKit
                        type="email"
                        name="email"
                        :disabled="isLoading"
                        inputmode="email"
                        autocomplete="email"
                        validation="required:trim"
                        :placeholder="t('email')"
                        input-class="block w-full py-4 pl-10 pr-4 text-black placeholder-gray-500 transition-all duration-200 bg-white border border-gray-200 rounded-md focus:outline-none focus:border-blue-600 caret-blue-600"
                        message-class="text-red-500"
                      />
                    </div>
                  </div>

                  <div v-if="step === 2">
                    <div class="relative mt-2.5 text-gray-400 focus-within:text-gray-600">
                      <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"
                          />
                        </svg>
                      </div>
                      <FormKit
                        type="password"
                        name="password"
                        autocomplete="new-password"
                        enterkeyhint="send"
                        :disabled="isLoading"
                        input-class="block w-full py-4 pl-10 pr-4 text-black placeholder-gray-500 transition-all duration-200 bg-white border border-gray-200 rounded-md focus:outline-none focus:border-blue-600 caret-blue-600"
                        placeholder="******"
                        :label="t('password')"
                        :help="t('6-characters-minimum')"
                        validation="required|length:6|matches:/(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[#?!@$%^&*-])/"
                        validation-visibility="live"
                        message-class="text-red-500"
                      />
                    </div>
                  </div>

                  <div v-if="step === 2">
                    <div class="relative mt-2.5 text-gray-400 focus-within:text-gray-600">
                      <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"
                          />
                        </svg>
                      </div>

                      <FormKit
                        type="password"
                        name="password_confirm"
                        autocomplete="new-password"
                        :disabled="isLoading"
                        input-class="block w-full py-4 pl-10 pr-4 text-black placeholder-gray-500 transition-all duration-200 bg-white border border-gray-200 rounded-md focus:outline-none focus:border-blue-600 caret-blue-600"
                        :label="t('confirm-password')"
                        :help="t('confirm-password')"
                        validation="required|confirm"
                        validation-visibility="live"
                        :validation-label="t('password-confirmatio')"
                        message-class="text-red-500"
                      />
                    </div>
                  </div>
                  <FormKitMessages />

                  <div>
                    <button type="submit" class="w-full inline-flex items-center justify-center">
                      <svg v-if="isLoading" class="mr-3 inline-block h-5 w-5 animate-spin align-middle text-gray-900 -ml-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
                      <button v-if="!isLoading" type="submit" class="w-full inline-flex items-center justify-center border border-transparent rounded-md bg-muted-blue-700 px-4 py-4 text-base font-semibold text-white transition-all duration-200 focus:bg-blue-700 hover:bg-blue-700 focus:outline-none">
                        {{ t('reset-password') }}
                      </button>
                    </button>
                  </div>
                </div>
              </FormKit>
            </div>
          </div>
          <div class="mt-5 w-full flex flex-row justify-center">
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
