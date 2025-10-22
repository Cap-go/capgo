<script setup lang="ts">
import type { Database } from '~/types/supabase.types'
import { computed, onUnmounted, ref, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import VueTurnstile from 'vue-turnstile'
import arrowBack from '~icons/ion/arrow-back?width=2em&height=2em'
import IconLoader from '~icons/lucide/loader-2'
import { pushEvent } from '~/services/posthog'
import { getLocalConfig, isLocal, useSupabase } from '~/services/supabase'
import { sendEvent } from '~/services/tracking'
import { useDialogV2Store } from '~/stores/dialogv2'
import { useDisplayStore } from '~/stores/display'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'

const props = defineProps<{
  onboarding: boolean
}>()
const emit = defineEmits(['done', 'closeStep'])
const displayStore = useDisplayStore()
const isLoading = ref(false)
const step = ref(0)
const clicked = ref(0)
const appId = ref<string>()
const realtimeListener = ref(false)
const pollTimer = ref<number | null>(null)
const initialCount = ref<number | null>(null)
const supabase = useSupabase()
const main = useMainStore()
const { t } = useI18n()
const organizationStore = useOrganizationStore()
const dialogStore = useDialogV2Store()

interface Step {
  title: string
  command?: string
  subtitle: string
}

const config = getLocalConfig()

const localCommand = isLocal(config.supaHost) ? ` --supa-host ${config.supaHost} --supa-anon ${config.supaKey}` : ``
const steps = ref<Step[]>([
  {
    title: t('init-capgo-in-your-a'),
    command: `npx @capgo/cli@latest i [APIKEY]${localCommand}`,
    subtitle: '',
  },
  {
    title: t('discover-your-dashbo'),
    command: '',
    subtitle: t('this-page-will-self-'),
  },
])
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

function stepToName(stepNumber: number): string {
  switch (stepNumber) {
    case 0:
      return 'copy-command'
    case 1:
      return 'wait-for-app'
    case 2:
      return 'discover-your-dashboard'
    default:
      return 'unknown-step'
  }
}

function setLog() {
  if (props.onboarding && main.user?.id) {
    sendEvent({
      channel: 'onboarding-v2',
      event: `onboarding-step-${stepToName(step.value)}`,
      icon: '👶',
      user_id: organizationStore.currentOrganization?.gid,
      notify: false,
    }).catch()
    pushEvent(`user:onboarding-step-${stepToName(step.value)}`, config.supaHost)
  }
  if (step.value === 2) {
    console.log('Finished onboarding for app ID:', appId.value)
    emit('done', appId.value)
  }
}

function scrollToElement(id: string) {
  // Get the element with the id
  const el = document.getElementById(id)
  console.log('el', el)
  if (el) {
    // Use el.scrollIntoView() to instantly scroll to the element
    el.scrollIntoView({ behavior: 'smooth' })
  }
}

function goToNextStep(scrollTargetId?: string) {
  step.value += 1
  clicked.value = 0
  realtimeListener.value = false
  clearWatchers()
  if (scrollTargetId)
    scrollToElement(scrollTargetId)
  setLog()
}

function openInviteDialog() {
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
  goToNextStep('step_card_1')
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

watch([isInviting, isInviteDialogOpen], ([loading, open]) => {
  if (!open)
    return

  updateInviteDialogButton(loading)
}, { immediate: true })

function clearWatchers() {
  if (pollTimer.value !== null) {
    console.log('clear poll timer', pollTimer.value)
    clearInterval(pollTimer.value)
    pollTimer.value = null
  }
}
async function copyToast(allowed: boolean, _id: string, text?: string) {
  if (!allowed || !text)
    return
  try {
    await navigator.clipboard.writeText(text)
    console.log('displayStore.messageToast', displayStore.messageToast)
    toast.success(t('copied-to-clipboard'))
  }
  catch (err) {
    console.error('Failed to copy: ', err)
    // Display a modal with the copied key
    dialogStore.openDialog({
      title: t('cannot-copy'),
      description: text,
      buttons: [
        {
          text: t('button-cancel'),
          role: 'cancel',
        },
      ],
    })
    await dialogStore.onDialogDismiss()
  }
  clicked.value += 1
  if (!realtimeListener.value || clicked.value === 3) {
    goToNextStep('step_card_1')
  }
}

async function addNewApiKey() {
  const newApiKey = crypto.randomUUID()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    console.log('Not logged in, cannot regenerate API key')
    return
  }
  const { error } = await supabase
    .from('apikeys')
    .upsert({ user_id: user.id, key: newApiKey, mode: 'all', name: '' })
    .select()

  if (error)
    throw error
}

async function getKey(retry = true): Promise<void> {
  isLoading.value = true
  if (!main?.user?.id)
    return
  const { data, error } = await supabase
    .from('apikeys')
    .select()
    .eq('user_id', main?.user?.id)
    .eq('mode', 'all')

  if (typeof data !== 'undefined' && data !== null && !error) {
    if (data.length === 0) {
      await addNewApiKey()
      return getKey(false)
    }
    steps.value[0].command = steps.value[0].command?.replace('[APIKEY]', data[0].key ?? '')
  }
  else if (retry && main?.user?.id) {
    return getKey(false)
  }

  isLoading.value = false
}

async function getAppsCount(): Promise<number> {
  const orgId = organizationStore.currentOrganization?.gid
  if (!orgId)
    return 0
  const { count, error } = await supabase
    .from('apps')
    .select('id', { count: 'exact', head: true })
    .eq('owner_org', orgId)

  if (error)
    return 0
  return count ?? 0
}

async function getLatestAppId(): Promise<string | undefined> {
  const orgId = organizationStore.currentOrganization?.gid
  if (!orgId)
    return undefined
  const { data, error } = await supabase
    .from('apps')
    .select('app_id, created_at')
    .eq('owner_org', orgId)
    .order('created_at', { ascending: false })
    .limit(1)

  if (error || !data || data.length === 0)
    return undefined
  console.log('data', data)
  console.log('latest app id', data[0].app_id)
  return data[0].app_id as string
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
watchEffect(async () => {
  if (step.value === 1 && !realtimeListener.value) {
    console.log('watch app change step 1 via polling')
    realtimeListener.value = true
    await organizationStore.awaitInitialLoad()
    // establish baseline
    try {
      initialCount.value = await getAppsCount()
    }
    catch {
      initialCount.value = 0
    }

    clearWatchers()

    pollTimer.value = window.setInterval(async () => {
      try {
        const current = await getAppsCount()
        if (initialCount.value !== null && current > initialCount.value) {
          const latestId = await getLatestAppId()
          appId.value = latestId ?? ''
          goToNextStep()
        }
      }
      catch (e) {
        console.warn('Polling apps failed', e)
      }
    }, 2000)
  }
})

watchEffect(async () => {
  await getKey()
})

onUnmounted(() => {
  clearWatchers()
})
</script>

<template>
  <section class="h-full py-12 overflow-y-auto max-h-fit lg:py-20 sm:py-16">
    <div class="px-4 mx-auto max-w-7xl lg:px-8 sm:px-6">
      <div class="flex items-center justify-items-center place-content-center">
        <button v-if="!onboarding" class="bg-gray-800 text-white d-btn d-btn-outline mr-6" @click="emit('closeStep')">
          <arrowBack />
        </button>
        <div v-if="props.onboarding" class="text-center">
          <h2 class="text-3xl font-bold text-gray-900 font-pj sm:text-4xl xl:text-5xl dark:text-gray-50">
            {{ t('start-using-capgo') }} <span class="font-prompt">Capgo</span> !
          </h2>
          <p class="mx-auto mt-6 text-lg font-normal text-gray-600 font-pj dark:text-gray-200">
            {{ t('add-your-first-app-t') }}
          </p>
          <p class="mx-auto mt-2 font-normal text-md font-pj text-muted-blue-300 dark:text-muted-blue-50">
            {{ t('pro-tip-you-can-copy') }} <span class="text-pumpkin-orange-900">{{ t('commands') }}</span> {{ t('by-clicking-on-them') }}
          </p>
        </div>

        <div v-else class="text-center">
          <h2 class="text-3xl font-bold text-gray-900 font-pj sm:text-4xl xl:text-5xl dark:text-gray-50">
            {{ t('add-another-app') }}
          </h2>
        </div>
      </div>

      <div class="max-w-4xl mx-auto mt-12 sm:px-10">
        <template v-for="(s, i) in steps" :key="i">
          <div v-if="i > 0" class="w-1 h-10 mx-auto bg-gray-200" :class="[step !== i ? 'opacity-30' : '']" />

          <div :id="`step_card_${i}`" :class="[step !== i ? 'opacity-30' : '']" class="relative p-5 overflow-hidden bg-white border border-gray-200 rounded-2xl">
            <div class="flex items-start sm:items-center">
              <div class="inline-flex items-center justify-center text-xl font-bold text-white shrink-0 font-pj h-14 w-14 rounded-xl bg-muted-blue-800">
                <template v-if="i + 1 !== steps.length">
                  {{ i + 1 }}
                </template>
                <template v-else-if="step === 1 && i === 1">
                  <div class="flex justify-center">
                    <IconLoader class="w-10 h-10 text-blue-500 animate-spin" />
                  </div>
                </template>
                <template v-else>
                  🚀
                </template>
              </div>
              <div class="ml-6 text-xl font-medium text-gray-900 font-pj">
                {{ s.title }}<br>
                <span class="text-sm">{{ s.subtitle }}</span>
                <div class="p-3 rounded-lg" :class="{ 'dark:bg-black bg-gray-100': s.command }">
                  <code v-if="s.command" :id="`step_command_${i}`" class="block text-lg break-all whitespace-pre-wrap cursor-pointer text-pumpkin-orange-700" @click="copyToast(step === i, `step_command_${i}`, s.command)">
                    {{ s.command }}
                    <i-ion-copy-outline class="text-muted-blue-300" />
                  </code>
                </div>
                <br v-if="s.command">
              </div>
            </div>
            <div v-if="i === 0" class="pt-6 mt-6 border-t border-gray-200 dark:border-gray-700">
              <h3 class="text-lg font-semibold text-gray-900 font-pj dark:text-gray-100">
                {{ t('onboarding-invite-option-title') }}
              </h3>
              <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
                {{ t('onboarding-invite-option-subtitle') }}
              </p>
              <button
                type="button"
                class="inline-flex items-center px-4 py-2 mt-4 text-sm font-semibold transition-colors duration-200 rounded-md bg-muted-blue-50 text-muted-blue-800 hover:bg-muted-blue-100 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-muted-blue-500 dark:bg-slate-800 dark:text-muted-blue-100 dark:hover:bg-slate-700"
                @click="openInviteDialog"
              >
                {{ t('onboarding-invite-option-cta') }}
              </button>
            </div>
          </div>
        </template>
      </div>
    </div>
  </section>
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
