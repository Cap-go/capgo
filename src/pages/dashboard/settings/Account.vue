<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { setErrors } from '@formkit/core'
import { FormKitMessages, reset } from '@formkit/vue'
import { toast } from 'vue-sonner'
import { initDropdowns } from 'flowbite'
import countryCodeToFlagEmoji from 'country-code-to-flag-emoji'
import copy from 'copy-text-to-clipboard'
import { useMainStore } from '~/stores/main'
import { deleteUser, hashEmail, useSupabase } from '~/services/supabase'
import type { Database } from '~/types/supabase.types'
import { useDisplayStore } from '~/stores/display'
import IconVersion from '~icons/radix-icons/update'
import { availableLocales, i18n, languages, loadLanguageAsync } from '~/modules/i18n'
import { iconEmail, iconName } from '~/services/icons'
import { pickPhoto, takePhoto } from '~/services/photos'
import { M } from '@upstash/redis/zmscore-415f6c9f'

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
// const errorMessage = ref('')

async function deleteAccount() {
  displayStore.showActionSheet = true
  displayStore.actionSheetOption = {
    header: t('are-u-sure'),
    buttons: [
      {
        text: t('button-remove'),
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
            return setErrors('update-account', [t('something-went-wrong-try-again-later')], {})
          }
        },
      },
      {
        text: t('button-cancel'),
        role: 'cancel',
        handler: () => {
          console.log('Cancel clicked')
        },
      },
    ],
  }
}

async function copyAccountId() {
  copy(main!.user!.id)
  toast.success(t('copied-to-clipboard'))
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
  displayStore.showActionSheet = true
  displayStore.actionSheetOption = {
    header: '',
    buttons: [
      {
        text: t('button-camera'),
        handler: () => {
          displayStore.showActionSheet = false
          takePhoto(isLoading, 'user', t('something-went-wrong-try-again-later'))
        },
      },
      {
        text: t('button-browse'),
        handler: () => {
          displayStore.showActionSheet = false
          pickPhoto(isLoading, 'user', t('something-went-wrong-try-again-later'))
        },
      },
      {
        text: t('button-cancel'),
        role: 'cancel',
        handler: () => {
          console.log('Cancel clicked')
        },
      },
    ],
  }
}
function getEmoji(country: string) {
  // convert country code to emoji flag
  let countryCode = country
  switch (country) {
    case 'en':
      countryCode = 'US'
      break
    case 'ko':
      countryCode = 'KR'
      break
    case 'ja':
      countryCode = 'JP'
      break
    default:
      break
  }
  return countryCodeToFlagEmoji(countryCode)
}

async function submit(form: { first_name: string, last_name: string, email: string, country: string }) {
  if (isLoading.value || !main.user?.id)
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
      if (error) {
        console.error('Cannot unregister MFA', unregisterError)
        return
      }
    } else {
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
            }
          },
        ],
      }
      displayStore.showDialog = true

      // Check the cancel again
      const didCancel = await displayStore.onDialogDismiss()
      if (didCancel) {
        // User closed the window, go ahead and unregister mfa
        const { error: unregisterError } = await supabase.auth.mfa.unenroll({ factorId: data.id })
        if (error) {
          console.error('Cannot unregister MFA', unregisterError)
          return
        }
      }
    }
  } else {
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

    const { error: unregisterError } = await supabase.auth.mfa.unenroll({ factorId: factorId })
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
  initDropdowns()

  const { data: mfaFactors, error } = await supabase.auth.mfa.listFactors()
  if (error) {
    console.error('Cannot getm MFA factors', error)
    return
  }

  const unverified = mfaFactors.all.filter(factor => factor.status === 'unverified')
  if (unverified && unverified.length > 0) {
    console.log(`Found ${unverified.length} unverified MFA factors, removing all`)
    const responses = await Promise.all(unverified.map(factor => supabase.auth.mfa.unenroll({ factorId: factor.id })))
    
    responses.filter(res => !!res.error).forEach(res => console.error('Failed to unregister', error))
  }

  const hasMfa = mfaFactors?.all.find(factor => factor.status === 'verified')
  mfaEnabled.value = !!hasMfa

  if (hasMfa) {
    mfaFactorId.value = hasMfa.id
  }
})
</script>

