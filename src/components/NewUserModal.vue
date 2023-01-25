<script setup lang="ts">
import {
  kPreloader,
} from 'konsta/vue'
import { useVuelidate } from '@vuelidate/core'
import { required } from '@vuelidate/validators'
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { generate } from 'generate-password-browser'
import { useSupabase } from '~/services/supabase'

const props = defineProps({
  emailAddress: String,
})
const emit = defineEmits(['inviteUser', 'close'])
const supabase = useSupabase()
const form = reactive({
  first_name: '',
  last_name: '',
})

const userEmail = ref(props.emailAddress)

const isLoading = ref(false)
const errorMessage = ref('')

const rules = computed(() => ({
  first_name: { required },
  last_name: { required },
}))

const v$ = useVuelidate(rules, form)

const { t } = useI18n()

const submit = async () => {
  if (!userEmail.value)
    return
  isLoading.value = true
  try {
    const isFormCorrect = await v$.value.$validate()
    if (!isFormCorrect) {
      isLoading.value = false
      return
    }
    const password = generate({
      length: 12,
      numbers: true,
      symbols: true,
    })
    const { error, data: user } = await supabase.auth.signUp({
      email: userEmail.value,
      password,
      options: {
        data: {
          first_name: form.first_name,
          last_name: form.last_name,
          activation: {
            formFilled: true,
            enableNotifications: false,
            legal: false,
            optForNewsletters: false,
          },
        },
        emailRedirectTo: `${import.meta.env.VITE_APP_URL}/onboarding/set_password`,
      },
    })
    if (error || !user.user || !user.user.id || !user.user.email) {
      isLoading.value = false
      if (error)
        errorMessage.value = error.message
      else
        errorMessage.value = t('error-occurred')
      return
    }
    const { error: userTableError } = await supabase
      .from('users')
      .insert(
        {
          id: user.user?.id,
          first_name: user.user?.user_metadata.first_name,
          last_name: user.user?.user_metadata.last_name,
          email: user.user?.email,
        })
    isLoading.value = false
    if (error || userTableError)
      errorMessage.value = userTableError!.message
    else
      emit('inviteUser', user.user?.id)
  }
  catch (err) {
    console.error(err)
  }
}
</script>

<template>
  <IonHeader>
    <IonToolbar mode="ios">
      <IonTitle>
        Invite user
      </IonTitle>
      <IonButton slot="end" @click="emit('close')">
        Close
      </IonButton>
    </IonToolbar>
  </IonHeader>
  <div class="grid w-full h-full min-h-screen p-8 mx-auto lg:w-1/2">
    <form
      class="relative mt-2"
      @submit.prevent="submit"
    >
      <p v-if="errorMessage" class="mt-2 mb-4 text-xs italic text-sweet-pink-900">
        {{ errorMessage }}
      </p>
      <div class="grid max-w-lg mx-auto item-cente">
        <div class="py-1">
          <input
            v-model="form.first_name"
            autofocus
            required
            class="z-0 text-left border-b-2 ion-padding-start"
            :placeholder="t('register.first-name')"
            type="text"
          >
          <div v-for="(error, index) of v$.first_name.$errors" :key="index">
            <p class="mt-2 mb-4 text-xs italic text-sweet-pink-900">
              {{ t('register.first-name') }}: {{ error.$message }}
            </p>
          </div>
        </div>
        <div class="py-1">
          <input v-model="form.last_name" required type="text" :placeholder="t('register.last-name')" class="w-full max-w-xs input input-bordered">
          <div v-for="(error, index) of v$.last_name.$errors" :key="index">
            <p class="mt-2 mb-4 text-xs italic text-sweet-pink-900">
              {{ t('register.last-name') }}: {{ error.$message }}
            </p>
          </div>
        </div>
        <div class="py-1">
          <input
            v-model="userEmail" required inputmode="email" type="email" class="z-0 text-left border-b-2 ion-padding-start"
            :placeholder="t('register.email')"
          >
        </div>
        <IonButton
          :disabled="isLoading"
          type="submit"
          color="secondary"
          class="mx-auto font-semibold ion-margin-top w-45"
        >
          <span v-if="!isLoading" class="rounded-4xl">
            {{ t('submit') }}
          </span>
          <k-preloader v-else size="w-16 h-16" />
        </IonButton>
      </div>
    </form>
  </div>
</template>
