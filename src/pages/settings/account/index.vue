<script setup lang="ts">
import type { Database } from '~/types/supabase.types'
import { Capacitor } from '@capacitor/core'
import { setErrors } from '@formkit/core'
import { FormKit, FormKitMessages, reset } from '@formkit/vue'
import dayjs from 'dayjs'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import VueTurnstile from 'vue-turnstile'
import IconVersion from '~icons/heroicons/arrow-path'
import iconEmail from '~icons/heroicons/envelope?raw'
import iconFlag from '~icons/heroicons/flag?raw'
import iconName from '~icons/heroicons/user?raw'
import { pickPhoto, takePhoto } from '~/services/photos'
import { getCurrentPlanNameOrg, isPayingOrg, useSupabase } from '~/services/supabase'
import { useDialogV2Store } from '~/stores/dialogv2'
import { useDisplayStore } from '~/stores/display'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'
// tabs handled by settings layout

const version = import.meta.env.VITE_APP_VERSION
const { t } = useI18n()
const supabase = useSupabase()
const displayStore = useDisplayStore()
const router = useRouter()
const route = useRoute()
const main = useMainStore()
const dialogStore = useDialogV2Store()
const organizationStore = useOrganizationStore()
const isLoading = ref(false)
const isDeletingAccount = ref(false)
const deleteAccountPassword = ref('')
const deleteAccountCaptchaToken = ref('')
const deleteAccountCaptchaRef = ref<InstanceType<typeof VueTurnstile> | null>(null)
const captchaKey = ref(import.meta.env.VITE_CAPTCHA_KEY)
// mfa = 2fa
const mfaEnabled = ref(false)
const mfaFactorId = ref('')
const mfaVerificationCode = ref('')
const mfaQRCode = ref('')
const otpVerificationCode = ref('')
const otpVerifiedAt = ref<string | null>(null)
const otpVerificationLoading = ref(false)
const otpSending = ref(false)
const otpNow = ref(dayjs())
let otpNowTimer: ReturnType<typeof setInterval> | null = null
const organizationsToDelete = ref<string[]>([])
const paidOrganizationsToDelete = ref<Array<{ name: string, planName: string }>>([])
displayStore.NavTitle = t('account')
const otpEmail = computed(() => main.auth?.email ?? main.user?.email ?? '')
const otpVerifiedUntil = computed(() => {
  if (!otpVerifiedAt.value)
    return null
  return dayjs(otpVerifiedAt.value).add(1, 'hour')
})
const otpVerificationValid = computed(() => {
  if (!otpVerifiedUntil.value)
    return false
  return otpNow.value.isBefore(otpVerifiedUntil.value)
})
const otpVerificationStatus = computed(() => {
  if (!otpVerifiedAt.value)
    return 'none'
  return otpVerificationValid.value ? 'valid' : 'expired'
})
const otpVerifiedUntilLabel = computed(() => {
  if (!otpVerifiedUntil.value)
    return ''
  return otpVerifiedUntil.value.format('YYYY-MM-DD HH:mm')
})

