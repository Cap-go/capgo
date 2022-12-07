<script setup lang="ts">
import mime from 'mime'
import { decode } from 'base64-arraybuffer'
import {
  IonSpinner, actionSheetController,
} from '@ionic/vue'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { computed, reactive, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { Filesystem } from '@capacitor/filesystem'
import { useVuelidate } from '@vuelidate/core'
import { required } from '@vuelidate/validators'
import { useMainStore } from '~/stores/main'
import { useSupabase } from '~/services/supabase'
import type { Database } from '~/types/supabase.types'

const { t } = useI18n()
const supabase = useSupabase()
const router = useRouter()
const main = useMainStore()
const isLoading = ref(false)
const errorMessage = ref('')

const updloadPhoto = async (data: string, fileName: string, contentType: string) => {
  const { error } = await supabase.storage
    .from('images')
    .upload(`${main.auth?.id}/${fileName}`, decode(data), {
      contentType,
    })

  const { data: res } = supabase.storage
    .from('images')
    .getPublicUrl(`${main.auth?.id}/${fileName}`)

  const { data: usr, error: dbError } = await supabase
    .from('users')
    .update({ image_url: res.publicUrl })
    .eq('id', main.auth?.id)
    .select()
    .single()
  isLoading.value = false

  if (error || dbError || !res.publicUrl || !usr) {
    errorMessage.value = t('something-went-wrong-try-again-later')
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
  const actionSheet = await actionSheetController.create({
    header: t('account.delete_sure'),
    buttons: [
      {
        text: t('button.remove'),
        handler: async () => {
          if (!main.auth || main.auth?.email === undefined)
            return
          const { error } = await supabase
            .from('deleted_account')
            .insert({
              email: main.auth.email,
            })
          if (error) {
            console.error(error)
            errorMessage.value = t('something-went-wrong-try-again-later')
          }
          else {
            await main.logout()
            router.replace('/login')
          }
        },
      },
      {
        text: t('button.cancel'),
        role: 'cancel',
        handler: () => {
          console.log('Cancel clicked')
        },
      },
    ],
  })
  await actionSheet.present()
}

const acronym = computed(() => {
  if (main.user?.first_name && main.user.last_name)
    return main.user?.first_name[0] + main.user?.last_name[0]
  else if (main.user?.first_name)
    return main.user?.first_name[0]
  else if (main.user?.last_name)
    return main.user?.last_name[0]
  return '??'
})

const presentActionSheet = async () => {
  const actionSheet = await actionSheetController.create({
    buttons: [
      {
        text: t('button.camera'),
        handler: () => {
          actionSheet.dismiss()
          takePhoto()
        },
      },
      {
        text: t('button.browse'),
        handler: () => {
          actionSheet.dismiss()
          pickPhoto()
        },
      },
      {
        text: t('button.cancel'),
        role: 'cancel',
        handler: () => {
          console.log('Cancel clicked')
        },
      },
    ],
  })
  await actionSheet.present()
}

const route = useRoute()

const form = reactive({
  first_name: '',
  last_name: '',
  email: main.auth?.email,
  country: '',
})

const rules = computed(() => ({
  first_name: { required },
  last_name: { required },
  email: { required },
}))

const v$ = useVuelidate(rules, form)

const submit = async () => {
  isLoading.value = true
  const isFormCorrect = await v$.value.$validate()
  if (!isFormCorrect || !main.auth?.id || !form.email) {
    isLoading.value = false
    return
  }

  const updateData: Database['public']['Tables']['users']['Insert'] = {
    id: main.auth?.id,
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
    errorMessage.value = dbError?.message || 'Unknow'
    isLoading.value = false
    return
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
        email
      `)
      .eq('id', main.auth?.id)
      .single()
    if (usr) {
      console.log('usr', usr)
      form.email = usr.email || ''
      form.country = usr.country || ''
      form.first_name = usr.first_name || ''
      form.last_name = usr.last_name || ''
    }
  }
})
</script>

<template>
  <div class="grow">
    <form
      @submit.prevent="submit"
    >
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
                v-if="main.user?.image_url" class="object-cover w-20 h-20 rounded-full" :src="main.user?.image_url"
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

          <div class="mt-5 space-y-4 sm:flex sm:items-center sm:space-y-0 sm:space-x-4">
            <div class="sm:w-1/2">
              <label class="block mb-1 text-sm font-medium dark:text-white" for="name">First Name</label>
              <input
                v-model="form.first_name" class="w-full form-input dark:bg-gray-700 dark:text-white"
                :disabled="isLoading"
                autofocus
                required
                :placeholder="t('accountProfile.first-name')"
                type="text"
              >
              <div v-for="(error, index) of v$.last_name.$errors" :key="index">
                <p class="mt-2 mb-4 text-xs italic text-pumpkin-orange-900">
                  {{ t('accountProfile.first-name') }}: {{ error.$message }}
                </p>
              </div>
            </div>
            <div class="sm:w-1/2">
              <label class="block mb-1 text-sm font-medium dark:text-white" for="business-id">Last Name</label>
              <input
                v-model="form.last_name" class="w-full form-input dark:bg-gray-700 dark:text-white"
                :disabled="isLoading"
                required
                :placeholder="t('accountProfile.last-name')"
                type="text"
              >
              <div v-for="(error, index) of v$.last_name.$errors" :key="index">
                <p class="mt-2 mb-4 text-xs italic text-pumpkin-orange-900">
                  {{ t('accountProfile.last-name') }}: {{ error.$message }}
                </p>
              </div>
            </div>
          </div>
          <div class="mt-5 space-y-4 sm:flex sm:items-center sm:space-y-0 sm:space-x-4">
            <div class="sm:w-1/2">
              <label class="block mb-1 text-sm font-medium dark:text-white" for="location">Email</label>
              <input
                v-model="form.email" class="w-full form-input dark:bg-gray-700 dark:text-white hover:cursor-not-allowed"
                required
                disabled
                inputmode="email"
                :placeholder="t('accountProfile.email')"
                type="email"
              >
            </div>
            <div class="sm:w-1/2">
              <label class="block mb-1 text-sm font-medium dark:text-white" for="location">Country</label>
              <input
                v-model="form.country"
                class="w-full form-input dark:bg-gray-700 dark:text-white"
                :disabled="isLoading"
                required
                :placeholder="t('accountProfile.country')"
                type="text"
              >
            </div>
          </div>
        </section>
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
              :disabled="isLoading"
              type="submit"
              color="secondary"
              shape="round"
            >
              <span v-if="!isLoading" class="rounded-4xl">
                {{ t('accountProfile.update') }}
              </span>
              <IonSpinner v-else name="crescent" color="light" />
            </button>
          </div>
        </div>
      </footer>
    </form>
  </div>
</template>

<style scoped>
ion-datetime {
    height: auto;
    width: auto;

    max-width: 350px;
  }
  ion-modal {
    --width: 290px;
    --height: 382px;
    --border-radius: 8px;
  }

  ion-modal ion-datetime {
    height: 382px;
  }
</style>
