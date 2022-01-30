<script setup lang="ts">
import mime from 'mime'
import { decode } from 'base64-arraybuffer'
import {
  IonContent,
  IonHeader,
  IonIcon,
  IonPage,
  IonTitle,
  IonToolbar,
  actionSheetController,
} from '@ionic/vue'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { cameraOutline, chevronForwardOutline } from 'ionicons/icons'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { Filesystem } from '@capacitor/filesystem'
import { useMainStore } from '~/stores/main'
import { useSupabase } from '~/services/supabase'

const { t } = useI18n()
const supabase = useSupabase()
const router = useRouter()
const main = useMainStore()
const isLoading = ref(false)
const errorMessage = ref('')
const auth = supabase.auth.user()

const updloadPhoto = async(data: string, fileName: string, contentType: string) => {
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
    .match({ id: auth?.id })

  isLoading.value = false

  if (error || urlError || dbError || !publicURL || !usr || !usr.length) {
    errorMessage.value = 'Something went wrong! Try again later.'
    console.error('upload error', error, urlError, dbError)
    return
  }
  main.user = usr[0]
}

const takePhoto = async() => {
  const cameraPhoto = await Camera.getPhoto({
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Camera,
    quality: 100,
  })

  isLoading.value = true

  const fileName = `${new Date().getTime()}.${cameraPhoto.format}`

  if (!cameraPhoto.dataUrl) return

  const contentType = mime.getType(cameraPhoto.format)

  if (!contentType) return
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
const pickPhoto = async() => {
  const { photos } = await Camera.pickImages({
    limit: 1,
    quality: 100,
  })
  isLoading.value = true
  if (photos.length === 0) return
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
    if (!contentType) return
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
const presentActionSheet = async() => {
  const actionSheet = await actionSheetController.create({
    buttons: [
      {
        text: 'Camera',
        handler: () => {
          actionSheet.dismiss()
          takePhoto()
        },
      },
      {
        text: 'Browse',
        handler: () => {
          actionSheet.dismiss()
          pickPhoto()
        },
      },
      {
        text: 'Cancel',
        role: 'cancel',
        handler: () => {
          console.log('Cancel clicked')
        },
      },
    ],
  })
  await actionSheet.present()
}
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonTitle>{{ t("account.heading") }}</IonTitle>
      </IonToolbar>
    </IonHeader>
    <IonContent :fullscreen="true">
      <IonHeader collapse="condense">
        <IonToolbar>
          <IonTitle size="large">
            {{ t("account.heading") }}
          </IonTitle>
        </IonToolbar>
      </IonHeader>
      <div class="py-16 px-6">
        <div
          v-if="!main.user?.image_url"
          class="mt-8 mx-auto w-40 h-40 bg-sweet-pink-500 rounded-5xl grid place-content-center"
          @click="presentActionSheet"
        >
          <svg
            v-if="isLoading"
            class="animate-spin h-5 w-5 text-white inline-block align-middle"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            />
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <IonIcon v-else :icon="cameraOutline" size="large" class="text-white" />
        </div>
        <img
          v-else
          class="mt-8 mx-auto w-40 h-40 object-cover rounded-5xl"
          :src="main.user?.image_url"
          @click="presentActionSheet"
        >

        <h2 class="text-center mt-4 text-2xl text-black-light">
          {{ main.user?.first_name + " " + main.user?.last_name }}
        </h2>
        <p class="text-center text-bright-cerulean-500 font-bold">
          <span class="uppercase">{{ main.user?.country }}</span>
        </p>

        <ul class="grid grid-rows-4 gap-y-5 mt-12 mb-6">
          <li>
            <router-link
              class="flex justify-between items-center"
              to="/app/profile_details"
            >
              <span class="font-bold">
                {{ t("account.personalInformation") }}
              </span>
              <IonIcon :icon="chevronForwardOutline" class="text-bright-cerulean-500" />
            </router-link>
          </li>
          <li>
            <router-link
              class="flex justify-between items-center"
              to="/app/change_password"
            >
              <span class="font-bold">
                {{ t("account.changePassword") }}
              </span>
              <IonIcon :icon="chevronForwardOutline" class="text-bright-cerulean-500" />
            </router-link>
          </li>
          <li>
            <router-link
              class="flex justify-between items-center"
              to="/app/apikeys"
            >
              <span class="font-bold">
                {{ t("account.keys") }}
              </span>
              <IonIcon :icon="chevronForwardOutline" class="text-bright-cerulean-500" />
            </router-link>
          </li>
          <li>
            <router-link
              class="flex justify-between items-center"
              to="/app/notification_settings"
            >
              <span class="font-bold">
                {{ t("account.preferences") }}
              </span>
              <IonIcon :icon="chevronForwardOutline" class="text-bright-cerulean-500" />
            </router-link>
          </li>
        </ul>
        <a
          class="block text-center text-sm text-brink-pink-500 underline mt-4"
          href="https://capgo.app/tos/"
          target="_blank"
        >
          {{ t("account.legal") }}
        </a>
        <a
          class="block text-center text-sm text-brink-pink-500 underline mt-4"
          href="https://capgo.app/privacy/"
          target="_blank"
        >
          {{ t("account.privacy") }}
        </a>
        <div class="mx-auto text-center mt-4">
          <button
            class="mx-auto font-bold text-sweet-pink-500"
            @click="main.logout().then(() => router.replace('/login'))"
          >
            {{ t("account.logout") }}
          </button>
        </div>
      </div>
    </IonContent>
  </IonPage>
</template>

<route lang="yaml">
meta:
  option: tabs
</route>