async function checkOrganizationImpact() {
  // Wait for organizations and main store to load
  await Promise.all([
    organizationStore.awaitInitialLoad(),
    main.awaitInitialLoad(),
  ])

  // Get all organizations where user is super_admin
  const superAdminOrgs = organizationStore.organizations.filter(org => org.role === 'super_admin' || org.role === 'org_super_admin')

  if (superAdminOrgs.length === 0) {
    return { orgsToBeDeleted: [], paidOrgsToBeDeleted: [], canProceed: true }
  }

  const orgsToBeDeleted: string[] = []
  const paidOrgsToBeDeleted: Array<{ name: string, planName: string, orgId: string }> = []

  // Check each organization to see if user is the only super_admin
  for (const org of superAdminOrgs) {
    try {
      const useNewRbac = org.use_new_rbac === true
      let superAdminCount = 0

      if (useNewRbac) {
        const { data: members, error } = await supabase
          .rpc('get_org_members_rbac', { p_org_id: org.gid })

        if (error) {
          console.error('Error getting RBAC org members:', error)
          continue
        }

        superAdminCount = members.filter(member =>
          !member.is_invite && !member.is_tmp && member.role_name === 'org_super_admin',
        ).length
      }
      else {
        const { data: members, error } = await supabase
          .rpc('get_org_members', { guild_id: org.gid })

        if (error) {
          console.error('Error getting org members:', error)
          continue
        }

        // Count super_admins (excluding temporary users)
        superAdminCount = members.filter(member =>
          member.role === 'super_admin' && !member.is_tmp,
        ).length
      }

      // If user is the only super_admin, this org will be deleted
      if (superAdminCount === 1) {
        orgsToBeDeleted.push(org.name)

        // Check if this organization has a paid subscription
        try {
          const isPaying = await isPayingOrg(org.gid)
          if (isPaying) {
            const planNameFromDb = await getCurrentPlanNameOrg(org.gid)
            // Get the actual plan object to get the real plan name
            const actualPlan = main.plans.find(p => p.name === planNameFromDb)
            const planName = actualPlan?.name || planNameFromDb || 'Unknown Plan'

            paidOrgsToBeDeleted.push({
              name: org.name,
              planName,
              orgId: org.gid,
            })
          }
        }
        catch (error) {
          console.error('Error checking payment status for org:', org.name, error)
        }
      }
    }
    catch (error) {
      console.error('Error checking organization:', org.name, error)
    }
  }

  return { orgsToBeDeleted, paidOrgsToBeDeleted, canProceed: true }
}

async function deleteAccount() {
  // First, check organization impact
  const { orgsToBeDeleted, paidOrgsToBeDeleted, canProceed } = await checkOrganizationImpact()

  if (!canProceed) {
    toast.error(t('something-went-wrong-try-again-later'))
    return
  }

  // Show warning if organizations will be deleted
  if (orgsToBeDeleted.length > 0) {
    // Store the organizations list for the teleport
    organizationsToDelete.value = orgsToBeDeleted

    dialogStore.openDialog({
      id: 'delete-account-warning-orgs',
      title: t('warning-organizations-will-be-deleted'),
      description: t('warning-organizations-will-be-deleted-message'),
      size: 'lg',
      buttons: [
        {
          text: t('button-cancel'),
          role: 'cancel',
        },
        {
          text: t('understand-and-continue'),
          role: 'danger',
        },
      ],
    })

    const cancelled = await dialogStore.onDialogDismiss()
    if (cancelled) {
      organizationsToDelete.value = []
      return
    }
    organizationsToDelete.value = []
  }

  // Show subscription cancellation warning if there are paid organizations
  if (paidOrgsToBeDeleted.length > 0) {
    // Store the paid organizations list for the teleport
    paidOrganizationsToDelete.value = paidOrgsToBeDeleted.map(org => ({
      name: org.name,
      planName: org.planName,
    }))

    dialogStore.openDialog({
      id: 'delete-account-warning-paid',
      title: t('warning-paid-subscriptions'),
      description: t('warning-paid-subscriptions-message'),
      size: 'lg',
      buttons: [
        {
          text: t('button-cancel'),
          role: 'cancel',
        },
        {
          text: t('cancel-subscriptions-and-continue'),
          role: 'danger',
        },
      ],
    })

    const cancelled = await dialogStore.onDialogDismiss()
    if (cancelled) {
      paidOrganizationsToDelete.value = []
      return
    }
    paidOrganizationsToDelete.value = []

    // TODO: Here we would implement subscription cancellation logic
    // For now, we just continue to the final confirmation
  }

  // Show final confirmation
  deleteAccountPassword.value = ''
  deleteAccountCaptchaToken.value = ''
  deleteAccountCaptchaRef.value?.reset()
  dialogStore.openDialog({
    id: 'delete-account-confirm',
    title: t('delete-account'),
    description: '', // We'll use Teleport for custom content
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('i-am-sure'),
        role: 'danger',
        preventClose: true,
        handler: async () => {
          const success = await performAccountDeletion(deleteAccountPassword.value)
          if (success) {
            deleteAccountPassword.value = ''
            dialogStore.closeDialog({ text: t('i-am-sure'), role: 'danger' })
          }
          return success
        },
      },
    ],
  })
  const dismissed = await dialogStore.onDialogDismiss()
  deleteAccountPassword.value = ''
  deleteAccountCaptchaToken.value = ''
  deleteAccountCaptchaRef.value?.reset()
  return dismissed
}

