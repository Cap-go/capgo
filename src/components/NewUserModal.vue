<script setup lang="ts">
import {
  kDialog,
  kDialogButton,
} from 'konsta/vue'
import { useVuelidate } from '@vuelidate/core'
import { required } from '@vuelidate/validators'
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { generate } from 'generate-password-browser'
import { useSupabase } from '~/services/supabase'

const props = defineProps({
  emailAddress: String,
  opened: Boolean,
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
  <k-dialog
    :opened="props.opened"
    class="text-lg"
    @backdropclick="() => (emit('close'))"
  >
    <template #title>
      {{ t('channel.add') }}
    </template>
    <input
      v-model="form.first_name"
      autofocus
      required
      class="k-input w-full rounded-lg text-lg text-gray-200 p-1 mb-2"
      :placeholder="t('register.first-name')"
      type="text"
    >
    <div v-for="(error, index) of v$.first_name.$errors" :key="index">
      <p class="mt-2 mb-4 text-xs italic text-sweet-pink-900">
        {{ t('register.first-name') }}: {{ error.$message }}
      </p>
    </div>
    <input v-model="form.last_name" required type="text" :placeholder="t('register.last-name')" class="k-input w-full rounded-lg text-lg text-gray-200 p-1 mb-2">
    <div v-for="(error, index) of v$.last_name.$errors" :key="index">
      <p class="mt-2 mb-4 text-xs italic text-sweet-pink-900">
        {{ t('register.last-name') }}: {{ error.$message }}
      </p>
    </div>
    <input v-model="userEmail" required type="email" :placeholder="t('register.email')" class="k-input w-full rounded-lg text-lg text-gray-200 p-1 mb-2">

    <template #buttons>
      <k-dialog-button class="text-red-800" @click="() => (emit('close'))">
        {{ t('button.cancel') }}
      </k-dialog-button>
      <k-dialog-button @click="() => (submit)">
        {{ t('channel.add') }}
      </k-dialog-button>
    </template>
  </k-dialog>
</template>
