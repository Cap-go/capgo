<script setup lang="ts">

import { IonButton, IonContent, IonInput, IonItem, IonPage, IonSpinner, toastController } from '@ionic/vue'
import { useVuelidate } from '@vuelidate/core'
import { email, minLength, required, sameAs } from '@vuelidate/validators'
import { computed, reactive, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useSupabase } from '~/services/supabase'
import TitleHead from '~/components/TitleHead.vue'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const supabase = useSupabase()
const showPassword = ref(false)
const showPassword2 = ref(false)
const step = ref(1)

const form = reactive({
  email: '',
  repeatPassword: '',
  password: '',
})

const isLoading = ref(false)
const errorMessage = ref('')

const rules = computed(() => {
  if (step.value === 1) { return { email: { required, email } } }
  else {
    return {
      password: { required, minLength: minLength(6) },
      repeatPassword: { required, minLength: minLength(6), sameAsPassword: sameAs(form.password) },
    }
  }
})
const v$ = useVuelidate(rules as any, form)
const showToastMessage = async(message: string) => {
  const toast = await toastController
    .create({
      message,
      duration: 2000,
    })
  await toast.present()
}

const submit = async() => {
  isLoading.value = true
  const isFormCorrect = await v$.value.$validate()
  if (!isFormCorrect) {
    isLoading.value = false
    return
  }
  if (step.value === 1) {
    const redirectTo = `${import.meta.env.VITE_APP_URL}/forgot_password?step=2`
    // console.log('redirect', redirectTo)
    const { error } = await supabase.auth.api
      .resetPasswordForEmail(form.email, { redirectTo })
    setTimeout(() => { isLoading.value = false }, 5000)
    if (error)
      showToastMessage(error.message)
    else showToastMessage(t('forgot.check_email'))
  }
  else if (step.value === 2 && route.hash) {
    const queryString = route.hash.replace('#', '')
    const urlParams = new URLSearchParams(queryString)
    const access_token = urlParams.get('access_token') || ''
    const { error } = await supabase.auth.api
      .updateUser(access_token, { password: form.password })
    setTimeout(() => { isLoading.value = false }, 5000)
    if (error) { showToastMessage(error.message) }
    else {
      showToastMessage(t('forgot.success'))
      await supabase.auth.signOut()
      router.push('/login')
    }
  }
}

watchEffect(() => {
  isLoading.value = true
  if (route && route.path === '/forgot_password') {
    if (router.currentRoute.value.query && router.currentRoute.value.query.step)
      step.value = parseInt(router.currentRoute.value.query.step as string)
    isLoading.value = false
  }
})

</script>

<template>
  <IonPage>
    <IonContent :fullscreen="true">
      <div class="grid lg:w-1/2 mx-auto w-full h-full min-h-screen p-8">
        <TitleHead :big="true" :title="t('forgot.heading')" />
        <form
          class="mt-8 relative grid item-center"
          @submit.prevent="submit"
        >
          <p v-if="errorMessage" class="text-pumpkin-orange-900 text-xs italic mt-2 mb-4">
            {{ errorMessage }}
          </p>

          <div v-if="step === 1" class="py-1">
            <IonInput
              v-model="form.email"
              :disabled="isLoading"
              required
              inputmode="email"
              class="text-left border-b-2 z-0 ion-padding-start"
              :placeholder="t('forgot.email')"
              type="email"
            />
            <div v-for="(error, index) of v$.email.$errors" :key="index">
              <p class="text-pumpkin-orange-900 text-xs italic mt-2 mb-4">
                {{ t('forgot.email') }}: {{ error.$message }}
              </p>
            </div>
          </div>
          <div v-if="step === 2">
            <div class="py-1">
              <IonItem class="ion-no-padding">
                <IonInput v-model="form.password" :disabled="isLoading" required class="text-left border-b-2 z-0 ion-padding-start" :placeholder="t('login.password')" :type="showPassword ? 'text' : 'password'" />
                <img v-if="showPassword" src="/eye-open.png" alt="password" @click="showPassword = !showPassword">
                <img v-else src="/eye-close.png" alt="password" @click="showPassword = !showPassword">
              </IonItem>
              <div v-for="(error, index) of v$.password.$errors" :key="index">
                <p class="text-pumpkin-orange-900 text-xs italic mt-2 mb-4">
                  {{ t('register.password') }}: {{ error.$message }}
                </p>
              </div>
            </div>
            <div class="py-1">
              <IonItem class="ion-no-padding">
                <IonInput v-model="form.repeatPassword" :disabled="isLoading" required class="text-left border-b-2 z-0 ion-padding-start" :placeholder="t('register.confirm-password')" :type="showPassword2 ? 'text' : 'password'" />
                <img v-if="showPassword2" src="/eye-open.png" alt="password" @click="showPassword2 = !showPassword2">
                <img v-else src="/eye-close.png" alt="password" @click="showPassword2 = !showPassword2">
              </IonItem>
              <div v-for="(error, index) of v$.repeatPassword.$errors" :key="index">
                <p class="text-pumpkin-orange-900 text-xs italic mt-2 mb-4">
                  {{ t('register.confirm-password') }}: {{ error.$message }}
                </p>
              </div>
            </div>
          </div>
          <IonButton
            :disabled="isLoading"
            size="large"
            color="secondary"
            shape="round"
            type="submit"
            class="mt-8 text-white text-center"
          >
            <span v-if="!isLoading" class="ion-padding-horizontal rounded-4xl font-bold">
              {{ t('register.next') }}
            </span>
            <IonSpinner v-else name="crescent" color="light" />
          </IonButton>
          <a
            class="
                block
                align-baseline
                font-bold
                text-sm
                text-center
                text-pumpkin-orange-500
                hover:underline
                mt-4"
            href="/login"
          >
            {{ t('register.already-account') }}
          </a>
        </form>
      </div>
    </IonContent>
  </IonPage>
</template>