async function performAccountDeletion(password: string) {
  if (!main.auth || main.auth?.email == null)
    return false
  const supabaseClient = useSupabase()

  if (!password) {
    toast.error(t('password-placeholder'))
    return false
  }

  if (captchaKey.value && !deleteAccountCaptchaToken.value) {
    toast.error(t('captcha-required', 'Captcha verification is required'))
    return false
  }

  if (isDeletingAccount.value)
    return false

  isDeletingAccount.value = true
  try {
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: main.auth.email,
      password,
      options: captchaKey.value ? { captchaToken: deleteAccountCaptchaToken.value } : undefined,
    })
    if (signInError) {
      deleteAccountCaptchaToken.value = ''
      deleteAccountCaptchaRef.value?.reset()
      if (signInError.message.includes('captcha')) {
        toast.error(t('captcha-fail'))
        return false
      }
      toast.error(t('invalid-auth'))
      return false
    }

    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims()
    const userId = claimsData?.claims?.sub
    if (claimsError || !userId) {
      toast.error(t('something-went-wrong-try-again-later'))
      return false
    }

    const { data: user } = await supabaseClient
      .from('users')
      .select()
      .eq('id', userId)
      .single()
    if (!user) {
      toast.error(t('something-went-wrong-try-again-later'))
      return false
    }

    if (user.email.endsWith('review@capgo.app') && Capacitor.isNativePlatform()) {
      const { error: banErr } = await supabase
        .from('users')
        .update({ ban_time: dayjs().add(5, 'minutes').toDate().toISOString() })
        .eq('id', user.id)

      if (banErr) {
        console.error('Cannot set ban duration', banErr)
        toast.error(t('something-went-wrong-try-again-later'))
        return false
      }

      await main.logout()
      router.replace('/login')
      return true
    }

    // Delete user using RPC function
    const { error: deleteError } = await supabase.rpc('delete_user')

    if (deleteError) {
      console.error('Delete error:', deleteError)
      if (deleteError.message?.includes('reauth_required')) {
        deleteAccountCaptchaToken.value = ''
        deleteAccountCaptchaRef.value?.reset()
        toast.error(t('invalid-auth'))
        return false
      }
      toast.error(t('something-went-wrong-try-again-later'))
      return false
    }

    // Reload the web page after successful account deletion
    window.location.reload()
    return true
  }
  catch (error) {
    console.error(error)
    toast.error(t('something-went-wrong-try-again-later'))
    return false
  }
  finally {
    isDeletingAccount.value = false
  }
}

async function copyAccountId() {
  try {
    await navigator.clipboard.writeText(main!.user!.id)
    console.log('displayStore.messageToast', displayStore.messageToast)
    toast.success(t('copied-to-clipboard'))
  }
  catch (err) {
    console.error('Failed to copy: ', err)
    // Display a modal with the copied key
    dialogStore.openDialog({
      title: t('cannot-copy'),
      description: main!.user!.id,
      buttons: [
        {
          text: t('button-cancel'),
          role: 'cancel',
        },
      ],
    })
    await dialogStore.onDialogDismiss()
  }
}

const acronym = computed(() => {
  let res = 'MD'
  if (main.user?.first_name && main.user.last_name)
    res = main.user?.first_name[0] + main.user?.last_name[0]
  else if (main.user?.first_name)
    res = main.user?.first_name[0]
  else if (main.user?.last_name)
    res = main.user?.last_name[0]
  return res.toUpperCase()
})

async function presentActionSheet() {
  dialogStore.openDialog({
    title: t('change-your-picture'),
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
        handler: () => {
          console.log('Cancel clicked')
        },
      },
      {
        text: t('button-camera'),
        role: 'primary',
        handler: () => {
          takePhoto('update-account', isLoading, 'user', t('something-went-wrong-try-again-later'))
        },
      },
      {
        text: t('button-browse'),
        role: 'secondary',
        handler: () => {
          pickPhoto('update-account', isLoading, 'user', t('something-went-wrong-try-again-later'))
        },
      },
    ],
  })
  return dialogStore.onDialogDismiss()
}

