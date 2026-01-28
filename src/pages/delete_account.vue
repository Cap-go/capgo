<script setup lang="ts">
import { setErrors } from '@formkit/core'
import { FormKit, FormKitMessages } from '@formkit/vue'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import VueTurnstile from 'vue-turnstile'
import iconEmail from '~icons/oui/email?raw'
import iconPassword from '~icons/ph/key?raw'
import { hideLoader } from '~/services/loader'
import { useSupabase } from '~/services/supabase'
import { useDialogV2Store } from '~/stores/dialogv2'

const supabase = useSupabase()
const dialogStore = useDialogV2Store()
const isLoading = ref(false)
const pendingEmail = ref('')
const pendingPassword = ref('')
const turnstileToken = ref('')
const confirmCaptchaToken = ref('')
const captchaKey = ref(import.meta.env.VITE_CAPTCHA_KEY)
const captchaComponent = ref<InstanceType<typeof VueTurnstile> | null>(null)
const confirmCaptchaComponent = ref<InstanceType<typeof VueTurnstile> | null>(null)
const { t } = useI18n()
const router = useRouter()

const version = import.meta.env.VITE_APP_VERSION
const registerUrl = window.location.host === 'console.capgo.app' ? 'https://capgo.app/register/' : `/register/`

async function deleteAccount() {
  dialogStore.openDialog({
    id: 'delete-account-confirm',
    title: t('are-u-sure'),
    buttons: [
      {
        text: t('button-remove'),
        role: 'danger',
        handler: async () => {
          const supabaseClient = useSupabase()
          isLoading.value = true

          try {
            if (!pendingEmail.value || !pendingPassword.value) {
              isLoading.value = false
              return setErrors('delete-account', [t('invalid-auth')], {})
            }

            if (captchaKey.value && !confirmCaptchaToken.value) {
              isLoading.value = false
              return setErrors('delete-account', [t('captcha-required', 'Captcha verification is required')], {})
            }

            const { error: reauthError } = await supabase.auth.signInWithPassword({
              email: pendingEmail.value,
              password: pendingPassword.value,
              options: captchaKey.value ? { captchaToken: confirmCaptchaToken.value } : undefined,
            })
            if (reauthError) {
              confirmCaptchaToken.value = ''
              confirmCaptchaComponent.value?.reset()
              isLoading.value = false
              if (reauthError.message.includes('captcha'))
                toast.error(t('captcha-fail'))
              return setErrors('delete-account', [t('invalid-auth')], {})
            }

            const { data: claimsData, error: claimsError } = await supabase.auth.getClaims()
            const userId = claimsData?.claims?.sub
            if (claimsError || !userId) {
              isLoading.value = false
              return setErrors('delete-account', [t('something-went-wrong-try-again-later')], {})
            }

            const { data: user } = await supabaseClient
              .from('users')
              .select()
              .eq('id', userId)
              .single()

            if (!user) {
              isLoading.value = false
              return setErrors('delete-account', [t('something-went-wrong-try-again-later')], {})
            }

            // Delete user using RPC function
            const { error: deleteError } = await supabase.rpc('delete_user')

            if (deleteError) {
              console.error('Delete error:', deleteError)
              if (deleteError.message?.includes('reauth_required')) {
                isLoading.value = false
                return setErrors('delete-account', [t('invalid-auth')], {})
              }
              isLoading.value = false
              return setErrors('delete-account', [t('something-went-wrong-try-again-later')], {})
            }

            // Sign out and redirect to login page
            await supabase.auth.signOut()
            toast.success(t('account-deleted-successfully'))
            router.replace('/login')
          }
          catch (error) {
            console.error(error)
            isLoading.value = false
            return setErrors('delete-account', [t('something-went-wrong-try-again-later')], {})
          }
          finally {
            isLoading.value = false
            pendingEmail.value = ''
            pendingPassword.value = ''
            confirmCaptchaToken.value = ''
            confirmCaptchaComponent.value?.reset()
          }
        },
      },
      {
        text: t('button-cancel'),
        role: 'cancel',
        handler: () => {
          console.log('Cancel clicked')
        },
      },
    ],
  })
  const dismissed = await dialogStore.onDialogDismiss()
  if (dismissed) {
    pendingEmail.value = ''
    pendingPassword.value = ''
    confirmCaptchaToken.value = ''
    confirmCaptchaComponent.value?.reset()
  }
  return dismissed
}

