<script setup lang="ts">
import type { Database } from '~/types/supabase.types'
import { Capacitor } from '@capacitor/core'
import { setErrors } from '@formkit/core'
import { FormKit, FormKitMessages, reset } from '@formkit/vue'
import dayjs from 'dayjs'
import { useI18n } from 'petite-vue-i18n'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import iconEmail from '~icons/oui/email?raw'
import iconFlag from '~icons/ph/flag?raw'
import iconName from '~icons/ph/user?raw'
import IconVersion from '~icons/radix-icons/update'
import { pickPhoto, takePhoto } from '~/services/photos'
import { deleteUser, hashEmail, useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'
import { useMainStore } from '~/stores/main'

const version = import.meta.env.VITE_APP_VERSION
const { t } = useI18n()
const supabase = useSupabase()
const displayStore = useDisplayStore()
const router = useRouter()
const main = useMainStore()
const isLoading = ref(false)
// mfa = 2fa
const mfaEnabled = ref(false)
const mfaFactorId = ref('')
async function deleteAccount() {
  displayStore.dialogOption = {
    header: t('are-u-sure'),
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
        handler: () => {
          console.log('Cancel clicked')
        },
      },
      {
        text: t('button-remove'),
        role: 'danger',
        handler: async () => {
          if (!main.auth || main.auth?.email == null)
            return
          const supabaseClient = useSupabase()

          const authUser = await supabase.auth.getUser()
          if (authUser.error)
            return setErrors('update-account', [t('something-went-wrong-try-again-later')], {})

          try {
            const { data: user } = await supabaseClient
              .from('users')
              .select()
              .eq('id', authUser.data.user.id)
              .single()
            if (!user)
              return setErrors('update-account', [t('something-went-wrong-try-again-later')], {})

            if (user.email.endsWith('review@capgo.app') && Capacitor.isNativePlatform()) {
              const { error: banErr } = await supabase
                .from('users')
                .update({ ban_time: dayjs().add(5, 'minutes').toDate().toISOString() })
                .eq('id', user.id)

              if (banErr) {
                console.error('Cannot set ban duration', banErr)
                return setErrors('update-account', [t('something-went-wrong-try-again-later')], {})
              }

              await main.logout()
              router.replace('/login')
              return
            }

            if (user.customer_id) {
              await supabaseClient
                .from('stripe_info')
                .delete()
                .eq('customer_id', user.customer_id)
            }

            const hashedEmail = await hashEmail(authUser.data.user.email!)

            await supabaseClient
              .from('deleted_account')
              .insert({
                email: hashedEmail,
              })

            await supabaseClient
              .from('users')
              .delete()
              .eq('id', user.id)

            await deleteUser()

            await main.logout()
            router.replace('/login')
          }
          catch (error) {
            console.error(error)
            return setErrors('update-account', [t('something-went-wrong-try-again-later')], {})
          }
        },
      },
    ],
  }
  displayStore.showDialog = true
  return displayStore.onDialogDismiss()
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
    displayStore.dialogOption = {
      header: t('cannot-copy'),
      message: main!.user!.id,
      buttons: [
        {
          text: t('button-cancel'),
          role: 'cancel',
        },
      ],
    }
    displayStore.showDialog = true
    await displayStore.onDialogDismiss()
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
  displayStore.dialogOption = {
    header: t('change-your-picture'),
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
        handler: () => {
          takePhoto('update-account', isLoading, 'user', t('something-went-wrong-try-again-later'))
        },
      },
      {
        text: t('button-browse'),
        handler: () => {
          pickPhoto('update-account', isLoading, 'user', t('something-went-wrong-try-again-later'))
        },
      },
    ],
  }
  displayStore.showDialog = true
  return displayStore.onDialogDismiss()
}