async function submit(form: { first_name: string, last_name: string, email: string, country: string }) {
  if (isLoading.value || !main.user?.id)
    return
  if (form.first_name === main.user?.first_name
    && form.last_name === main.user?.last_name
    && form.email === main.user?.email
    && form.country === main.user?.country) {
    return
  }
  isLoading.value = true

  const updateData: Database['public']['Tables']['users']['Insert'] = {
    id: main.user?.id,
    first_name: form.first_name,
    last_name: form.last_name,
    email: main.user.email,
    country: form.country,
  }

  if (main.user?.email !== form.email) {
    const data = await supabase.auth.updateUser({ email: form.email })
    reset('update-account', useMainStore().user)
    if (data.error && data.error.name === 'AuthApiError') {
      isLoading.value = false
      return toast.error('email already taken')
    }
    toast.success('A confirmation email was sent click to link to confirm your new email', {
      duration: 10000,
    })
    updateData.email = form.email
  }

  const { data: usr, error: dbError } = await supabase
    .from('users')
    .upsert(updateData, { onConflict: 'id' })
    .select()
    .single()

  if (dbError || !usr) {
    isLoading.value = false
    setErrors('update-account', [t('account-error')], {})
    return
  }
  else {
    toast.success(t('account-updated-succ'))
  }
  main.user = usr
  isLoading.value = false
}

async function disableMfa() {
  dialogStore.openDialog({
    title: t('alert-2fa-disable'),
    description: `${t('alert-not-reverse-message')} ${t('alert-disable-2fa-message')}?`,
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('disable'),
        role: 'danger',
        id: 'confirm-button',
      },
    ],
  })
  const canceled = await dialogStore.onDialogDismiss()

  // User has changed his mind - keepin 2fa
  if (canceled)
    return

  // Remove 2fa
  const factorId = mfaFactorId.value
  if (!factorId) {
    toast.error(t('mfa-fail'))
    console.error('Factor id = null')
    return
  }

  const { error: unregisterError } = await supabase.auth.mfa.unenroll({ factorId })
  if (unregisterError) {
    toast.error(t('mfa-fail'))
    console.error('Cannot unregister MFA', unregisterError)
    return
  }

  mfaFactorId.value = ''
  mfaEnabled.value = false
  toast.success(t('2fa-disabled'))
}

async function handleMfa() {
  if (mfaEnabled.value) {
    await disableMfa()
    return
  }
  await loadOtpVerification()
  if (!otpVerificationValid.value) {
    toast.error(t('email-otp-required'))
    return
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
  })

  if (error) {
    toast.error(t('mfa-fail'))
    console.error(error)
    return
  }

  // Store QR code for display
  mfaQRCode.value = data.totp.qr_code

  // Step 1: Show QR code
  dialogStore.openDialog({
    title: t('enable-2FA'),
    description: `${t('mfa-enable-instruction')}`,
    size: 'lg',
    preventAccidentalClose: true,
    buttons: [
      {
        text: t('verify'),
        id: 'verify',
      },
    ],
  })
  const didCancel = await dialogStore.onDialogDismiss()

  if (didCancel) {
    // User closed the window, go ahead and unregister mfa
    const { error: unregisterError } = await supabase.auth.mfa.unenroll({ factorId: data.id })
    if (error)
      console.error('Cannot unregister MFA', unregisterError)
    mfaQRCode.value = ''
    return
  }
  // Step 2: User has scanned the code - verify his claim
  mfaVerificationCode.value = ''
  mfaQRCode.value = ''

  dialogStore.openDialog({
    title: t('verify-2FA'),
    description: `${t('mfa-enable-instruction-2')}`,
    size: 'lg',
    preventAccidentalClose: true,
    buttons: [
      {
        text: t('verify'),
        id: 'verify',
        handler: async () => {
          // User has clicked the "verify button - let's check"
          const verifyCode = mfaVerificationCode.value.replaceAll(' ', '')

          const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: data.id })

          if (challengeError) {
            toast.error(t('mfa-fail'))
            console.error('Cannot create MFA challenge', challengeError)
            return false
          }

          const { data: _verify, error: verifyError } = await supabase.auth.mfa.verify({ factorId: data.id, challengeId: challenge.id, code: verifyCode.trim() })
          if (verifyError) {
            toast.error(t('mfa-invalid-code'))
            return false
          }

          toast.success(t('mfa-enabled'))
          mfaEnabled.value = true
          mfaFactorId.value = data.id
        },
      },
    ],
  })

  // Check the cancel again
  const didCancel2 = await dialogStore.onDialogDismiss()
  if (didCancel2) {
    // User closed the window, go ahead and unregister mfa
    const { error: unregisterError } = await supabase.auth.mfa.unenroll({ factorId: data.id })
    if (error)
      console.error('Cannot unregister MFA', unregisterError)
  }
}

