<script setup lang="ts">
import { useVuelidate } from '@vuelidate/core'
import { minLength, required, sameAs } from '@vuelidate/validators'
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'

const isLoading = ref(false)
const supabase = useSupabase()
const errorMessage = ref('')
const form = reactive({
  password: '',
  confirmPassword: '',
})

const { t } = useI18n()

const rules = computed(() => ({
  password: {
    required,
    minLength: minLength(6),
    containsUppercase(value: string) {
      return /[A-Z]/.test(value)
    },
    containsLowercase(value: string) {
      return /[a-z]/.test(value)
    },
    containsSpecial(value: string) {
      return /[#?!@$%^&*-]/.test(value)
    },
  },
  confirmPassword: { required, minLength: minLength(6), sameAsPassword: sameAs(form.password) },
}))

const v$ = useVuelidate(rules as any, form)
const displayStore = useDisplayStore()
const router = useRouter()

const submit = async () => {
  if (isLoading.value)
    return
  isLoading.value = true
  const isFormCorrect = await v$.value.$validate()
  if (!isFormCorrect)
    isLoading.value = false

  const { error: updateError } = await supabase.auth.updateUser({ password: form.password })

  isLoading.value = false
  if (updateError)
    errorMessage.value = t('account-password-error')
  else
    displayStore.messageToast.push(t('changed-password-suc'))
  router.push('/app/account')
}
</script>

<template>
  <div class="h-full pb-8 overflow-y-scroll md:pb-0 grow max-h-fit">
    <form
      @submit.prevent="submit"
    >
      <!-- Panel body -->
      <div class="p-6 space-y-6">
        <h2 class="mb-5 text-2xl font-bold text-slate-800 dark:text-white">
          {{ t('account-password-heading') }}
        </h2>
        <!-- Personal Info -->
        <section>
          <div class="mt-5 space-y-4 sm:flex sm:items-center sm:space-y-0 sm:space-x-4">
            <div class="sm:w-1/2">
              <label class="block mb-1 text-sm font-medium dark:text-white" for="name">{{ t('password-new') }}</label>
              <input
                v-model="form.password" class="w-full p-2 form-input dark:bg-gray-700 dark:text-white"
                :disabled="isLoading"
                autofocus
                required
                type="password"
              >
              <div v-for="(error, index) of v$.password.$errors" :key="index">
                <p class="mt-2 mb-4 text-xs italic text-pumpkin-orange-900">
                  {{ t('first-name') }}: {{ error.$message }}
                </p>
              </div>
            </div>
            <div class="sm:w-1/2">
              <label class="block mb-1 text-sm font-medium dark:text-white" for="business-id">{{ t('confirm-password') }}</label>
              <input
                v-model="form.confirmPassword" class="w-full p-2 form-input dark:bg-gray-700 dark:text-white"
                :disabled="isLoading"
                required
                type="text"
              >
              <div v-for="(error, index) of v$.confirmPassword.$errors" :key="index">
                <p class="mt-2 mb-4 text-xs italic text-pumpkin-orange-900">
                  {{ t('last-name') }}: {{ error.$message }}
                </p>
              </div>
            </div>
          </div>
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
    </form>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
    </route>