async function submit(form: { first_name: string, last_name: string, email: string, country: string }) {
  if (isLoading.value || !main.user?.id)
    return
  if (form.first_name === main.user?.first_name && form.last_name === main.user?.last_name && form.email === main.user?.email && form.country === main.user?.country)
    return
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
  }

  const { data: usr, error: dbError } = await supabase
    .from('users')
    .upsert(updateData)
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

async function handleMfa() {
  if (!mfaEnabled.value) {
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
    })

    if (error) {
      toast.error(t('mfa-fail'))
      console.error(error)
      return
    }

    displayStore.dialogOption = {
      header: t('enable-2FA'),
      message: `${t('mfa-enable-instruction')}`,
      image: data.totp.qr_code,
      headerStyle: 'w-full text-center',
      textStyle: 'w-full text-center',
      size: 'max-w-lg',
      buttonCenter: true,
      preventAccidentalClose: true,
      buttons: [
        {
          text: t('verify'),
          id: 'verify',
        },
      ],
    }
    displayStore.showDialog = true
    const didCancel = await displayStore.onDialogDismiss()

    if (didCancel) {
      // User closed the window, go ahead and unregister mfa
      const { error: unregisterError } = await supabase.auth.mfa.unenroll({ factorId: data.id })
      if (error)
        console.error('Cannot unregister MFA', unregisterError)
    }
    else {
      // User has scanned the code - verify his claim

      // Open the dialog
      displayStore.dialogOption = {
        header: t('verify-2FA'),
        message: `${t('mfa-enable-instruction-2')}`,
        input: true,
        headerStyle: 'w-full text-center',
        textStyle: 'w-full text-center',
        size: 'max-w-lg',
        buttonCenter: true,
        preventAccidentalClose: true,
        buttons: [
          {
            text: t('verify'),
            id: 'verify',
            preventClose: true,
            handler: async () => {
              // User has clicked the "verify button - let's check"
              const verifyCode = displayStore.dialogInputText.replace(' ', '')

              const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: data.id })

              if (challengeError) {
                toast.error(t('mfa-fail'))
                console.error('Cannot create MFA challange', challengeError)
                displayStore.showDialog = false
                return
              }

              const { data: _verify, error: verifyError } = await supabase.auth.mfa.verify({ factorId: data.id, challengeId: challenge.id, code: verifyCode.trim() })
              if (verifyError) {
                toast.error(t('mfa-invalid-code'))
                return
              }

              toast.success(t('mfa-enabled'))
              mfaEnabled.value = true
              mfaFactorId.value = data.id
              displayStore.showDialog = false
            },
          },
        ],
      }
      displayStore.showDialog = true

      // Check the cancel again
      const didCancel = await displayStore.onDialogDismiss()
      if (didCancel) {
        // User closed the window, go ahead and unregister mfa
        const { error: unregisterError } = await supabase.auth.mfa.unenroll({ factorId: data.id })
        if (error)
          console.error('Cannot unregister MFA', unregisterError)
      }
    }
  }
  else {
    // disable mfa
    displayStore.dialogOption = {
      header: t('alert-2fa-disable'),
      message: `${t('alert-not-reverse-message')} ${t('alert-disable-2fa-message')}?`,
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
    }
    displayStore.showDialog = true
    const canceled = await displayStore.onDialogDismiss()

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
}

