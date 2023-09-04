<script setup lang="ts">
import { ref } from 'vue'
import { setErrors } from '@formkit/core'
import { useI18n } from 'vue-i18n'
import { FormKitMessages } from '@formkit/vue'
import { toast } from 'vue-sonner'
import { useSupabase } from '~/services/supabase'
import { iconPassword } from '~/services/icons'

const isLoading = ref(false)
const supabase = useSupabase()

const { t } = useI18n()

async function submit(form: { password: string; password_confirm: string }) {
  console.log('submitting', form)
  if (isLoading.value)
    return
  isLoading.value = true

  const { error: updateError } = await supabase.auth.updateUser({ password: form.password })

  isLoading.value = false
  if (updateError)
    setErrors('change-pass', [t('account-password-error')], {})
  else
    toast.success(t('changed-password-suc'))
}
</script>

<template>
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
        <div class="flex flex-col px-6 py-5 border-t border-slate-200">
          <div class="flex self-end">
            <button
              class="p-2 ml-3 text-white bg-blue-500 rounded btn hover:bg-blue-600"
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
</template>

<route lang="yaml">
meta:
  layout: settings
    </route>
