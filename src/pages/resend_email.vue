<!-- eslint-disable unused-imports/no-unused-vars -->
<script setup lang="ts">
import { setErrors } from '@formkit/core'
import { FormKit, FormKitMessages } from '@formkit/vue'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import iconEmail from '~icons/oui/email?raw'
import { useSupabase } from '~/services/supabase'

const { t } = useI18n()
const supabase = useSupabase()
const isLoading = ref(false)
const isLoadingMain = ref(false)

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
              <FormKit id="resend-email" type="form" :actions="false" @submit="submit">
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
