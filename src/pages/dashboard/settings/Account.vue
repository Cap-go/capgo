<script setup lang="ts">
import mime from 'mime'
import { decode } from 'base64-arraybuffer'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { computed, reactive, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { Filesystem } from '@capacitor/filesystem'
import { setErrors } from '@formkit/core'
import { FormKitMessages } from '@formkit/vue'
import { useMainStore } from '~/stores/main'
import { useSupabase } from '~/services/supabase'
import type { Database } from '~/types/supabase.types'
import { useDisplayStore } from '~/stores/display'
import IconVersion from '~icons/radix-icons/update'

const version = import.meta.env.VITE_APP_VERSION
const { t } = useI18n()
const supabase = useSupabase()
const displayStore = useDisplayStore()
const router = useRouter()
const main = useMainStore()
const isLoading = ref(false)
// const errorMessage = ref('')

const updloadPhoto = async (data: string, fileName: string, contentType: string) => {
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

const takePhoto = async () => {
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
const blobToData = (blob: Blob) => {
  return new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.readAsDataURL(blob)
  })
}
const pickPhoto = async () => {
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

const deleteAccount = async () => {
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

const presentActionSheet = async () => {
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

const route = useRoute()

const user = reactive({
  first_name: '',
  last_name: '',
  email: main.auth?.email,
  country: '',
})

const submit = async (form: { first_name: string; last_name: string; email: string; country: string }) => {
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
    displayStore.messageToast.push(t('account-updated-succ'))
  }
  main.user = usr
  isLoading.value = false
}
watchEffect(async () => {
  if (route.path === '/dashboard/settings/account') {
    const { data: usr } = await supabase
      .from('users')
      .select(`
        id,
        first_name,
        last_name,
        country,
        email,
        billing_email
      `)
      .eq('id', main.user?.id)
      .single()
    if (usr) {
      console.log('usr', usr)
      user.email = usr.email || ''
      user.country = usr.country || ''
      user.first_name = usr.first_name || ''
      user.last_name = usr.last_name || ''
    }
  }
})
</script>

<template>
  <div class="h-full pb-8 overflow-y-scroll md:pb-0 grow max-h-fit">
    <FormKit id="update-account" messages-class="text-red-500" type="form" :actions="false" @submit="submit">
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
              <div v-else class="flex items-center justify-center w-20 h-20 text-4xl border border-white rounded-full">
                <p>{{ acronym }}</p>
              </div>
            </div>
            <button class="p-2 text-white bg-blue-500 rounded hover:bg-blue-600" @click="presentActionSheet">
              {{ t('change') }}
            </button>
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

          <div class="mt-5 space-y-4 sm:flex sm:items-stretch sm:items-center sm:space-y-0 sm:space-x-4">
            <div class="sm:w-1/2">
              <FormKit
                type="text"
                name="first_name"
                autocomplete="given-name"
                :disabled="isLoading"
                :value="user.first_name"
                validation="required:trim"
                enterkeyhint="next"
                autofocus
                :label="t('first-name')"
                :placeholder="t('first-name')"
                input-class="w-full p-2 form-input dark:bg-gray-700 dark:text-white"
                message-class="text-red-500"
              />
            </div>
            <div class="sm:w-1/2">
              <FormKit
                type="text"
                name="first_name"
                autocomplete="family-name"
                :disabled="isLoading"
                enterkeyhint="next"
                :value="user.last_name"
                validation="required:trim"
                :label="t('last-name')"
                :placeholder="t('last-name')"
                input-class="w-full p-2 form-input dark:bg-gray-700 dark:text-white"
                message-class="text-red-500"
              />
            </div>
          </div>
          <div class="mt-5 space-y-4 sm:flex sm:items-stretch sm:items-center sm:space-y-0 sm:space-x-4">
            <div class="sm:w-1/2">
              <FormKit
                type="email"
                name="email"
                disabled
                :value="user.email"
                enterkeyhint="next"
                validation="required:trim|email"
                :label="t('email')"
                :placeholder="t('email')"
                input-class="w-full p-2 form-input dark:bg-gray-700 dark:text-white"
                message-class="text-red-500"
              />
            </div>
            <div class="sm:w-1/2">
              <FormKit
                type="text"
                name="country"
                :disabled="isLoading"
                :value="user.country"
                enterkeyhint="send"
                validation="required:trim"
                :label="t('country')"
                :placeholder="t('country')"
                input-class="w-full p-2 form-input dark:bg-gray-700 dark:text-white"
                message-class="text-red-500"
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

