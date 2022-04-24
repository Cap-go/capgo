<script setup lang="ts">
import {
  IonButton,
  IonContent,
  IonHeader,
  IonInput,
  IonSpinner,
  IonToolbar,
} from '@ionic/vue'
import { useVuelidate } from '@vuelidate/core'
import { required } from '@vuelidate/validators'
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { generate } from 'generate-password-browser'
import type { definitions } from '~/types/supabase'
import { useSupabase } from '~/services/supabase'

const supabase = useSupabase()
const form = reactive({
  first_name: '',
  last_name: '',
})

const props = defineProps({
  emailAddress: String,
})

const emit = defineEmits(['inviteUser'])

const userEmail = ref(props.emailAddress)

const isLoading = ref(false)
const errorMessage = ref('')

const rules = computed(() => ({
  first_name: { required },
  last_name: { required },
}))

const v$ = useVuelidate(rules, form)

const { t } = useI18n()

const submit = async() => {
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
    const { error, user } = await supabase.auth.signUp({

      email: userEmail.value,
      password,
    },
    {
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
      redirectTo: `${import.meta.env.VITE_APP_URL}/onboarding/set_password`,
    })
    const { error: userTableError } = await supabase
      .from<definitions['users']>('users')
      .insert(
        {
          id: user?.id,
          first_name: user?.user_metadata.first_name,
          last_name: user?.user_metadata.last_name,
          email: user?.email,
        },
      )
    isLoading.value = false
    if (error || userTableError)
      errorMessage.value = error ? error.message : userTableError!.message
    else
      emit('inviteUser', user?.id)
  }
  catch (err) {
    console.error(err)
  }
}
</script>

<template>
  <ion-header>
    <ion-toolbar>
      <ion-title>
        Invite user
      </ion-title>
      <ion-button slot="end" @click="$emit('close')">
        Close
      </ion-button>
    </ion-toolbar>
  </ion-header>
  <IonContent>
    <div class="grid lg:w-1/2 mx-auto w-full h-full min-h-screen p-8">
      <form
        class="mt-2 relative"
        @submit.prevent="submit"
      >
        <p v-if="errorMessage" class="text-sweet-pink-900 text-xs italic mt-2 mb-4">
          {{ errorMessage }}
        </p>
        <div class="mx-auto max-w-lg grid item-cente">
          <div class="py-1">
            <IonInput
              v-model="form.first_name"
              autofocus
              required
              class="z-0 text-left border-b-2 ion-padding-start"
              :placeholder="t('register.first-name')"
              type="text"
            />

            <div v-for="(error, index) of v$.first_name.$errors" :key="index">
              <p class="text-sweet-pink-900 text-xs italic mt-2 mb-4">
                {{ t('register.first-name') }}: {{ error.$message }}
              </p>
            </div>
          </div>
          <div class="py-1">
            <IonInput v-model="form.last_name" required class="z-0 text-left border-b-2 ion-padding-start" :placeholder="t('register.last-name')" type="text" />
            <div v-for="(error, index) of v$.last_name.$errors" :key="index">
              <p class="text-sweet-pink-900 text-xs italic mt-2 mb-4">
                {{ t('register.last-name') }}: {{ error.$message }}
              </p>
            </div>
          </div>
          <div class="py-1">
            <IonInput
              v-model="userEmail"
              required
              inputmode="email"
              class="text-left border-b-2 z-0 ion-padding-start"
              :placeholder="t('register.email')"
              type="email"
            />
          </div>
          <IonButton
            :disabled="isLoading"
            type="submit"
            color="secondary"
            class="ion-margin-top w-45 mx-auto font-semibold"
          >
            <span v-if="!isLoading" class="rounded-4xl">
              Submit
            </span>
            <IonSpinner v-else name="crescent" color="light" />
          </IonButton>
        </div>
      </form>
    </div>
  </IonContent>
</template>
