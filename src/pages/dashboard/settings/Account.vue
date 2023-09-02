<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { setErrors } from '@formkit/core'
import { FormKitMessages, reset } from '@formkit/vue'
import { toast } from 'vue-sonner'
import { initDropdowns } from 'flowbite'
import countryCodeToFlagEmoji from 'country-code-to-flag-emoji'
import { useMainStore } from '~/stores/main'
import { deleteUser, useSupabase } from '~/services/supabase'
import type { Database } from '~/types/supabase.types'
import { useDisplayStore } from '~/stores/display'
import IconVersion from '~icons/radix-icons/update'
import { availableLocales, i18n, languages, loadLanguageAsync } from '~/modules/i18n'
import { iconEmail, iconName } from '~/services/icons'
import { pickPhoto, takePhoto } from '~/services/photos'

const version = import.meta.env.VITE_APP_VERSION
const { t } = useI18n()
const supabase = useSupabase()
const displayStore = useDisplayStore()
const router = useRouter()
const main = useMainStore()
const isLoading = ref(false)
// const errorMessage = ref('')

async function hashEmail(email: string) {
  const encoder = new TextEncoder()
  const data = encoder.encode(email)

  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('')
  return hashHex
}

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

async function submit(form: { first_name: string; last_name: string; email: string; country: string }) {
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
onMounted(() => {
  initDropdowns()
})
</script>

<template>
  <div class="h-full pb-8 overflow-y-scroll max-h-fit grow md:pb-0">
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