async function submit(form: { email: string, password: string }) {
  isLoading.value = true
  if (captchaKey.value && !turnstileToken.value) {
    isLoading.value = false
    setErrors('delete-account', [t('captcha-required', 'Captcha verification is required')], {})
    return
  }
  const { error } = await supabase.auth.signInWithPassword({
    email: form.email,
    password: form.password,
    options: captchaKey.value ? { captchaToken: turnstileToken.value } : undefined,
  })
  isLoading.value = false
  if (error) {
    console.error('error', error)
    setErrors('login-account', [error.message], {})
    if (error.message.includes('captcha')) {
      captchaComponent.value?.reset()
      toast.error(t('captcha-fail'))
      return
    }
    toast.error(t('invalid-auth'))
  }
  else {
    pendingEmail.value = form.email
    pendingPassword.value = form.password
    turnstileToken.value = ''
    captchaComponent.value?.reset()
    // delete account
    deleteAccount()
  }
}

onMounted (() => {
  hideLoader()
})
</script>

<template>
  <!-- component -->
  <section class="flex overflow-y-auto py-10 my-auto w-full h-full sm:py-8 lg:py-2">
    <div class="px-4 my-auto mx-auto max-w-7xl sm:px-6 lg:px-8">
      <div class="mx-auto max-w-2xl text-center">
        <img src="/capgo.webp" alt="logo" class="mx-auto mb-6 w-1/6 rounded-sm invert dark:invert-0">
        <h1 class="text-3xl font-bold leading-tight text-black sm:text-4xl lg:text-5xl dark:text-white">
          {{ t('leaving') }} <p class="inline font-prompt">
            Capgo
          </p> ?
        </h1>
        <p class="mx-auto mt-4 max-w-xl text-base leading-relaxed text-gray-600 dark:text-gray-300">
          {{ t('delete-your-account') }}
        </p>
      </div>

      <div class="relative mx-auto mt-8 max-w-md md:mt-4">
        <div class="overflow-hidden bg-white rounded-md shadow-md dark:bg-slate-800">
          <div class="py-6 px-4 sm:py-7 sm:px-8">
            <FormKit id="delete-account" type="form" :actions="false" @submit="submit">
              <div class="space-y-5">
                <FormKit
                  type="email" name="email" :disabled="isLoading" enterkeyhint="next"
                  :prefix-icon="iconEmail" inputmode="email" :label="t('email')" autocomplete="email"
                  validation="required:trim"
                />

                <div>
                  <div class="flex justify-between items-center">
                    <router-link
                      to="/forgot_password"
                      class="text-sm font-medium text-orange-500 transition-all duration-200 hover:text-orange-600 hover:underline focus:text-orange-600"
                    >
                      {{ t('forgot') }} {{ t('password') }} ?
                    </router-link>
                  </div>
                  <FormKit
                    id="passwordInput" type="password" :placeholder="t('password')"
                    name="password" :label="t('password')" :prefix-icon="iconPassword" :disabled="isLoading"
                    validation="required:trim" enterkeyhint="send" autocomplete="current-password"
                  />
                </div>
                <div v-if="captchaKey">
                  <label class="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    {{ t('captcha', 'Captcha') }}
                  </label>
                  <VueTurnstile ref="captchaComponent" v-model="turnstileToken" size="flexible" :site-key="captchaKey" />
                </div>
                <FormKitMessages />
                <div>
                  <div class="inline-flex justify-center items-center w-full">
                    <svg
                      v-if="isLoading" class="inline-block mr-3 -ml-1 w-5 h-5 text-gray-900 align-middle animate-spin"
                      xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                    >
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                      <path
                        class="opacity-75" fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <button
                      v-if="!isLoading" type="submit"
                      class="inline-flex justify-center items-center py-4 px-4 w-full text-base font-semibold text-white rounded-md transition-all duration-200 hover:bg-blue-700 focus:bg-blue-700 bg-muted-blue-700 focus:outline-hidden"
                    >
                      {{ t('delete-account-0') }}
                    </button>
                  </div>
                </div>

                <div class="text-center">
                  <p class="text-base text-gray-600">
                    {{ t('dont-have-an-account') }} <br> <a
                      :href="registerUrl"
                      class="font-medium text-orange-500 transition-all duration-200 hover:text-orange-600 hover:underline"
                    >
                      {{ t('create-a-free-account') }}
                    </a>
                  </p>
                  <p class="pt-2 text-gray-300">
                    {{ version }}
                  </p>
                </div>
              </div>
            </FormKit>
          </div>
        </div>
      </div>

      <Teleport v-if="dialogStore.showDialog && dialogStore.dialogOptions?.id === 'delete-account-confirm'" to="#dialog-v2-content" defer>
        <div v-if="captchaKey" class="mt-4">
          <label class="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            {{ t('captcha', 'Captcha') }}
          </label>
          <VueTurnstile
            ref="confirmCaptchaComponent"
            v-model="confirmCaptchaToken"
            size="flexible"
            :site-key="captchaKey"
          />
        </div>
      </Teleport>
    </div>
  </section>
</template>

<route lang="yaml">
meta:
  layout: naked
</route>
