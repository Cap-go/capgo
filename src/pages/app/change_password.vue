<script setup lang="ts">
import { IonButton, IonContent, IonInput, IonItem, IonPage, IonToast } from '@ionic/vue'
import { useVuelidate } from '@vuelidate/core'
import { minLength, required, sameAs } from '@vuelidate/validators'
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useSupabase } from '~/services/supabase'
import TitleHead from '~/components/TitleHead.vue'

const isLoading = ref(false)
const showPassword = ref(false)
const showPassword2 = ref(false)
const supabase = useSupabase()
const success = ref(false)
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

const router = useRouter()

const submit = async() => {
  isLoading.value = true
  const isFormCorrect = await v$.value.$validate()
  if (!isFormCorrect)
    isLoading.value = false

  const { error: updateError } = await supabase.auth.update({ password: form.password })

  isLoading.value = false
  if (updateError)
    errorMessage.value = t('accountPassword.errorMsg')

  router.push('/app/account')
}
</script>

<template>
  <IonPage>
    <TitleHead :title="t('accountPassword.heading')" />
    <IonContent :fullscreen="true">
      <div class="py-16 px-6 mx-auto w-full lg:w-1/2">
        <form @submit.prevent="submit">
          <div v-if="errorMessage" class="text-center">
            <p class="text-muted-blue-500 text-xs italic mt-2 mb-4">
              {{ errorMessage }}
            </p>
          </div>
          <div class="ion-padding">
            <IonItem class="ion-no-padding">
              <IonInput v-model="form.password" :type="showPassword ? 'text' : 'password'" class="mt-2 ml-2 border-b border-black-light" :placeholder="t('accountPassword.password') " required="true" />
              <img v-if="showPassword" src="/eye-open.png" alt="password" @click="showPassword = !showPassword">
              <img v-else src="/eye-close.png" alt="password" @click="showPassword = !showPassword">
            </IonItem>
            <div v-for="(error, index) of v$.password.$errors" :key="index" class="text-center">
              <p class="text-muted-blue-500 text-xs italic mt-2 mb-4">
                {{ error.$message }}
              </p>
            </div>
            <IonItem class="ion-no-padding">
              <IonInput v-model="form.confirmPassword" :type="showPassword2 ? 'text' : 'password'" class="mt-2 border-b border-black-light" :placeholder="t('accountPassword.confirmPassword')" required="true" />
              <img v-if="showPassword2" src="/eye-open.png" alt="password" @click="showPassword2 = !showPassword2">
              <img v-else src="/eye-close.png" alt="password" @click="showPassword2 = !showPassword2">
            </IonItem>
            <div v-for="(error, index) of v$.confirmPassword.$errors" :key="index" class="text-center">
              <p class="text-muted-blue-500 text-xs italic mt-2 mb-4">
                {{ error.$message }}
              </p>
            </div>
          </div>
          <IonButton
            color="secondary"
            shape="round"
            expand="block"
            type="submit"
            class="ion-margin-top font-light w-45 mx-auto mt-12"
          >
            <svg v-if="isLoading" class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline-block align-middle" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
          </IonButton>
        </form>
      </div>
      <IonToast
        :is-open="success"
        :message="t('accountPassword.success')"
        :duration="2000"
        color="success"
        @didDismiss="success = false"
      />
    </IonContent>
  </IonPage>
</template>

<route lang="yaml">
meta:
  option: tabs
</route>
