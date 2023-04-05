<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { setErrors } from '@formkit/core'
import { FormKitMessages } from '@formkit/vue'
import { useSupabase } from '~/services/supabase'

const router = useRouter()
const supabase = useSupabase()
const { t } = useI18n()

const isLoading = ref(false)

async function submit(form: { first_name: string; last_name: string; password: string; email: string }) {
  if (isLoading.value)
    return
  isLoading.value = true
  const { data: user, error } = await supabase.auth.signUp(
    {
      email: form.email,
      password: form.password,
      options: {
        data: {
          first_name: form.first_name,
          last_name: form.last_name,
          activation: {
            formFilled: true,
            enableNotifications: false,
            legal: false,
            optForNewsletters: false,
          },
        },
        emailRedirectTo: `${import.meta.env.VITE_APP_URL}/onboarding/verify_email`,
      },
    },
    // supabase auth config
    // http://localhost:3334/onboarding/verify_email,http://localhost:3334/forgot_password?step=2,https://capgo.app/onboarding/verify_email,https://capgo.app/forgot_password?step=2,https://capgo.app/onboarding/first_password,https://development.capgo.app/onboarding/verify_email,https://development.capgo.app/forgot_password?step=2
  )
  isLoading.value = false
  if (error || !user) {
    setErrors('register-account', [error?.message || 'user not found'], {})
    return
  }
  router.push('/onboarding/confirm_email')
}
</script>

<template>
  <section class="my-auto min-h-screen w-full flex overflow-y-scroll py-10 lg:py-8 sm:py-8">
    <div class="mx-auto max-w-7xl px-4 lg:px-8 sm:px-6">
      <div class="mx-auto max-w-2xl text-center">
        <img src="/capgo.webp" alt="logo" class="mx-auto mb-6 w-1/6 rounded">

        <h1 class="text-3xl font-bold leading-tight text-black lg:text-5xl sm:text-4xl dark:text-white">
          {{ t("register-heading") }}
        </h1>
      </div>

      <div class="relative mx-auto mt-4 max-w-2xl md:mt-8">
        <div class="overflow-hidden rounded-md bg-white shadow-md">
          <div class="px-4 py-6 sm:px-8 sm:py-7">
            <FormKit id="register-account" messages-class="text-red-500" type="form" :actions="false" @submit="submit">
              <FormKitMessages />
              <div class="md:grid md:grid-cols-2 md:gap-4 space-y-2 md:space-y-0">
                <div>
                  <label for="" class="text-base font-medium text-gray-900"> {{ t('first-name') }} </label>
                  <div class="relative mt-2.5 text-gray-400 focus-within:text-gray-600">
                    <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>

                    <FormKit
                      type="text"
                      name="first_name"
                      :disabled="isLoading"
                      autocomplete="given-name"
                      validation="required:trim"
                      enterkeyhint="next"
                      autofocus
                      :placeholder="t('first-name')"
                      input-class="block w-full py-4 pl-10 pr-4 text-black placeholder-gray-500 transition-all duration-200 bg-white border border-gray-200 rounded-md focus:outline-none focus:border-muted-blue-600 caret-muted-blue-600"
                      message-class="text-red-500"
                    />
                  </div>
                </div>

                <div>
                  <label for="" class="text-base font-medium text-gray-900"> {{ t('last-name') }} </label>
                  <div class="relative mt-2.5 text-gray-400 focus-within:text-gray-600">
                    <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>

                    <FormKit
                      type="text"
                      name="first_name"
                      autocomplete="family-name"
                      :disabled="isLoading"
                      validation="required:trim"
                      enterkeyhint="next"
                      :placeholder="t('last-name')"
                      input-class="block w-full py-4 pl-10 pr-4 text-black placeholder-gray-500 transition-all duration-200 bg-white border border-gray-200 rounded-md focus:outline-none focus:border-muted-blue-600 caret-muted-blue-600"
                      message-class="text-red-500"
                    />
                  </div>
                </div>

                <div class="col-span-2">
                  <label for="" class="text-base font-medium text-gray-900"> {{ t('email') }} </label>
                  <div class="relative mt-2.5 text-gray-400 focus-within:text-gray-600">
                    <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                      </svg>
                    </div>

                    <FormKit
                      type="email"
                      name="email"
                      autocomplete="email"
                      inputmode="email"
                      enterkeyhint="next"
                      validation="required:trim|email"
                      :placeholder="t('email')"
                      input-class="block w-full py-4 pl-10 pr-4 text-black placeholder-gray-500 transition-all duration-200 bg-white border border-gray-200 rounded-md focus:outline-none focus:border-muted-blue-600 caret-muted-blue-600"
                      message-class="text-red-500"
                    />
                  </div>
                </div>

                <div>
                  <label for="" class="text-base font-medium text-gray-900"> {{ t('password') }} </label>
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
                      input-class="block w-full py-4 pl-10 pr-4 text-black placeholder-gray-500 transition-all duration-200 bg-white border border-gray-200 rounded-md focus:outline-none focus:border-muted-blue-600 caret-muted-blue-600"
                      placeholder="******"
                      :help="t('6-characters-minimum')"
                      validation="required|length:6|matches:/(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[#?!@$%^&*-])/"
                      validation-visibility="live"
                      message-class="text-red-500"
                    />
                  </div>
                </div>

                <div>
                  <label for="" class="text-base font-medium text-gray-900"> {{ t('confirm-password') }} </label>
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
                      :help="t('confirm-password')"
                      autocomplete="new-password"
                      input-class="block w-full py-4 pl-10 pr-4 text-black placeholder-gray-500 transition-all duration-200 bg-white border border-gray-200 rounded-md focus:outline-none focus:border-muted-blue-600 caret-muted-blue-600"
                      validation="required|confirm"
                      validation-visibility="live"
                      :validation-label="t('password-confirmatio')"
                      message-class="text-red-500"
                    />
                  </div>
                </div>

                <div class="col-span-2 flex items-center">
                  <span class="text-sm font-medium text-gray-500">
                    {{ t("password-hint") }}
                  </span>
                </div>

                <div class="col-span-2 mx-auto w-1/2">
                  <button
                    :disabled="isLoading" type="submit" class="w-full inline-flex items-center justify-center border border-transparent rounded-md bg-muted-blue-600 px-4 py-4 text-base font-semibold text-white transition-all duration-200 focus:bg-blue-700 hover:bg-blue-700 focus:outline-none"
                  >
                    <span v-if="!isLoading" class="rounded-4xl">
                      {{ t("register-next") }}
                    </span>
                    <Spinner v-else size="w-8 h-8" class="px-4" color="fill-gray-100 text-gray-200 dark:text-gray-600" />
                  </button>
                </div>

                <div class="col-span-2 text-center">
                  <p class="text-base text-gray-600">
                    <a href="/login" title="" class="font-medium text-orange-500 transition-all duration-200 hover:text-orange-600 hover:underline">{{ t("already-account") }}</a>
                  </p>
                </div>
              </div>
            </FormKit>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<route lang="yaml">
meta:
  layout: naked
</route>
