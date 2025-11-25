<script setup lang="ts">
import { setErrors } from '@formkit/core'
import { FormKit, FormKitMessages } from '@formkit/vue'
import { ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import iconPassword from '~icons/ph/key?raw'
import { useSupabase } from '~/services/supabase'

const isLoading = ref(false)
const supabase = useSupabase()

const { t } = useI18n()

const router = useRouter()
const route = useRoute('/onboarding/set_password')

async function signInUser() {
  if (!route.hash) {
    router.push('/login')
    return
  }
  const queryString = route.hash.replace('#', '')
  const urlParams = new URLSearchParams(queryString)
  const refresh_token = urlParams.get('refresh_token')
  if (!refresh_token) {
    router.push('/login')
    return
  }
  await supabase.auth.refreshSession({
    refresh_token: refresh_token ?? '',
  })
}

async function submit(form: { password: string }) {
  isLoading.value = true

  const { error: updateError } = await supabase.auth.updateUser({ password: form.password })
  isLoading.value = false
  if (updateError)
    setErrors('set-password', [updateError.message], {})
  else
    toast.success(t('changed-password-suc'))
  router.replace('/dashboard')
}
watchEffect(async () => {
  if (route && route.path === '/onboarding/set_password')
    await signInUser()
})
</script>

<template>
  <div>
    <section v-if="isLoading" class="flex justify-center">
      <Spinner size="w-40 h-40" class="my-auto" />
    </section>
    <div v-else>
      <section class="flex overflow-y-auto py-10 my-auto w-full h-full sm:py-8 lg:py-2">
        <div class="px-4 my-auto mx-auto max-w-7xl sm:px-6 lg:px-8">
          <div class="mx-auto max-w-2xl text-center">
            <img src="/capgo.webp" alt="logo" class="mx-auto mb-6 w-1/6 rounded-sm invert dark:invert-0">
            <h1 class="text-3xl font-bold leading-tight text-black sm:text-4xl lg:text-5xl dark:text-white">
              {{ t('password-heading') }}
            </h1>
            <p>
              {{ t('enter-your-new-passw') }}
            </p>
          </div>

          <div class="relative mx-auto mt-8 max-w-md md:mt-4">
            <div class="overflow-hidden bg-white rounded-md shadow-md">
              <div class="py-6 px-4 sm:py-7 sm:px-8">
                <FormKit id="set-password" type="form" :actions="false" @submit="submit">
                  <div class="space-y-5">
                    <FormKitMessages />
                    <div>
                      <div class="relative mt-2.5 text-gray-400 focus-within:text-gray-600">
                        <FormKit
                          type="password"
                          name="password"
                          :prefix-icon="iconPassword"
                          autocomplete="new-password"
                          enterkeyhint="send"
                          :disabled="isLoading"
                          :label="t('password')"
                          :help="t('6-characters-minimum')"
                          validation="required|length:6|contain_alphanumeric|contain_uppercase|contain_lowercase|contain_symbol"
                          validation-visibility="live"
                        />
                      </div>
                    </div>

                    <div>
                      <div class="relative mt-2.5 text-gray-400 focus-within:text-gray-600">
                        <FormKit
                          type="password"
                          name="password_confirm"
                          :prefix-icon="iconPassword"
                          autocomplete="new-password"
                          :disabled="isLoading"
                          :label="t('confirm-password')"
                          :help="t('confirm-password')"
                          validation="required|confirm"
                          validation-visibility="live"
                          :validation-label="t('password-confirmatio')"
                        />
                      </div>
                    </div>

                    <div>
                      <button type="submit" class="inline-flex justify-center items-center w-full">
                        <svg v-if="isLoading" class="inline-block mr-3 -ml-1 w-5 h-5 text-gray-900 align-middle animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
                        <button v-if="!isLoading" type="submit" class="inline-flex justify-center items-center py-4 px-4 w-full text-base font-semibold text-white rounded-md border border-transparent transition-all duration-200 hover:bg-blue-700 focus:bg-blue-700 bg-muted-blue-700 focus:outline-hidden">
                          {{ t('validate') }}
                        </button>
                      </button>
                    </div>
                  </div>
                </FormKit>
              </div>
            </div>
            <div class="flex flex-row justify-center mt-5 w-full">
              <router-link to="/login" class="font-medium text-orange-500 transition-all duration-200 hover:text-orange-600 hover:underline">
                {{ t('back-to-login-page') }}
              </router-link>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: naked
</route>