<template>
  <div class="h-full pb-8 max-h-fit grow md:pb-0">
    <FormKit id="update-account" type="form" :actions="false" @submit="submit">
      <!-- Panel body -->
      <div class="p-6 space-y-6">
        <h2 class="mb-5 text-2xl font-bold text-slate-800 dark:text-white">
          {{ t('my-account') }}
        </h2>
        <!-- Picture -->
        <section>
          <div class="flex items-center">
            <div class="mr-4">
              <img
                v-if="main.user?.image_url" class="object-cover w-20 h-20 mask mask-squircle" :src="main.user?.image_url"
                width="80" height="80" alt="User upload"
              >
              <div v-else class="flex items-center justify-center w-20 h-20 text-4xl border border-black rounded-full dark:border-white">
                <p>{{ acronym }}</p>
              </div>
            </div>
            <button class="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-4 py-2.5 text-center inline-flex items-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800" @click="presentActionSheet">
              {{ t('change') }}
            </button>
          </div>
        </section>
        <!-- Language Info -->
        <section class="flex flex-col md:flex-row md:items-center items-left">
          <p class="text-slate-800 dark:text-white">
            {{ t('language') }}
          </p>
          <div class="md:ml-6">
            <button id="dropdownDefaultButton" data-dropdown-toggle="dropdown" class="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-4 py-2.5 text-center inline-flex items-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800" type="button">
              {{ getEmoji(i18n.global.locale.value) }} {{ languages[i18n.global.locale.value as keyof typeof languages] }} <svg class="w-4 h-4 ml-2" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
            </button>
            <!-- Dropdown menu -->
            <div id="dropdown" class="z-10 hidden overflow-y-scroll bg-white divide-y divide-gray-100 rounded-lg shadow w-44 dark:bg-gray-700 h-72">
              <ul class="py-2 text-sm text-gray-700 dark:text-gray-200" aria-labelledby="dropdownDefaultButton">
                <li v-for="locale in availableLocales" :key="locale" @click="loadLanguageAsync(locale)">
                  <span class="block px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white">{{ getEmoji(locale) }} {{ languages[locale as keyof typeof languages] }}</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

       <section class="flex flex-col md:flex-row md:items-center items-left">
          <p class="text-slate-800 dark:text-white">
            {{ t('2fa') }}
          </p>
          <button :class="`md:ml-6 text-white ${!mfaEnabled ? 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-800' : 'bg-red-500 hover:bg-red-600 focus:ring-rose-600'} focus:ring-4 focus:outline-none font-medium rounded-lg text-sm px-4 py-2.5 text-center inline-flex items-center`" @click="handleMfa">
            {{ !mfaEnabled ? t('enable') : t('disable') }}
          </button>
       </section>

        <!-- Personal Info -->
        <section>
          <h3 class="mb-1 text-xl font-bold leading-snug text-slate-800 dark:text-white">
            {{ t('personal-information') }}
          </h3>
          <div class="text-sm dark:text-gray-100">
            {{ t('you-can-change-your-') }}
          </div>

          <div class="mt-5 space-y-4 sm:flex sm:items-center sm:items-stretch sm:space-x-4 sm:space-y-0">
            <div class="sm:w-1/2">
              <FormKit
                type="text"
                name="first_name"
                autocomplete="given-name"
                :prefix-icon="iconName"
                :disabled="isLoading"
                :value="main.user?.first_name"
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
                :value="main.user?.last_name"
                validation="required:trim"
                :label="t('last-name')"
              />
            </div>
          </div>
          <div class="mt-5 space-y-4 sm:flex sm:items-center sm:items-stretch sm:space-x-4 sm:space-y-0">
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
                prefix-icon="flag"
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
        <div class="flex flex-col md:flex-row md:items-center items-left">
          <p class="text-slate-800 dark:text-white">
            {{ t('account-id') }}:
          </p>
          <button class=" ml-4 text-white bg-blue-700 hover:bg-blue-800 focus:outline-none  font-medium rounded-lg text-sm px-4 py-2.5 text-center inline-flex items-center dark:bg-blue-600 dark:hover:bg-blue-700" @click.prevent="copyAccountId()">
            {{ t('copy-account-id') }}
          </button>
        </div>
        <div class="flex mb-3 text-xs font-semibold uppercase text-slate-400 dark:text-white">
          <IconVersion /> <span class="pl-2"> {{ version }}</span>
        </div>
      </div>
      <!-- Panel footer -->
      <footer>
        <div class="flex flex-col px-6 py-5 border-t border-slate-200">
          <div class="flex self-end">
            <button class="p-2 text-white bg-red-400 border-red-200 rounded btn hover:bg-red-600" @click="deleteAccount()">
              {{ t('delete-account') }}
            </button>
            <button
              class="p-2 ml-3 text-white bg-blue-500 rounded btn hover:bg-blue-600"
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
</template>

<route lang="yaml">
meta:
  layout: settings
    </route>