async function loadOtpVerification() {
  if (!main.auth?.id)
    return
  const { data, error } = await supabase
    .from('user_security')
    .select('email_otp_verified_at')
    .eq('user_id', main.auth.id)
    .maybeSingle()

  if (error) {
    console.error('Cannot load email OTP status', error)
    return
  }

  otpVerifiedAt.value = data?.email_otp_verified_at ?? null
}

async function sendOtpVerification() {
  if (!otpEmail.value) {
    toast.error(t('account-error'))
    return
  }
  if (otpSending.value)
    return

  otpSending.value = true
  const { error } = await supabase.auth.signInWithOtp({
    email: otpEmail.value,
    options: {
      shouldCreateUser: false,
    },
  })
  otpSending.value = false

  if (error) {
    toast.error(t('verification-failed'))
    console.error('Cannot send email OTP', error)
    return
  }

  otpVerificationCode.value = ''
  toast.success(t('email-otp-sent'))
}

async function verifyOtpForMfa() {
  if (!otpEmail.value) {
    toast.error(t('account-error'))
    return
  }
  if (!main.auth?.id)
    return

  const token = otpVerificationCode.value.replaceAll(' ', '')
  if (!token) {
    toast.error(t('email-otp-code-required'))
    return
  }
  if (otpVerificationLoading.value)
    return

  otpVerificationLoading.value = true
  const { error: verifyError } = await supabase.auth.verifyOtp({
    email: otpEmail.value,
    token,
    type: 'email',
  })

  if (verifyError) {
    otpVerificationLoading.value = false
    toast.error(t('verification-failed'))
    console.error('Cannot verify email OTP', verifyError)
    return
  }

  const { data: verifiedAt, error: recordError } = await supabase
    .rpc('record_email_otp_verified')

  otpVerificationLoading.value = false

  if (recordError || !verifiedAt) {
    toast.error(t('verification-failed'))
    console.error('Cannot store email OTP verification', recordError)
    return
  }

  otpVerifiedAt.value = verifiedAt
  toast.success(t('email-otp-verified'))
}

onMounted(async () => {
  otpNowTimer = setInterval(() => {
    otpNow.value = dayjs()
  }, 60000)
  await loadOtpVerification()
  const { data: mfaFactors, error } = await supabase.auth.mfa.listFactors()
  if (error) {
    console.error('Cannot get MFA factors', error)
    return
  }

  const unverified = mfaFactors.all.filter(factor => factor.status === 'unverified')
  if (unverified && unverified.length > 0) {
    console.log(`Found ${unverified.length} unverified MFA factors, removing all`)
    const responses = await Promise.all(unverified.map(factor => supabase.auth.mfa.unenroll({ factorId: factor.id })))

    responses.filter(res => !!res.error).forEach(() => console.error('Failed to unregister', error))
  }

  const hasMfa = mfaFactors?.all.find(factor => factor.status === 'verified')
  mfaEnabled.value = !!hasMfa

  if (hasMfa)
    mfaFactorId.value = hasMfa.id

  // Auto-trigger 2FA setup if redirected from enforcement card
  if (route.query.setup2fa === 'true' && !mfaEnabled.value) {
    // Clear the query param first, wait for it to complete, then open dialog
    // This prevents the DialogV2's route watcher from closing the dialog
    await router.replace({ query: {} })
    await nextTick()
    handleMfa()
  }
})

