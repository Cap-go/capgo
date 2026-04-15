<script setup lang="ts">
import { setErrors } from '@formkit/core'
import { FormKit, FormKitMessages } from '@formkit/vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { toast } from 'vue-sonner'
import iconEmail from '~icons/oui/email?raw'
import { authGhostButtonClass, authInsetCardClass, authPanelClass, authPrimaryButtonClass } from '~/components/auth/pageStyles'
import { useSupabase } from '~/services/supabase'
import { openSupport } from '~/services/support'

const { t } = useI18n()
const supabase = useSupabase()
const route = useRoute()
const isLoading = ref(false)
const emailVerificationBlockingReason = computed(() => route.query.reason === 'email_not_verified')
const returnTo = computed(() => (typeof route.query.return_to === 'string' ? route.query.return_to : ''))

async function submit(form: { email: string }) {
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
  <AuthPageShell
    card-width-class="max-w-md"
    :card-kicker="t('resend')"
    :card-title="t('resend-email')"
  >
    <div
      v-if="emailVerificationBlockingReason"
      class="mb-5 border-amber-200/80 bg-amber-50/90 text-amber-900 dark:border-amber-700/70 dark:bg-amber-900/25 dark:text-amber-100"
      :class="authInsetCardClass"
    >
      <p class="font-semibold">
        {{ t('email-not-verified-banner-title') }}
      </p>
      <p class="mt-2 text-sm leading-6">
        {{ t('email-not-verified-banner-body') }}
      </p>
      <p v-if="returnTo" class="mt-3 text-xs font-medium tracking-[0.12em] uppercase">
        {{ t('attempted-destination') }} {{ returnTo }}
      </p>
    </div>

    <FormKit id="resend-email" type="form" :actions="false" @submit="submit">
      <div class="space-y-5 text-slate-500 dark:text-slate-300">
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
          <button type="submit" :disabled="isLoading" :aria-busy="isLoading ? 'true' : 'false'" :class="authPrimaryButtonClass">
            <svg v-if="isLoading" class="inline-block mr-1 h-5 w-5 animate-spin align-middle text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
            {{ t('resend') }}
          </button>
        </div>

        <div :class="authPanelClass">
          <router-link to="/login" class="text-sm font-semibold text-[rgb(255,114,17)] transition-colors duration-200 hover:text-[rgb(235,94,0)]">
            {{ t('back-to-login-page') }}
          </router-link>
        </div>
      </div>
    </FormKit>

    <template #footer>
      <section class="mt-6 flex flex-col items-center">
        <div class="mx-auto">
          <LangSelector />
        </div>
        <button class="mt-3" :class="authGhostButtonClass" @click="openSupport">
          {{ t('support') }}
        </button>
      </section>
    </template>
  </AuthPageShell>
</template>

<route lang="yaml">
meta:
  layout: naked
</route>
