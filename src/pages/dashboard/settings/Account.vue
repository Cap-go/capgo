<script setup lang="ts">
import mime from 'mime'
import { decode } from 'base64-arraybuffer'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { Filesystem } from '@capacitor/filesystem'
import { setErrors } from '@formkit/core'
import { FormKitMessages } from '@formkit/vue'
import { toast } from 'vue-sonner'
import { initDropdowns } from 'flowbite'
import countryCodeToFlagEmoji from 'country-code-to-flag-emoji'
import { useMainStore } from '~/stores/main'
import { useSupabase } from '~/services/supabase'
import type { Database } from '~/types/supabase.types'
import { useDisplayStore } from '~/stores/display'
import IconVersion from '~icons/radix-icons/update'
import { availableLocales, i18n, loadLanguageAsync } from '~/modules/i18n'
import { iconEmail, iconName } from '~/services/icons'

const version = import.meta.env.VITE_APP_VERSION
const { t } = useI18n()
const supabase = useSupabase()
const displayStore = useDisplayStore()
const router = useRouter()
const main = useMainStore()
const isLoading = ref(false)
// const errorMessage = ref('')

async function updloadPhoto(data: string, fileName: string, contentType: string) {
  const { error } = await supabase.storage
    .from('images')
    .upload(`${main.user?.id}/${fileName}`, decode(data), {
      contentType,
    })

  const { data: res } = supabase.storage
    .from('images')
    .getPublicUrl(`${main.user?.id}/${fileName}`)

  const { data: usr, error: dbError } = await supabase
    .from('users')
    .update({ image_url: res.publicUrl })
    .eq('id', main.user?.id)
    .select()
    .single()
  isLoading.value = false

  if (error || dbError || !res.publicUrl || !usr) {
    setErrors('update-account', [t('something-went-wrong-try-again-later')], {})
    console.error('upload error', error, dbError)
    return
  }
  main.user = usr
}

async function takePhoto() {
  const cameraPhoto = await Camera.getPhoto({
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Camera,
    quality: 100,
  })

  isLoading.value = true

  const fileName = `${new Date().getTime()}.${cameraPhoto.format}`

  if (!cameraPhoto.dataUrl)
    return

  const contentType = mime.getType(cameraPhoto.format)

  if (!contentType)
    return
  try {
    await updloadPhoto(cameraPhoto.dataUrl.split('base64,')[1], fileName, contentType)
  }
  catch (e) {
    console.error(e)
    isLoading.value = false
  }
}
function blobToData(blob: Blob) {
  return new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.readAsDataURL(blob)
  })
}
async function pickPhoto() {
  const { photos } = await Camera.pickImages({
    limit: 1,
    quality: 100,
  })
  isLoading.value = true
  if (photos.length === 0)
    return
  try {
    let contents
    if (photos[0].path) {
      contents = await Filesystem.readFile({
        path: photos[0].path || photos[0].webPath,
      })
    }
    else {
      const blob = await blobToData(await fetch(photos[0].webPath).then(r => r.blob()))
      contents = { data: blob.split('base64,')[1] }
    }
    const contentType = mime.getType(photos[0].format)
    if (!contentType)
      return
    await updloadPhoto(
      contents.data,
      `${new Date().getTime()}.${photos[0].format}`,
      contentType,
    )
  }
  catch (e) {
    console.error(e)
    isLoading.value = false
  }
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
          const { error } = await supabase
            .from('deleted_account')
            .insert({
              email: main.auth.email,
            })
          if (error) {
            console.error(error)
            setErrors('update-account', [t('something-went-wrong-try-again-later')], {})
          }
          else {
            await main.logout()
            router.replace('/login')
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
          takePhoto()
        },
      },
      {
        text: t('button-browse'),
        handler: () => {
          displayStore.showActionSheet = false
          pickPhoto()
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
    email: form.email,
    country: form.country,
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
              {{ getEmoji(i18n.global.locale.value) }} <svg class="w-4 h-4 ml-2" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
            </button>
            <!-- Dropdown menu -->
            <div id="dropdown" class="z-10 hidden bg-white divide-y divide-gray-100 rounded-lg shadow w-44 dark:bg-gray-700">
              <ul class="py-2 text-sm text-gray-700 dark:text-gray-200" aria-labelledby="dropdownDefaultButton">
                <li v-for="locale in availableLocales" :key="locale" @click="loadLanguageAsync(locale)">
                  <span class="block px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white">{{ getEmoji(locale) }}</span>
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
                disabled
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
