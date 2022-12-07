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
import type { definitions } from '~/types/supabase'

const { t } = useI18n()
const supabase = useSupabase()
const router = useRouter()
const main = useMainStore()
const isLoading = ref(false)
const errorMessage = ref('')
const auth = supabase.auth.user()

const updloadPhoto = async (data: string, fileName: string, contentType: string) => {
  const { error } = await supabase.storage
    .from('images')
    .upload(`${auth?.id}/${fileName}`, decode(data), {
      contentType,
    })

  const { publicURL, error: urlError } = supabase.storage
    .from('images')
    .getPublicUrl(`${auth?.id}/${fileName}`)

  const { data: usr, error: dbError } = await supabase
    .from('users')
    .update({ image_url: publicURL })
    .eq('id', auth?.id)
    .single()
  isLoading.value = false

  if (error || urlError || dbError || !publicURL || !usr) {
    errorMessage.value = t('something-went-wrong-try-again-later')
    console.error('upload error', error, urlError, dbError)
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
          const { error } = await supabase
            .from('deleted_account')
            .insert({
              email: main.auth?.email,
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
  email: auth?.email,
  country: '',
})

const rules = computed(() => ({
  first_name: { required },
  last_name: { required },
}))

const v$ = useVuelidate(rules, form)

const submit = async () => {
  isLoading.value = true
  const isFormCorrect = await v$.value.$validate()
  if (!isFormCorrect)
    isLoading.value = false

  const updateData: Partial<definitions['users']> = {
    id: auth?.id,
    first_name: form.first_name,
    last_name: form.last_name,
    email: form.email,
    country: form.country,
  }

  const { data: usr, error: dbError } = await supabase
    .from('users')
    .upsert(updateData)
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
      .eq('id', auth?.id)
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
        <h2 class="text-2xl text-slate-800 dark:text-white font-bold mb-5">
          {{ t('my-account') }}
        </h2>
        <!-- Picture -->
        <section>
          <div class="flex items-center">
            <div class="mr-4">
              <img
                v-if="main.user?.image_url" class="w-20 h-20 object-cover rounded-full" :src="main.user?.image_url"
                width="80" height="80" alt="User upload"
              >
              <div v-else class="w-20 h-20 rounded-full flex justify-center items-center border-white border text-4xl">
                <p>{{ acronym }}</p>
              </div>
            </div>
            <button class="bg-blue-500 hover:bg-blue-600 text-white p-2 rounded" @click="presentActionSheet">
              {{ t('change') }}
            </button>
          </div>
        </section>
        <!-- Personal Info -->
        <section>
          <h3 class="text-xl leading-snug text-slate-800 dark:text-white font-bold mb-1">
            {{ t('personal-information') }}
          </h3>
          <div class="text-sm dark:text-gray-100">
            {{ t('you-can-change-your-') }}
          </div>

          <div class="sm:flex sm:items-center space-y-4 sm:space-y-0 sm:space-x-4 mt-5">
            <div class="sm:w-1/2">
              <label class="block text-sm font-medium mb-1 dark:text-white" for="name">First Name</label>
              <input
                v-model="form.first_name" class="form-input w-full dark:bg-gray-700 dark:text-white"
                :disabled="isLoading"
                autofocus
                required
                :placeholder="t('accountProfile.first-name')"
                type="text"
              >
              <div v-for="(error, index) of v$.last_name.$errors" :key="index">
                <p class="text-pumpkin-orange-900 text-xs italic mt-2 mb-4">
                  {{ t('accountProfile.first-name') }}: {{ error.$message }}
                </p>
              </div>
            </div>
            <div class="sm:w-1/2">
              <label class="block text-sm font-medium mb-1 dark:text-white" for="business-id">Last Name</label>
              <input
                v-model="form.last_name" class="form-input w-full dark:bg-gray-700 dark:text-white"
                :disabled="isLoading"
                required
                :placeholder="t('accountProfile.last-name')"
                type="text"
              >
              <div v-for="(error, index) of v$.last_name.$errors" :key="index">
                <p class="text-pumpkin-orange-900 text-xs italic mt-2 mb-4">
                  {{ t('accountProfile.last-name') }}: {{ error.$message }}
                </p>
              </div>
            </div>
          </div>
          <div class="sm:flex sm:items-center space-y-4 sm:space-y-0 sm:space-x-4 mt-5">
            <div class="sm:w-1/2">
              <label class="block text-sm font-medium mb-1 dark:text-white" for="location">Email</label>
              <input
                v-model="form.email" class="form-input w-full dark:bg-gray-700 dark:text-white hover:cursor-not-allowed"
                required
                disabled
                inputmode="email"
                :placeholder="t('accountProfile.email')"
                type="email"
              >
            </div>
            <div class="sm:w-1/2">
              <label class="block text-sm font-medium mb-1 dark:text-white" for="location">Country</label>
              <input
                v-model="form.country"
                class="form-input w-full dark:bg-gray-700 dark:text-white"
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
            <button class="btn p-2 rounded bg-red-400 border-red-200 hover:bg-red-600 text-white" @click="deleteAccount()">
              {{ t('delete-account') }}
            </button>
            <button
              class="btn p-2 rounded bg-blue-500 hover:bg-blue-600 text-white ml-3"
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
