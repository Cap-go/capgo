<script setup lang="ts">
import type VueTurnstile from 'vue-turnstile'
import type { Database } from '~/types/supabase.types'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { useSupabase } from '~/services/supabase'
import { useDialogV2Store } from '~/stores/dialogv2'
import { useOrganizationStore } from '~/stores/organization'

const emit = defineEmits(['success'])

const { t } = useI18n()
const supabase = useSupabase()
const organizationStore = useOrganizationStore()
const dialogStore = useDialogV2Store()

const inviteEmail = ref('')
const inviteFirstName = ref('')
const inviteLastName = ref('')
const inviteCaptchaToken = ref('')
const inviteCaptchaElement = ref<InstanceType<typeof VueTurnstile> | null>(null)
const captchaKey = ref(import.meta.env.VITE_CAPTCHA_KEY)
const isInviting = ref(false)
const inviteRole: Database['public']['Enums']['user_min_right'] = 'admin'
const inviteDialogTitle = computed(() => t('onboarding-invite-option-modal-title'))
const isInviteDialogOpen = ref(false)

function openDialog() {
  resetInviteForm()
  isInviteDialogOpen.value = true
  dialogStore.openDialog({
    title: inviteDialogTitle.value,
    description: t('onboarding-invite-option-dialog-desc'),
    size: 'lg',
    preventAccidentalClose: true,
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        id: 'invite-send',
        text: t('send-invitation'),
        role: 'primary',
        preventClose: true,
        handler: () => {
          handleInviteSubmit()
        },
      },
    ],
  })
  updateInviteDialogButton(false)
  dialogStore.onDialogDismiss().then(() => {
    isInviteDialogOpen.value = false
    isInviting.value = false
    resetInviteForm()
  })
}

function completeInviteSuccess() {
  resetInviteForm()
  dialogStore.closeDialog({
    text: t('send-invitation'),
    role: 'primary',
  })
  isInviteDialogOpen.value = false
  emit('success')
}

function updateInviteDialogButton(loading: boolean) {
  const buttons = dialogStore.dialogOptions?.buttons
  if (!buttons)
    return
  const submitButton = buttons.find(button => button.id === 'invite-send')
  if (!submitButton)
    return
  submitButton.disabled = loading
  submitButton.text = loading
    ? t('sending-invitation')
    : t('send-invitation')
}

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/.test(email.toLowerCase())
}

function resetInviteForm() {
  inviteEmail.value = ''
  inviteFirstName.value = ''
  inviteLastName.value = ''
  if (captchaKey.value) {
    inviteCaptchaToken.value = ''
    inviteCaptchaElement.value?.reset()
  }
}

async function inviteNewUserFallback(email: string, orgId: string) {
  if (!captchaKey.value) {
    toast.error(t('captcha-not-available', 'Captcha verification is not configured in this environment.'))
    return false
  }

  if (captchaKey.value && !inviteCaptchaToken.value) {
    toast.error(t('captcha-required', 'Captcha verification is required'))
    return false
  }

  const { error } = await supabase.functions.invoke('private/invite_new_user_to_org', {
    body: {
      email,
      org_id: orgId,
      invite_type: inviteRole,
      captcha_token: inviteCaptchaToken.value,
      first_name: inviteFirstName.value.trim(),
      last_name: inviteLastName.value.trim(),
    },
  })

  if (error) {
    console.error('Invite new user failed', error)
    toast.error(t('invitation-failed', 'Invitation failed'))
    return false
  }

  toast.success(t('org-invited-user', 'User has been invited successfully'))
  return true
}

