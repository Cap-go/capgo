<script setup lang="ts">
import {
  kDialog,
  kDialogButton,
} from 'konsta/vue'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { generate } from 'generate-password-browser'
import type { FormKitNode } from '@formkit/core'
import { clearErrors, setErrors } from '@formkit/core'
import { useRouter } from 'vue-router'
import { FormKitMessages } from '@formkit/vue'
import { existUser, useSupabase } from '~/services/supabase'
import { useMainStore } from '~/stores/main'
import { useDisplayStore } from '~/stores/display'

const props = defineProps<{
  channelId: number
  appId: string
  opened: boolean
}>()
const emit = defineEmits(['inviteUser', 'close'])
const supabase = useSupabase()
const main = useMainStore()
const displayStore = useDisplayStore()
const router = useRouter()
const userId = ref('0')

const isLoading = ref(false)
const { t } = useI18n()

async function addUser({ value }: FormKitNode) {
  // console.log('newUser', newUser.value)
  // exist_user
  userId.value = await existUser(value as string)
  return true
}

async function inviteUser(userId: string) {
  if (!props.channelId || !props.appId)
    return
  const { error } = await supabase
    .from('channel_users')
    .insert({
      channel_id: props.channelId,
      app_id: props.appId,
      created_by: main.user?.id,
      user_id: userId,
    })
  if (error)
    setErrors('create-user', [error.message], {})
}
function close() {
  emit('close')
  clearErrors('create-user')
}

async function submit(form: { first_name: string; last_name: string; email: string }) {
  isLoading.value = true
  try {
    if (!main.canUseMore) {
    // show alert for upgrade plan and return
      displayStore.actionSheetOption = {
        header: t('limit-reached'),
        message: t('please-upgrade'),
        buttons: [
          {
            text: t('button-cancel'),
            role: 'cancel',
          },
          {
            text: t('upgrade-now'),
            id: 'confirm-button',
            handler: () => {
              router.push('/dashboard/settings/plans')
            },
          },
        ],
      }
      displayStore.showActionSheet = true
      return false
    }
    if (!userId.value) {
      const password = generate({
        length: 12,
        numbers: true,
        symbols: true,
      })
      const { error, data: user } = await supabase.auth.signUp({
        email: form.email,
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
          setErrors('create-user', [error.message], {})
        else
          setErrors('create-user', [t('something-went-wrong-try-again-later')], {})
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
        setErrors('create-user', [userTableError!.message], {})
      else
        inviteUser(user.user?.id)
    }
    else {
      inviteUser(userId.value)
    }
  }
  catch (err) {
    console.error(err)
  }
}
</script>

<template>
  <FormKit v-if="props.opened" id="create-user" messages-class="text-red-500" type="form" :actions="false" @submit="submit">
    <k-dialog
      :opened="props.opened"
      @backdropclick="() => (emit('close'))"
    >
      <template #title>
        {{ t('add-shared-user') }}
      </template>
      <div>
        <FormKit
          type="email"
          name="email"
          :disabled="isLoading"
          validation="required:trim|email|(500)addUser"
          validation-visibility="live"
          :validation-rules="{ addUser }"
          :label="t('email')"
          :placeholder="t('email')"
          input-class="w-full p-2 form-input dark:bg-gray-700 dark:text-white"
          message-class="text-red-500"
        />
        <FormKit
          v-if="!userId"
          type="text"
          name="first_name"
          :disabled="isLoading"
          validation="required:trim"
          autofocus
          :label="t('first-name')"
          :placeholder="t('first-name')"
          input-class="w-full p-2 form-input dark:bg-gray-700 dark:text-white"
          message-class="text-red-500"
        />
        <FormKit
          v-if="!userId"
          type="text"
          name="first_name"
          :disabled="isLoading"
          validation="required:trim"
          :label="t('last-name')"
          :placeholder="t('last-name')"
          input-class="w-full p-2 form-input dark:bg-gray-700 dark:text-white"
          message-class="text-red-500"
        />
        <FormKitMessages />
      </div>

      <template #buttons>
        <k-dialog-button class="text-red-800" @click="close()">
          {{ t('button-cancel') }}
        </k-dialog-button>
        <k-dialog-button @click="() => (submit)">
          {{ t('add') }}
        </k-dialog-button>
      </template>
    </k-dialog>
  </FormKit>
</template>