onMounted(async () => {
  const { data: mfaFactors, error } = await supabase.auth.mfa.listFactors()
  if (error) {
    console.error('Cannot getm MFA factors', error)
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
})
</script>

<template>
  <div>
    <div class="h-full pb-8 max-h-fit grow md:pb-0">
      <FormKit id="update-account" type="form" :actions="false" @submit="submit">
        <!-- Panel body -->
        <div class="p-6 space-y-6">
          <h2 class="mb-5 text-2xl font-bold text-slate-800 dark:text-white">
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
                  v-if="main.user?.image_url" class="object-cover w-20 h-20 mask mask-squircle" :src="main.user?.image_url"
                  width="80" height="80" alt="User upload"
                >
                <div v-else class="p-6 text-xl bg-gray-700 mask mask-squircle">
                  <span class="font-medium text-gray-300">
                    {{ acronym }}
                  </span>
                </div>
              </div>
              <button id="change-org-pic" type="button" class="px-3 py-2 text-xs font-medium text-center text-gray-700 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-white border-slate-500 focus:ring-4 focus:outline-none focus:ring-blue-300 dark:focus:ring-blue-800" @click="presentActionSheet">
                {{ t('change') }}
              </button>
            </div>
          </section>

          <!-- Personal Info -->
          <section>
            <div class="mt-5 space-y-4 sm:flex sm:items-center sm:space-x-4 sm:space-y-0">
              <div class="sm:w-1/2">
                <FormKit
                  type="text"
                  name="first_name"
                  autocomplete="given-name"
                  :prefix-icon="iconName"
                  :disabled="isLoading"
                  :value="main.user?.first_name || ''"
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
                  :value="main.user?.last_name || ''"
                  validation="required:trim"
                  :label="t('last-name')"
                />
              </div>
            </div>
            <div class="mt-5 space-y-4 sm:flex sm:items-center sm:space-x-4 sm:space-y-0">
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
                  :value="main.user?.country || ''"
                  enterkeyhint="send"
                  validation="required:trim"
                  :label="t('country')"
                />
              </div>
            </div>
            <FormKitMessages />
          </section>
          <h3 class="mt-2 mb-5 text-2xl font-bold text-slate-800 dark:text-white">
            {{ t('settings') }}
          </h3>
          <!-- Language Info -->
          <section class="flex flex-col text-slate-800 dark:text-white md:flex-row md:items-center items-left">
            <p class="">
              {{ t('language') }}:
            </p>
            <div class="md:ml-6">
              <LangSelector />
            </div>
          </section>

          <section class="flex flex-col md:flex-row md:items-center items-left">
            <p class="text-slate-800 dark:text-white">
              {{ t('2fa') }}:
            </p>
            <div class="md:ml-6">
              <button
                type="button"
                class="px-3 py-2 text-xs font-medium text-center text-gray-700 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-white focus:ring-4 focus:outline-none focus:ring-blue-300 dark:focus:ring-blue-800"
                :class="{ 'border border-emerald-600 focus:ring-emerald-800': !mfaEnabled, 'border border-red-500 focus:ring-rose-600': mfaEnabled }"
                @click="handleMfa"
              >
                {{ !mfaEnabled ? t('enable') : t('disable') }}
              </button>
            </div>
          </section>
          <div class="flex flex-col md:flex-row md:items-center items-left">
            <p class="text-slate-800 dark:text-white">
              {{ t('account-id') }}:
            </p>
            <div class="md:ml-6">
              <button type="button" class="px-3 py-2 text-xs font-medium text-center text-gray-700 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-white border-slate-500 focus:ring-4 focus:outline-none focus:ring-blue-300 dark:focus:ring-blue-800" @click.prevent="copyAccountId()">
                {{ t('copy-account-id') }}
              </button>
            </div>
          </div>
          <div class="flex mb-3 text-xs font-semibold uppercase text-slate-400 dark:text-white">
            <IconVersion /> <span class="pl-2"> {{ version }}</span>
          </div>
        </div>
        <!-- Panel footer -->
        <footer>
          <div class="flex flex-col px-6 py-5 border-t border-slate-300">
            <div class="flex self-end">
              <button type="button" class="p-2 text-red-600 border border-red-400 rounded-lg hover:bg-red-600 hover:text-white" @click="deleteAccount()">
                {{ t('delete-account') }}
              </button>
              <button
                class="p-2 ml-3 text-white bg-blue-500 rounded-lg btn hover:bg-blue-600"
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
      </FormKit>
    </div>
  </div>
</template>

<route lang="yaml">
  meta:
    layout: settings
      </route>
