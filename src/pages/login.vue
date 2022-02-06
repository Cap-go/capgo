<script setup lang="ts">
import { IonButton, IonContent, IonInput, IonItem, IonLabel, IonPage, isPlatform, toastController } from '@ionic/vue'
import { useVuelidate } from '@vuelidate/core'
import { email, required } from '@vuelidate/validators'
import { onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { SplashScreen } from '@capacitor/splash-screen'
import { useSupabase } from '~/services/supabase'
import { useMainStore } from '~/stores/main'

const supabase = useSupabase()
const main = useMainStore()
const isLoading = ref(false)
const router = useRouter()
const { t } = useI18n()

const form = reactive({
  email: '',
  password: '',
})

const showPassword = ref(false)

const rules = {
  email: { required, email },
  password: { required },

}
const v$ = useVuelidate(rules, form)
const showToastMessage = async(message: string) => {
  const toast = await toastController
    .create({
      message,
      duration: 2000,
    })
  await toast.present()
}
const submit = async() => {
  v$.value.$touch()
  if (!v$.value.$invalid) {
    isLoading.value = true
    const { error } = await supabase.auth.signIn({
      email: form.email,
      password: form.password,
    })
    isLoading.value = false
    if (error) {
      showToastMessage('Authentification invalide')
    }
    else {
      showToastMessage('Connexion réussie')
      router.push('/app/home')
    }
  }
}

const checkLogin = async() => {
  main.auth = null
  isLoading.value = true
  const user = supabase.auth.user()
  if (user) {
    router.push('/app/home')
    setTimeout(async() => {
      isLoading.value = false
      if (isPlatform('capacitor'))
        SplashScreen.hide()
    }, 500)
  }
  else {
    isLoading.value = false
    SplashScreen.hide()
  }
}

onMounted(checkLogin)

</script>

<template>
  <!-- component -->
  <IonPage>
    <IonContent :fullscreen="true">
      <div class="grid place-content-center w-full h-full min-h-screen p-8">
        <img src="/capgo.png" alt="logo" class="mx-auto rounded w-1/4 mb-6">
        <h1 class="text-3xl text-left font-medium text-black-light">
          {{ t('login.hello') }} !
        </h1>
        <h2 class="text-3xl text-left font-medium text-black-light">
          {{ t('login.login-in') }}
        </h2>
        <p class="text-sweet-pink-500 text-1xl text-left ion-margin-vertical font-light leading-5 font-semibold">
          {{ t('login.withemail') }} <br> {{ t('login.andpass') }}
        </p>
        <form class="place-content-center w-full h-full" @submit.prevent="submit">
          <IonItem class="ion-no-padding">
            <!-- <IonLabel><IonIcon slot="start" :icon="person"></IonIcon></IonLabel> -->
            <IonLabel>
              <img src="/person.png" alt="person">
            </IonLabel>
            <IonInput v-model="form.email" type="email" :disabled="isLoading" :placeholder="t('login.email')" required="true" />
          </IonItem>
          <div v-for="(error, index) of v$.email.$errors" :key="index">
            <p class="text-sweet-pink-900 text-xs italic mt-2 mb-4">
              {{ t('login.email') }}: {{ error.$message }}
            </p>
          </div>
          <IonItem class="ion-no-padding">
            <IonLabel>
              <img src="/lock.png" alt="password">
            </IonLabel>
            <IonInput v-model="form.password" :disabled="isLoading" :type="showPassword ? 'text' : 'password'" :placeholder="t('login.password') " required="true" />
            <img v-if="showPassword" src="/eye-open.png" alt="password" @click="showPassword = !showPassword">
            <img v-else src="/eye-close.png" alt="password" @click="showPassword = !showPassword">
          </IonItem>
          <div>
            <div v-for="(error, index) of v$.password.$errors" :key="index">
              <p class="text-brink-pink-500 text-xs italic mt-2 mb-4">
                {{ t('login.password') }}: {{ error.$message }}
              </p>
            </div>
          </div>
          <div class="grid justify-center text-center">
            <div class="block">
              <div>
                <IonButton
                  expand="block"
                  color="secondary"
                  shape="round"
                  type="submit"
                  class="ion-margin-top font-light w-45 mx-auto"
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
                  <span v-if="!isLoading">{{ t('login.connexion') }}</span>
                </IonButton>
              </div>
              <div>
                <router-link
                  to="/forgot_password"
                  class="ion-margin-top inline-block align-baseline font-medium text-sm text-bright-cerulean-500 hover:text-black"
                >
                  {{ t('login.password') }} {{ t('login.forgot') }} ?
                </router-link>
              </div>
            </div>
            <p class="my-5 text-black-dark">
              {{ t('login.or') }}
            </p>
            <div>
              <div>
                <router-link
                  to="/register"
                  class="ion-margin-top text-brink-pink-500 font-semibold font-light underline"
                >
                  {{ t('login.create-new') }}
                </router-link>
              </div>
            </div>
          </div>
        </form>
      </div>
    </IonContent>
  </IonPage>
</template>
