<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { setErrors } from '@formkit/core'
import { FormKitMessages } from '@formkit/vue'
import { useSupabase } from '~/services/supabase'
import { iconEmail, iconName, iconPassword } from '~/services/icons'

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
  try {
    await window.Reflio.signup(form.email)
  }
  catch (error) {
    console.error(error)
  }
  isLoading.value = false
  if (error || !user) {
    setErrors('register-account', [error?.message || 'user not found'], {})
    return
  }
  router.push('/onboarding/confirm_email')
}
</script>

<template>
  <section class="flex w-full min-h-screen py-10 my-auto overflow-y-scroll lg:py-8 sm:py-8">
    <div class="px-4 mx-auto max-w-7xl lg:px-8 sm:px-6">
      <div class="max-w-2xl mx-auto text-center">
        <img src="/capgo.webp" alt="logo" class="w-1/6 mx-auto mb-6 rounded invert dark:invert-0">

        <h1 class="text-3xl font-bold leading-tight text-black lg:text-5xl sm:text-4xl dark:text-white">
          {{ t("register-heading") }}
        </h1>
      </div>

      <div class="relative max-w-2xl mx-auto mt-4 md:mt-8">
        <div class="overflow-hidden bg-white rounded-md shadow-md">
          <div class="px-4 py-6 sm:px-8 sm:py-7">
            <FormKit id="register-account" type="form" :actions="false" @submit="submit">
              <FormKitMessages />
              <div class="space-y-2 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
                <FormKit
                  type="text"
                  name="first_name"
                  :disabled="isLoading"
                  :prefix-icon="iconName"
                  :label="t('first-name')"
                  autocomplete="given-name"
                  validation="required:trim"
                  enterkeyhint="next"
                  autofocus
                />
                <FormKit
                  type="text"
                  name="first_name"
                  :label="t('last-name')"
                  autocomplete="family-name"
                  :prefix-icon="iconName"
                  :disabled="isLoading"
                  validation="required:trim"
                  enterkeyhint="next"
                />
                <div class="col-span-2">
                  <FormKit
                    type="email"
                    name="email"
                    :prefix-icon="iconEmail"
                    autocomplete="email"
                    inputmode="email"
                    enterkeyhint="next"
                    validation="required:trim|email"
                    :label="t('email')"
                  />
                </div>

                <FormKit
                  type="password"
                  name="password"
                  :prefix-icon="iconPassword"
                  autocomplete="new-password"
                  :label="t('password')"
                  :help="t('6-characters-minimum')"
                  validation="required|length:6|contain_alphanumeric|contain_uppercase|contain_lowercase|contain_symbol"
                  validation-visibility="live"
                />
                <FormKit
                  type="password"
                  name="password_confirm"
                  :prefix-icon="iconPassword"
                  :help="t('confirm-password')"
                  :label="t('confirm-password')"
                  autocomplete="new-password"
                  validation="required|confirm"
                  validation-visibility="live"
                  :validation-label="t('password-confirmatio')"
                />

                <div class="flex items-center col-span-2">
                  <span class="text-sm font-medium text-gray-500">
                    {{ t("password-hint") }}
                  </span>
                </div>

                <div class="w-1/2 col-span-2 mx-auto">
                  <button
                    :disabled="isLoading" type="submit" class="inline-flex items-center justify-center w-full px-4 py-4 text-base font-semibold text-white transition-all duration-200 border border-transparent rounded-md bg-muted-blue-600 focus:bg-blue-700 hover:bg-blue-700 focus:outline-none"
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
