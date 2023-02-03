<script setup lang="ts">
import { useVuelidate } from '@vuelidate/core'
import { minLength, required, sameAs } from '@vuelidate/validators'
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useSupabase } from '~/services/supabase'
import TitleHead from '~/components/TitleHead.vue'
import { useDisplayStore } from '~/stores/display'

const isLoading = ref(false)
const showPassword = ref(false)
const showPassword2 = ref(false)
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
  isLoading.value = true
  const isFormCorrect = await v$.value.$validate()
  if (!isFormCorrect)
    isLoading.value = false

  const { error: updateError } = await supabase.auth.updateUser({ password: form.password })

  isLoading.value = false
  if (updateError)
    errorMessage.value = t('accountPassword.errorMsg')
  else
    displayStore.messageToast.push(t('changed-password-suc'))
  router.push('/app/account')
}
</script>

<template>
  <TitleHead :title="t('accountPassword.heading')" />
  <div class="w-full px-6 py-16 mx-auto lg:w-1/2">
    <form @submit.prevent="submit">
      <div v-if="errorMessage" class="text-center">
        <p class="mt-2 mb-4 text-xs italic text-muted-blue-500">
          {{ errorMessage }}
        </p>
      </div>
      <div>
        <div>
          <input v-model="form.password" :type="showPassword ? 'text' : 'password'" class="mt-2 ml-2 border-b border-black-light" :placeholder="t('accountPassword.password') " :required="true">
          <img v-if="showPassword" src="/eye-open.png" alt="password" @click="showPassword = !showPassword">
          <img v-else src="/eye-close.png" alt="password" @click="showPassword = !showPassword">
        </div>
        <div v-for="(error, index) of v$.password.$errors" :key="index" class="text-center">
          <p class="mt-2 mb-4 text-xs italic text-muted-blue-500">
            {{ error.$message }}
          </p>
        </div>
        <div>
          <input v-model="form.confirmPassword" :type="showPassword2 ? 'text' : 'password'" class="mt-2 border-b border-black-light" :placeholder="t('accountPassword.confirmPassword')" :required="true">
          <img v-if="showPassword2" src="/eye-open.png" alt="password" @click="showPassword2 = !showPassword2">
          <img v-else src="/eye-close.png" alt="password" @click="showPassword2 = !showPassword2">
        </div>
        <div v-for="(error, index) of v$.confirmPassword.$errors" :key="index" class="text-center">
          <p class="mt-2 mb-4 text-xs italic text-muted-blue-500">
            {{ error.$message }}
          </p>
        </div>
      </div>
      <button
        color="secondary"
        shape="round"
        expand="block"
        type="submit"
        class="mx-auto mt-12 font-light ion-margin-top w-45"
      >
        <svg v-if="isLoading" class="inline-block w-5 h-5 mr-3 -ml-1 text-white align-middle animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
        <span v-if="!isLoading">{{ t('accountPassword.validate') }}</span>
      </button>
    </form>
  </div>
</template>