onBeforeUnmount(() => {
  if (otpNowTimer)
    clearInterval(otpNowTimer)
})
</script>

<template>
  <div>
    <div class="flex flex-col h-full pb-8 overflow-hidden overflow-y-auto bg-white border shadow-lg md:pb-0 max-h-fit grow md:rounded-lg dark:bg-gray-800 border-slate-300 dark:border-slate-900">
      <FormKit id="update-account" type="form" :actions="false" @submit="submit">
        <!-- Panel body -->
        <div class="p-6 space-y-6">
          <h2 class="mb-5 text-2xl font-bold dark:text-white text-slate-800">
            {{ t('personal-information') }}
          </h2>
          <div class="dark:text-gray-100">
            {{ t('you-can-change-your-') }}
          </div>
          <!-- Picture -->
          <section>
            <div class="flex items-center">
              <div class="mr-4">
                <img
                  v-if="main.user?.image_url" class="object-cover w-20 h-20 d-mask d-mask-squircle" :src="main.user?.image_url"
                  width="80" height="80" alt="User upload"
                >
                <div v-else class="p-6 text-xl bg-gray-700 d-mask d-mask-squircle">
                  <span class="font-medium text-gray-300">
                    {{ acronym }}
                  </span>
                </div>
              </div>
              <button id="change-org-pic" type="button" class="px-3 py-2 text-xs font-medium text-center text-gray-700 border rounded-lg cursor-pointer dark:text-white hover:bg-gray-100 focus:ring-4 focus:ring-blue-300 border-slate-500 dark:hover:bg-gray-600 dark:focus:ring-blue-800 focus:outline-hidden" @click="presentActionSheet">
                {{ t('change') }}
              </button>
            </div>
          </section>

          <!-- Personal Info -->
          <section>
            <div class="mt-5 space-y-4 sm:flex sm:items-center sm:space-y-0 sm:space-x-4">
              <div class="sm:w-1/2">
                <FormKit
                  type="text"
                  name="first_name"
                  autocomplete="given-name"
                  :prefix-icon="iconName"
                  :disabled="isLoading"
                  :value="main.user?.first_name ?? ''"
                  validation="required:trim"
                  enterkeyhint="next"
                  autofocus
                  :label="t('first-name')"
                />
              </div>
              <div class="sm:w-1/2">
                <FormKit
                  type="text"
                  name="last_name"
                  autocomplete="family-name"
                  :prefix-icon="iconName"
                  :disabled="isLoading"
                  enterkeyhint="next"
                  :value="main.user?.last_name ?? ''"
                  validation="required:trim"
                  :label="t('last-name')"
                />
              </div>
            </div>
            <div class="mt-5 space-y-4 sm:flex sm:items-center sm:space-y-0 sm:space-x-4">
              <div class="sm:w-1/2">
                <FormKit
                  type="email"
                  name="email"
                  :prefix-icon="iconEmail"
                  :value="main.user?.email"
                  enterkeyhint="next"
                  validation="required:trim|email"
                  :label="t('email')"
                />
              </div>
              <div class="sm:w-1/2">
                <FormKit
                  type="text"
                  name="country"
                  :prefix-icon="iconFlag"
                  :disabled="isLoading"
                  :value="main.user?.country ?? ''"
                  enterkeyhint="send"
                  validation="required:trim"
                  :label="t('country')"
                />
              </div>
            </div>
            <FormKitMessages />
          </section>
          <h3 class="mt-2 mb-5 text-2xl font-bold dark:text-white text-slate-800">
            {{ t('settings') }}
          </h3>
          <!-- Language Info -->
          <section class="flex flex-col md:flex-row md:items-center items-left">
            <p class="">
              {{ t('language') }}:
            </p>
            <div class="md:ml-6">
              <LangSelector />
            </div>
          </section>

          <section class="flex flex-col md:flex-row md:items-start items-left">
            <div class="md:w-1/2">
              <p class="dark:text-white text-slate-800">
                {{ t('email-otp-2fa-title') }}:
              </p>
              <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {{ t('email-otp-2fa-description') }}
              </p>
              <p v-if="otpVerificationStatus === 'valid'" class="mt-1 text-xs text-emerald-600">
                {{ t('email-otp-verified-until', { time: otpVerifiedUntilLabel }) }}
              </p>
              <p v-else-if="otpVerificationStatus === 'expired'" class="mt-1 text-xs text-orange-600">
                {{ t('email-otp-expired') }}
              </p>
              <p v-else class="mt-1 text-xs text-orange-600">
                {{ t('email-otp-not-verified') }}
              </p>
            </div>
            <div class="mt-3 w-full md:mt-0 md:ml-6 md:w-1/2">
              <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
                <button
                  type="button"
                  class="d-btn d-btn-outline d-btn-sm"
                  :class="{ 'opacity-50 cursor-not-allowed': otpSending }"
                  :disabled="otpSending"
                  @click="sendOtpVerification"
                >
                  {{ t('email-otp-send-code') }}
                </button>
                <button
                  type="button"
                  class="d-btn d-btn-outline d-btn-sm"
                  :class="{ 'opacity-50 cursor-not-allowed': otpVerificationLoading || !otpVerificationCode }"
                  :disabled="otpVerificationLoading || !otpVerificationCode"
                  @click="verifyOtpForMfa"
                >
                  {{ t('verify') }}
                </button>
              </div>
              <input
                v-model="otpVerificationCode"
                type="text"
                inputmode="numeric"
                :placeholder="t('verification-code')"
                class="d-input w-full mt-2"
                autocomplete="one-time-code"
                @keydown.enter.prevent="verifyOtpForMfa"
              >
            </div>
          </section>

          <section class="flex flex-col md:flex-row md:items-center items-left">
            <p class="dark:text-white text-slate-800">
              {{ t('2fa') }}:
            </p>
            <div class="md:ml-6">
              <button
                type="button"
                data-test="setup-mfa"
                class="d-btn d-btn-outline d-btn-sm"
                :class="{
                  'd-btn-success': !mfaEnabled,
                  'd-btn-error': mfaEnabled,
                  'opacity-50 cursor-not-allowed': !mfaEnabled && !otpVerificationValid,
                }"
                :disabled="!mfaEnabled && !otpVerificationValid"
                @click="handleMfa"
              >
                {{ !mfaEnabled ? t('enable') : t('disable') }}
              </button>
            </div>
          </section>
          <div class="flex flex-col md:flex-row md:items-center items-left">
            <p class="dark:text-white text-slate-800">
              {{ t('account-id') }}:
            </p>
            <div class="md:ml-6">
              <button type="button" class="px-3 py-2 text-xs font-medium text-center text-gray-700 border rounded-lg cursor-pointer dark:text-white hover:bg-gray-100 focus:ring-4 focus:ring-blue-300 border-slate-500 dark:hover:bg-gray-600 dark:focus:ring-blue-800 focus:outline-hidden" @click.prevent="copyAccountId()">
                {{ t('copy-account-id') }}
              </button>
            </div>
          </div>
          <div class="flex mb-3 text-xs font-semibold uppercase dark:text-white text-slate-400">
            <IconVersion /> <span class="pl-2"> {{ version }}</span>
          </div>
          <!-- Panel footer -->
          <footer>
            <div class="flex flex-col px-2 py-5 border-t md:px-6 border-slate-300">
              <div class="flex self-end">
                <button type="button" class="p-2 text-red-600 border border-red-400 rounded-lg hover:text-white hover:bg-red-600" @click="deleteAccount()">
                  {{ t('delete-account') }}
                </button>
                <button
                  class="p-2 ml-3 text-white bg-blue-500 rounded-lg hover:bg-blue-600 d-btn"
                  type="submit"
                  color="secondary"
                  shape="round"
                >
                  <span v-if="!isLoading" class="rounded-4xl">
                    {{ t('update') }}
                  </span>
                  <Spinner v-else size="w-8 h-8" class="px-4" color="fill-gray-100 text-gray-200 dark:text-gray-600" />
                </button>
              </div>
            </div>
          </footer>
        </div>
      </FormKit>
    </div>

    <Teleport
      v-if="
        dialogStore.showDialog
          && (dialogStore.dialogOptions?.title === t('enable-2FA')
            || dialogStore.dialogOptions?.title === t('verify-2FA'))
      "
      to="#dialog-v2-content"
      defer
    >
      <!-- QR Code display for MFA setup -->
      <div v-if="mfaQRCode" class="w-full text-center">
        <img
          :src="mfaQRCode"
          alt="QR Code for 2FA setup"
          class="mx-auto mb-4"
        >
      </div>

      <!-- MFA verification code input -->
      <div v-if="!mfaQRCode" class="w-full">
        <input
          v-model="mfaVerificationCode"
          type="text"
          :placeholder="t('verification-code')"
          class="w-full p-3 border border-gray-300 rounded-lg dark:text-white dark:bg-gray-800 dark:border-gray-600"
          @keydown.enter="$event.preventDefault()"
        >
      </div>
    </Teleport>

    <!-- Teleport for Organization Deletion Warning -->
    <Teleport v-if="dialogStore.showDialog && dialogStore.dialogOptions?.id === 'delete-account-warning-orgs'" to="#dialog-v2-content" defer>
      <div class="p-4 mt-4 border border-red-200 rounded-lg bg-red-50 dark:border-red-800 dark:bg-red-900/20">
        <h4 class="mb-3 font-semibold text-red-800 dark:text-red-200">
          {{ t('organizations-to-be-deleted') }}:
        </h4>
        <ul class="space-y-2">
          <li v-for="orgName in organizationsToDelete" :key="orgName" class="flex items-center text-red-700 dark:text-red-300">
            <span class="w-2 h-2 mr-3 bg-red-500 rounded-full" />
            <span class="font-medium">{{ orgName }}</span>
          </li>
        </ul>
      </div>
    </Teleport>

    <!-- Teleport for Paid Subscriptions Warning -->
    <Teleport v-if="dialogStore.showDialog && dialogStore.dialogOptions?.id === 'delete-account-warning-paid'" to="#dialog-v2-content" defer>
      <div class="p-4 mt-4 border border-orange-200 rounded-lg bg-orange-50 dark:border-orange-800 dark:bg-orange-900/20">
        <h4 class="mb-3 font-semibold text-orange-800 dark:text-orange-200">
          {{ t('paid-subscriptions-to-cancel') }}:
        </h4>
        <ul class="space-y-3">
          <li v-for="org in paidOrganizationsToDelete" :key="org.name" class="flex items-center justify-between text-orange-700 dark:text-orange-300">
            <div class="flex items-center">
              <span class="w-2 h-2 mr-3 bg-orange-500 rounded-full" />
              <span class="font-medium">{{ org.name }}</span>
            </div>
            <span class="px-2 py-1 text-sm bg-orange-100 rounded-full dark:bg-orange-800">
              {{ org.planName }}
            </span>
          </li>
        </ul>
      </div>
    </Teleport>

    <!-- Teleport for Final Account Deletion Warning -->
    <Teleport v-if="dialogStore.showDialog && dialogStore.dialogOptions?.id === 'delete-account-confirm'" to="#dialog-v2-content" defer>
      <div class="text-base text-gray-500 dark:text-gray-400">
        <p class="mb-4">
          This action cannot be undone. Your account and all associated data will be permanently deleted.
        </p>
        <p class="font-medium text-gray-700 dark:text-gray-300">
          Your account will be deleted after 30 days
        </p>
        <div class="mt-6">
          <label class="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            {{ t('current-password') }}
          </label>
          <input
            v-model="deleteAccountPassword"
            type="password"
            :placeholder="t('password-placeholder')"
            class="w-full p-3 border border-gray-300 rounded-lg dark:text-white dark:bg-gray-800 dark:border-gray-600"
            autocomplete="current-password"
            @keydown.enter="$event.preventDefault()"
          >
        </div>
        <div v-if="captchaKey" class="mt-4">
          <label class="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            {{ t('captcha', 'Captcha') }}
          </label>
          <VueTurnstile
            ref="deleteAccountCaptchaRef"
            v-model="deleteAccountCaptchaToken"
            size="flexible"
            :site-key="captchaKey"
          />
        </div>
      </div>
    </Teleport>
  </div>
</template>

<route lang="yaml">
  meta:
    layout: settings
      </route>
