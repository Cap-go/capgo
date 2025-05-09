<script setup lang="ts">
import { setErrors } from '@formkit/core'
import { FormKit, FormKitMessages } from '@formkit/vue'
import { useI18n } from 'petite-vue-i18n'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import VueTurnstile from 'vue-turnstile'
import iconEmail from '~icons/oui/email?raw'
import iconPassword from '~icons/ph/key?raw'
import iconName from '~icons/ph/user?raw'
import { hashEmail, useSupabase } from '~/services/supabase'
import { openSupport } from '~/services/support'
import { registerWebsiteDomain } from '~/utils/Utils'

const router = useRouter()
const supabase = useSupabase()
const { t } = useI18n()
const turnstileToken = ref('')
const captchaKey = ref(import.meta.env.VITE_CAPTCHA_KEY)
const isLoading = ref(false)

if (registerWebsiteDomain() === 'https://capgo.app') {
  // do not allow to register on webapp on production
  window.location.href = 'https://capgo.app/register/'
}

async function submit(form: { first_name: string, last_name: string, password: string, email: string }) {
  if (isLoading.value)
    return

  const hashedEmail = await hashEmail(form.email)
  const { data: deleted, error: errorDeleted } = await supabase
    .rpc('is_not_deleted', { email_check: hashedEmail })
  if (errorDeleted)
    console.error(errorDeleted)
  if (!deleted) {
    setErrors('register-account', [t('used-to-create')], {})
    return
  }

  isLoading.value = true
  const { data: user, error } = await supabase.auth.signUp(
    {
      email: form.email,
      password: form.password,
      options: {
        captchaToken: turnstileToken.value,
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
    // http://localhost:5173/onboarding/verify_email,http://localhost:5173/forgot_password?step=2,https://capgo.app/onboarding/verify_email,https://capgo.app/forgot_password?step=2,https://capgo.app/onboarding/first_password,https://development.capgo.app/onboarding/verify_email,https://development.capgo.app/forgot_password?step=2
  )
  isLoading.value = false
  if (error || !user) {
    setErrors('register-account', [error?.message || 'user not found'], {})
    return
  }
  router.push(`/app`)
}
</script>

<template>
  <section class="flex w-full min-h-screen py-10 my-auto overflow-y-auto lg:py-8 sm:py-8">
    <div class="px-4 mx-auto max-w-7xl lg:px-8 sm:px-6">
      <div class="max-w-2xl mx-auto text-center">
        <img src="/capgo.webp" alt="logo" class="w-1/6 mx-auto mb-6 rounded-sm invert dark:invert-0">

        <h1 class="text-3xl font-bold leading-tight text-black lg:text-5xl sm:text-4xl dark:text-white">
          {{ t("register-heading") }}
        </h1>
      </div>

      <div class="relative max-w-2xl mx-auto mt-4 md:mt-8">
        <div class="overflow-hidden bg-white rounded-md shadow-md dark:bg-slate-800">
          <div class="px-4 py-6 sm:px-8 sm:py-7">
            <FormKit id="register-account" type="form" :actions="false" @submit="submit">
              <FormKitMessages data-test="form-error" />
              <div class="space-y-2 text-gray-500 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
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
                    data-test="email"
                    :classes="{
                      outer: 'mb-0!',
                    }"
                  />
                </div>
                <FormKit
                  type="text"
                  name="first_name"
                  :disabled="isLoading"
                  :prefix-icon="iconName"
                  :label="t('first-name')"
                  autocomplete="given-name"
                  validation="required:trim"
                  enterkeyhint="next"
                  data-test="first_name"
                  autofocus
                />
                <FormKit
                  type="text"
                  name="last_name"
                  :label="t('last-name')"
                  autocomplete="family-name"
                  :prefix-icon="iconName"
                  :disabled="isLoading"
                  validation="required:trim"
                  enterkeyhint="next"
                  data-test="last_name"
                />

                <FormKit
                  type="password"
                  name="password"
                  :prefix-icon="iconPassword"
                  autocomplete="new-password"
                  :label="t('password')"
                  data-test="password"
                  validation="required|length:6|contains_alpha|contains_uppercase|contains_lowercase|contains_symbol"
                  validation-visibility="live"
                />
                <FormKit
                  type="password"
                  name="password_confirm"
                  :prefix-icon="iconPassword"
                  :label="t('confirm-password')"
                  autocomplete="new-password"
                  data-test="confirm-password"
                  validation="required|confirm"
                  validation-visibility="live"
                  :validation-label="t('password-confirmatio')"
                />

                <div class="w-1/2 col-span-2 mx-auto">
                  <div v-if="!!captchaKey">
                    <VueTurnstile v-model="turnstileToken" size="flexible" :site-key="captchaKey" />
                  </div>
                  <button
                    :disabled="isLoading" type="submit" data-test="submit" class="inline-flex items-center justify-center w-full px-4 py-4 text-base font-semibold text-white transition-all duration-200 border border-transparent rounded-md bg-muted-blue-600 focus:bg-blue-700 hover:bg-blue-700 focus:outline-hidden"
                  >
                    <span v-if="!isLoading" class="rounded-4xl">
                      {{ t("register-next") }}
                    </span>
                    <Spinner v-else size="w-8 h-8" class="px-4" color="fill-gray-100 text-gray-200 dark:text-gray-600" />
                  </button>
                </div>

                <div class="col-span-2 text-center">
                  <p class="text-base text-gray-600">
                    <a href="/login" title="" class="text-sm font-medium text-orange-500 transition-all duration-200 focus:text-orange-600 hover:text-orange-600 hover:underline">{{ t("already-account") }}</a>
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
          <button class="p-2 mt-3 text-gray-500 rounded-md hover:bg-gray-300" @click="openSupport">
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