async function handleInviteSubmit() {
  if (isInviting.value)
    return

  const email = inviteEmail.value.trim().toLowerCase()
  const firstName = inviteFirstName.value.trim()
  const lastName = inviteLastName.value.trim()

  if (!email) {
    toast.error(t('missing-email', 'Email is required'))
    return
  }

  if (!validateEmail(email)) {
    toast.error(t('invalid-email', 'Invalid email'))
    return
  }

  if (!firstName) {
    toast.error(t('first-name-required', 'First name is required'))
    return
  }

  if (!lastName) {
    toast.error(t('last-name-required', 'Last name is required'))
    return
  }

  const orgId = organizationStore.currentOrganization?.gid
  if (!orgId) {
    toast.error(t('organization-not-found'))
    return
  }

  isInviting.value = true
  try {
    const { data, error } = await supabase
      .rpc('invite_user_to_org', {
        email,
        org_id: orgId,
        invite_type: inviteRole,
      })

    if (error) {
      console.error('Error inviting user:', error)
      toast.error(t('error-inviting-user', 'Error inviting user'))
      return
    }

    if (!data) {
      toast.error(t('invitation-failed', 'Invitation failed'))
      return
    }

    if (data === 'OK') {
      toast.success(t('org-invited-user', 'User has been invited successfully'))
      completeInviteSuccess()
      return
    }

    if (data === 'NO_EMAIL') {
      const invited = await inviteNewUserFallback(email, orgId)
      if (invited) {
        completeInviteSuccess()
      }
      return
    }

    if (data === 'ALREADY_INVITED') {
      toast.error(t('user-already-invited', 'This user is already invited'))
    }
    else if (data === 'TOO_RECENT_INVITATION_CANCELATION') {
      toast.error(t('too-recent-invitation-cancelation', 'An invitation was cancelled recently. Please wait a bit longer.'))
    }
    else if (data === 'CAN_NOT_INVITE_OWNER') {
      toast.error(t('cannot-invite-owner', 'You cannot invite the owner of the account'))
    }
    else if (data === 'NO_RIGHTS') {
      toast.error(t('no-permission', 'You do not have permission to invite members'))
    }
    else {
      toast.error(`${t('unexpected-invitation-response', 'Unexpected invitation response')}: ${data}`)
    }
  }
  finally {
    isInviting.value = false
    if (captchaKey.value)
      inviteCaptchaElement.value?.reset()
    inviteCaptchaToken.value = ''
  }
}

watch([isInviting, isInviteDialogOpen], ([loading, open]) => {
  if (!open)
    return

  updateInviteDialogButton(loading)
}, { immediate: true })

defineExpose({
  openDialog,
})
</script>

<template>
  <Teleport v-if="dialogStore.showDialog && isInviteDialogOpen" to="#dialog-v2-content" defer>
    <form class="grid gap-4 sm:grid-cols-2" @submit.prevent="handleInviteSubmit">
      <div class="sm:col-span-2">
        <label for="invite-email" class="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-200">
          {{ t('email', 'Email') }}
        </label>
        <input
          id="invite-email"
          v-model="inviteEmail"
          type="email"
          autocomplete="email"
          class="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:ring-muted-blue-500 focus:border-muted-blue-500 dark:bg-slate-900 dark:border-gray-700 dark:text-gray-100"
          placeholder="teammate@email.com"
          required
        >
      </div>
      <div>
        <label for="invite-first-name" class="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-200">
          {{ t('first-name', 'First name') }}
        </label>
        <input
          id="invite-first-name"
          v-model="inviteFirstName"
          type="text"
          autocomplete="given-name"
          class="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:ring-muted-blue-500 focus:border-muted-blue-500 dark:bg-slate-900 dark:border-gray-700 dark:text-gray-100"
          placeholder="Jane"
          required
        >
      </div>
      <div>
        <label for="invite-last-name" class="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-200">
          {{ t('last-name', 'Last name') }}
        </label>
        <input
          id="invite-last-name"
          v-model="inviteLastName"
          type="text"
          autocomplete="family-name"
          class="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:ring-muted-blue-500 focus:border-muted-blue-500 dark:bg-slate-900 dark:border-gray-700 dark:text-gray-100"
          placeholder="Doe"
          required
        >
      </div>
      <div v-if="captchaKey" class="sm:col-span-2">
        <label for="invite-captcha" class="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-200">
          {{ t('captcha', 'Captcha') }}
        </label>
        <VueTurnstile
          id="invite-captcha"
          ref="inviteCaptchaElement"
          v-model="inviteCaptchaToken"
          size="flexible"
          :site-key="captchaKey"
        />
      </div>
      <div v-else class="sm:col-span-2 text-sm text-gray-500 dark:text-gray-400">
        {{ t('captcha-not-available', 'Captcha verification is not configured in this environment.') }}
      </div>
      <p class="sm:col-span-2 text-sm text-gray-500 dark:text-gray-400">
        {{ t('onboarding-invite-option-helper') }}
      </p>
      <button type="submit" class="hidden" tabindex="-1" aria-hidden="true" />
    </form>
  </Teleport>
</template>
