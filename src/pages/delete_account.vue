<script setup lang="ts">
import { setErrors } from '@formkit/core'
import { FormKit, FormKitMessages } from '@formkit/vue'
import iconEmail from '~icons/oui/email?raw'
import iconPassword from '~icons/ph/key?raw'
import { useI18n } from 'petite-vue-i18n'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { hideLoader } from '~/services/loader'
import { deleteUser, hashEmail, useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'

const supabase = useSupabase()
const displayStore = useDisplayStore()
const isLoading = ref(false)
const { t } = useI18n()
const router = useRouter()

const version = import.meta.env.VITE_APP_VERSION

async function deleteAccount() {
  displayStore.dialogOption = {
    header: t('are-u-sure'),
    buttons: [
      {
        text: t('button-remove'),
        role: 'danger',
        handler: async () => {
          const supabaseClient = useSupabase()

          const authUser = await supabase.auth.getUser()
          if (authUser.error)
            return setErrors('update-account', [t('something-went-wrong-try-again-later')], {})

          try {
            const { data: user } = await supabaseClient
              .from('users')
              .select()
              .eq('id', authUser.data.user.id)
              .single()
            if (!user)
              return setErrors('update-account', [t('something-went-wrong-try-again-later')], {})

            if (user.customer_id) {
              await supabaseClient
                .from('stripe_info')
                .delete()
                .eq('customer_id', user.customer_id)
            }

            const hashedEmail = await hashEmail(authUser.data.user.email!)

            await supabaseClient
              .from('deleted_account')
              .insert({
                email: hashedEmail,
              })

            await supabaseClient
              .from('users')
              .delete()
              .eq('id', user.id)

            await deleteUser()

            await supabase.auth.signOut()
            router.replace('/login')
          }
          catch (error) {
            console.error(error)
            return setErrors('update-account', [t('something-went-wrong-try-again-later')], {})
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
  }
  displayStore.showDialog = true
  return displayStore.onDialogDismiss()
}

async function submit(form: { email: string, password: string }) {
  isLoading.value = true
  const { error } = await supabase.auth.signInWithPassword({
    email: form.email,
    password: form.password,
  })
  isLoading.value = false
  if (error) {
    console.error('error', error)
    setErrors('login-account', [error.message], {})
    toast.error(t('invalid-auth'))
  }
  else {
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
  <section class="flex w-full h-full py-10 my-auto overflow-y-auto lg:py-2 sm:py-8">
    <div class="px-4 mx-auto my-auto max-w-7xl lg:px-8 sm:px-6">
      <div class="max-w-2xl mx-auto text-center">
        <img src="/capgo.webp" alt="logo" class="w-1/6 mx-auto mb-6 rounded invert dark:invert-0">
        <h1 class="text-3xl font-bold leading-tight text-black lg:text-5xl sm:text-4xl dark:text-white">
          {{ $t('leaving') }} <p class="inline font-prompt">
            Capgo
          </p> ?
        </h1>
        <p class="max-w-xl mx-auto mt-4 text-base leading-relaxed text-gray-600 dark:text-gray-300">
          {{ $t('delete-your-account') }}
        </p>
      </div>

      <div class="relative max-w-md mx-auto mt-8 md:mt-4">
        <div class="overflow-hidden bg-white rounded-md shadow-md dark:bg-slate-800">
          <div class="px-4 py-6 sm:px-8 sm:py-7">
            <FormKit id="login-account" type="form" :actions="false" @submit="submit">
              <div class="space-y-5">
                <FormKit
                  type="email" name="email" :disabled="isLoading" enterkeyhint="next"
                  :prefix-icon="iconEmail" inputmode="email" :label="t('email')" autocomplete="email"
                  validation="required:trim"
                />

                <div>
                  <div class="flex items-center justify-between">
                    <router-link
                      to="/forgot_password"
                      class="text-sm font-medium text-orange-500 transition-all duration-200 focus:text-orange-600 hover:text-orange-600 hover:underline"
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
                <FormKitMessages />
                <div>
                  <div class="inline-flex items-center justify-center w-full">
                    <svg
                      v-if="isLoading" class="inline-block w-5 h-5 mr-3 -ml-1 text-gray-900 align-middle animate-spin"
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
                      class="inline-flex items-center justify-center w-full px-4 py-4 text-base font-semibold text-white transition-all duration-200 rounded-md bg-muted-blue-700 focus:bg-blue-700 hover:bg-blue-700 focus:outline-none"
                    >
                      {{ $t('delete-account-0') }}
                    </button>
                  </div>
                </div>

                <div class="text-center">
                  <p class="text-base text-gray-600">
                    {{ t('dont-have-an-account') }} <br> <a
                      href="https://capgo.app/register/"
                      class="font-medium text-orange-500 transition-all duration-200 hover:text-orange-600 hover:underline"
                    >
                      {{ t('create-a-free-accoun') }}
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
    </div>
  </section>
</template>

<route lang="yaml">
meta:
  layout: naked
</route>
