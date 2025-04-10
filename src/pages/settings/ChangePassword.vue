<script setup lang="ts">
import { setErrors } from '@formkit/core'
import { FormKit, FormKitMessages } from '@formkit/vue'
import { useI18n } from 'petite-vue-i18n'
import { ref } from 'vue'
import { toast } from 'vue-sonner'
import iconPassword from '~icons/ph/key?raw'
import { useSupabase } from '~/services/supabase'

const isLoading = ref(false)
const displayStore = useDisplayStore()
const supabase = useSupabase()

const { t } = useI18n()

// https://xvwzpoazmxkqosrdewyv.supabase.co/auth/v1/verify?token=69af7abb6508b17c05fec3ac963d335eafee0e5802a7977fc9b7aa35&type=recovery&redirect_to=http%3A%2F%2Flocalhost:5173%2Fforgot_password%3Fstep%3D2
async function submit(form: { password: string, password_confirm: string }) {
  console.log('submitting', form)
  if (isLoading.value)
    return
  isLoading.value = true

  const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  const { currentLevel, nextLevel } = aal.data!
  if (nextLevel !== currentLevel) {
    const { data: mfaFactors, error: mfaError } = await supabase.auth.mfa.listFactors()
    if (mfaError) {
      setErrors('forgot-password', [mfaError.message], {})
      console.error('Cannot get MFA factors', mfaError)
      return
    }
    const factor = mfaFactors.all.find(factor => factor.status === 'verified')
    if (!factor) {
      setErrors('forgot-password', ['Cannot find MFA factor'], {})
      console.error('Cannot get MFA factors', mfaError)
      return
    }

    const { data: challenge, error: errorChallenge } = await supabase.auth.mfa.challenge({ factorId: factor.id })
    if (errorChallenge) {
      setErrors('forgot-password', [errorChallenge.message], {})
      console.error('Cannot challenge MFA factor', errorChallenge)
      return
    }

    displayStore.dialogOption = {
      header: t('alert-2fa-required'),
      message: t('alert-2fa-required-message'),
      preventAccidentalClose: true,
      input: true,
      buttons: [
        {
          text: t('button-confirm'),
          role: 'confirm',
          handler: async () => {
            const { data: _verify, error: errorVerify } = await supabase.auth.mfa.verify({
              factorId: factor.id,
              challengeId: challenge.id,
              code: displayStore.dialogInputText.replace(' ', ''),
            })
            if (errorVerify) {
              displayStore.showDialog = true
              toast.error(t('invalid-mfa-code'))
            }
          },
        },
      ],
    }
    displayStore.showDialog = true
    await displayStore.onDialogDismiss()
  }
  const { error: updateError } = await supabase.auth.updateUser({ password: form.password })

  isLoading.value = false
  if (updateError)
    setErrors('change-pass', [t('account-password-error')], {})
  else
    toast.success(t('changed-password-suc'))
  form.password = ''
  form.password_confirm = ''
}
</script>

<template>
  <div>
    <div class="h-full pb-8 max-h-fit grow md:pb-0">
      <!-- <form
      @submit.prevent="submit"
    > -->
      <FormKit id="change-pass" type="form" :actions="false" @submit="submit">
        <!-- Panel body -->
        <div class="p-6 space-y-6">
          <h2 class="mb-5 text-2xl font-bold text-slate-800 dark:text-white">
            {{ t('account-password-heading') }}
          </h2>
          <!-- Personal Info -->
          <section>
            <div class="mt-5 space-y-4 sm:flex sm:items-center sm:items-stretch sm:space-x-4 sm:space-y-0">
              <FormKit
                type="password"
                name="password"
                :prefix-icon="iconPassword"
                autocomplete="new-password"
                outer-class="sm:w-1/2"
                :label="t('password')"
                :help="t('6-characters-minimum')"
                validation="required|length:6|contains_alpha|contains_uppercase|contains_lowercase|contains_symbol"
                validation-visibility="live"
              />
              <FormKit
                type="password"
                name="password_confirm"
                :prefix-icon="iconPassword"
                outer-class="sm:w-1/2"
                :label="t('confirm-password')"
                validation="required|confirm"
                validation-visibility="live"
                :validation-label="t('password-confirmatio')"
              />
            </div>
            <FormKitMessages />
          </section>
        </div>
        <!-- Panel footer -->
        <footer>
          <div class="flex flex-col px-6 py-5 border-t border-slate-300">
            <div class="flex self-end">
              <button
                class="p-2 ml-3 text-white bg-blue-500 rounded-sm btn hover:bg-blue-600"
                type="submit"
                color="secondary"
                shape="round"
              >
                <span v-if="!isLoading" class="rounded-4xl">
                  {{ t('update') }}
                </span>
                <Spinner v-else size="w-8 h-8" class="px-4" color="fill-gray-100 text-gray-200 dark:text-gray-600" />
              </button>
            </div>
          </div>
        </footer>
        <!-- </form> -->
      </FormKit>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
    </route>
