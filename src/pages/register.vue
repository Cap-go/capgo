<script setup lang="ts">
import { setErrors } from '@formkit/core'
import { FormKit, FormKitMessages } from '@formkit/vue'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import VueTurnstile from 'vue-turnstile'
import iconEmail from '~icons/oui/email?raw'
import iconPassword from '~icons/ph/key?raw'
import iconName from '~icons/ph/user?raw'
import { sanitizeText } from '~/services/sanitize'
import { hashEmail, useSupabase } from '~/services/supabase'
import { openSupport } from '~/services/support'

const router = useRouter()
const supabase = useSupabase()
const { t } = useI18n()
const turnstileToken = ref('')
const captchaKey = ref(import.meta.env.VITE_CAPTCHA_KEY)
const isLoading = ref(false)

if (window.location.host === 'console.capgo.app') {
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
      },
    },
    // supabase auth config
    // http://localhost:5173/login,http://localhost:5173/forgot_password?step=2,https://capgo.app/login,https://capgo.app/forgot_password?step=2,https://capgo.app/onboarding/first_password,https://development.capgo.app/login,https://development.capgo.app/forgot_password?step=2
  )
  isLoading.value = false
  if (error || !user) {
    setErrors('register-account', [error?.message || 'user not found'], {})
    return
  }

  const newUser = user.user
  if (newUser) {
    const sanitizedFirstName = sanitizeText(form.first_name)
    const sanitizedLastName = sanitizeText(form.last_name)
    const { error: profileError } = await supabase
      .from('users')
      .upsert({
        id: newUser.id,
        email: newUser.email ?? form.email,
        first_name: sanitizedFirstName,
        last_name: sanitizedLastName,
        enable_notifications: true,
        opt_for_newsletters: true,
      }, { onConflict: 'id' })

    if (profileError)
      console.error('Failed to seed user profile after signup', profileError)
  }

  router.push(`/app`)
}
</script>

<template>
  <section class="flex overflow-y-auto py-10 my-auto w-full min-h-screen sm:py-8 lg:py-8">
    <div class="px-4 mx-auto max-w-7xl sm:px-6 lg:px-8">
      <div class="mx-auto max-w-2xl text-center">
        <img src="/capgo.webp" alt="logo" class="mx-auto mb-6 w-1/6 rounded-sm invert dark:invert-0">

        <h1 class="text-3xl font-bold leading-tight text-black sm:text-4xl lg:text-5xl dark:text-white">
          {{ t("register-heading") }}
        </h1>
      </div>

      <div class="relative mx-auto mt-4 max-w-2xl md:mt-8">
        <div class="overflow-hidden bg-white rounded-md shadow-md dark:bg-slate-800">
          <div class="py-6 px-4 sm:py-7 sm:px-8">
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

                <div class="col-span-2 mx-auto w-1/2">
                  <div v-if="!!captchaKey">
                    <VueTurnstile v-model="turnstileToken" size="flexible" :site-key="captchaKey" />
                  </div>
                  <button
                    :disabled="isLoading" type="submit" data-test="submit" class="inline-flex justify-center items-center py-4 px-4 w-full text-base font-semibold text-white rounded-md border border-transparent transition-all duration-200 hover:bg-blue-700 focus:bg-blue-700 bg-muted-blue-600 focus:outline-hidden"
                  >
                    <span v-if="!isLoading" class="rounded-4xl">
                      {{ t("register-next") }}
                    </span>
                    <Spinner v-else size="w-8 h-8" class="px-4" color="fill-gray-100 text-gray-200 dark:text-gray-600" />
                  </button>
                </div>

                <div class="col-span-2 mt-3 text-center">
                  <p class="text-xs text-gray-500">
                    {{ t('register-terms-disclaimer') }}
                  </p>
                </div>

                <div class="col-span-2 text-center">
                  <p class="text-base text-gray-600">
                    <a href="/login" title="" class="text-sm font-medium text-orange-500 transition-all duration-200 hover:text-orange-600 hover:underline focus:text-orange-600">{{ t("already-account") }}</a>
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
