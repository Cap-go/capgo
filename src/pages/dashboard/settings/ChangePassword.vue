<script setup lang="ts">
import { ref } from 'vue'
import { setErrors } from '@formkit/core'
import { useI18n } from 'vue-i18n'
import { FormKitMessages } from '@formkit/vue'
import { useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'

const isLoading = ref(false)
const supabase = useSupabase()

const { t } = useI18n()

const displayStore = useDisplayStore()

const submit = async (form: { password: string; password_confirm: string }) => {
  console.log('submitting', form)
  if (isLoading.value)
    return
  isLoading.value = true

  const { error: updateError } = await supabase.auth.updateUser({ password: form.password })

  isLoading.value = false
  if (updateError)
    setErrors('change-pass', [t('account-password-error')], {})
  else
    displayStore.messageToast.push(t('changed-password-suc'))
}
</script>

<template>
  <div class="h-full pb-8 overflow-y-scroll md:pb-0 grow max-h-fit">
    <!-- <form
      @submit.prevent="submit"
    > -->
    <FormKit id="change-pass" messages-class="text-red-500" type="form" :actions="false" @submit="submit">
      <!-- Panel body -->
      <div class="p-6 space-y-6">
        <h2 class="mb-5 text-2xl font-bold text-slate-800 dark:text-white">
          {{ t('account-password-heading') }}
        </h2>
        <!-- Personal Info -->
        <section>
          <div class="mt-5 space-y-4 sm:items-stretch sm:flex sm:items-center sm:space-y-0 sm:space-x-4">
            <FormKit
              type="password"
              name="password"
              autocomplete="new-password"
              outer-class="sm:w-1/2"
              input-class="w-full p-2 form-input dark:bg-gray-700 dark:text-white"
              placeholder="******"
              :label="t('password')"
              :help="t('6-characters-minimum')"
              validation="required|length:6|matches:/(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[#?!@$%^&*-])/"
              validation-visibility="live"
              message-class="text-red-500"
            />
            <FormKit
              type="password"
              name="password_confirm"
              outer-class="sm:w-1/2"
              input-class="w-full p-2 form-input dark:bg-gray-700 dark:text-white"
              :label="t('confirm-password')"
              :help="t('confirm-password')"
              validation="required|confirm"
              validation-visibility="live"
              :validation-label="t('password-confirmatio')"
              message-class="text-red-500"
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

