<script setup lang="ts">
import { toast } from 'vue-sonner'
import { Camera } from '@capacitor/camera'
import mime from 'mime'
import { useSupabase } from '~/services/supabase'
import { urlToAppId } from '~/services/conversion'
import type { Database } from '~/types/supabase.types'
import type { OrganizationRole } from '~/stores/organization'

const route = useRoute()
const supabase = useSupabase()
const appId = ref('')
const appRef = ref<Database['public']['Tables']['apps']['Row'] & { owner_org: Database['public']['Tables']['orgs']['Row'] } | null>(null)
const { t } = useI18n()
const displayStore = useDisplayStore()
const role = ref<OrganizationRole | null>(null)
const organizationStore = useOrganizationStore()

watchEffect(async () => {
  if (route.path.includes('/p/')) {
    appId.value = (route.params as any).p as string
    appId.value = urlToAppId(appId.value)

    const [{ error, data }] = await Promise.all([
      supabase
        .from('apps')
        .select('*, owner_org ( name, id )')
        .eq('app_id', appId.value)
        .single(),
    ])

    if (error) {
      toast.error(t('cannot-load-app-settings'))
      return
    }

    role.value = organizationStore.getCurrentRoleForApp(appId.value)
    appRef.value = data as any
  }
})

const acronym = computed(() => {
  const words = appRef.value?.name?.split(' ') || []
  let res = appRef.value?.name?.slice(0, 2) || 'AP'
  if (words?.length > 2)
    res = words[0][0] + words[1][0]
  else if (words?.length > 1)
    res = words[0][0] + words[1][0]
  return res.toUpperCase()
})

async function editName() {
  if (role.value && !organizationStore.hasPermisisonsInRole(role.value, ['super_admin'])) {
    toast.error(t('no-permission'))
    return
  }

  displayStore.dialogOption = {
    header: t('type-new-app-name'),
    message: `${t('please-type-new-app-name')}`,
    input: true,
    headerStyle: 'w-full text-center',
    textStyle: 'w-full text-center',
    size: 'max-w-sm',
    buttonCenter: true,
    preventAccidentalClose: true,
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('change'),
        id: 'verify',
        preventClose: true,
        handler: async () => {
          const newName = displayStore.dialogInputText
          if (newName === (appRef.value?.name ?? '')) {
            toast.error(t('new-name-not-changed'))
            return false
          }

          if (newName.length > 32) {
            toast.error(t('new-name-to-long'))
            return
          }

          const { error } = await supabase.from('apps').update({ name: newName }).eq('app_id', appId.value)
          if (error) {
            toast.error(t('cannot-change-name'))
            console.error(error)
          }

          if (appRef.value?.name)
            appRef.value.name = newName

          displayStore.showDialog = false
          toast.success(t('changed-app-name'))
        },
      },
    ],
  }

  displayStore.dialogInputText = appRef?.value?.name ?? ''
  displayStore.showDialog = true
}

async function editPhoto() {
  if (role.value && !organizationStore.hasPermisisonsInRole(role.value, ['super_admin'])) {
    toast.error(t('no-permission'))
    return
  }

  displayStore.dialogOption = {
    header: t('what-to-do-with-photo'),
    message: `${t('what-to-do-with-photo-dec')}`,
    headerStyle: 'w-full text-center',
    textStyle: 'w-full text-center',
    size: 'max-w-sm',
    buttonCenter: true,
    preventAccidentalClose: true,
    buttons: [
      {
        text: t('change'),
        id: 'verify',
        preventClose: true,
        handler: async () => {
          const rawPhotos = await Camera.pickImages({
            limit: 1,
            quality: 100,
          }).catch(err => console.log(err))

          if (!rawPhotos || rawPhotos.photos.length === 0) {
            toast.error(t('canceled-photo-selection'))
            return
          }

          const photos = rawPhotos.photos

          const blob = await fetch(photos[0].webPath).then(async r => await r.arrayBuffer())
          const mimeType = mime.getType(photos[0].format)

          if (!mimeType) {
            toast.error(t('unknown-mime'))
            console.error(`Unknown mime type for ${photos[0].format}`)
            return
          }

          const { error } = await supabase.storage
            .from(`images/org/${appRef.value?.owner_org.id}/${appId.value}`)
            .upload('icon', blob, {
              contentType: mimeType,
            })

          if (error) {
            toast.error(t('upload-img-error'))
            console.error(`Cannot upload picture: ${JSON.stringify(error)}`)
            return
          }

          const { data: signedURLData } = await supabase
            .storage
            .from(`images/org/${appRef.value?.owner_org.id}/${appId.value}`)
            .getPublicUrl('icon')

          const { error: appUpdateErr } = await supabase.from('apps')
            .update({ icon_url: signedURLData.publicUrl })
            .eq('app_id', appId.value)

          if (appUpdateErr) {
            toast.error(t('upload-img-error'))
            console.error(`Cannot upload picture (appUpdateErr): ${appUpdateErr}`)
            return
          }

          if (appRef.value)
            appRef.value.icon_url = signedURLData.publicUrl

          toast.success(t('picture-uploaded'))
          displayStore.showDialog = false
        },
      },
      {
        text: t('delete'),
        id: 'verify',
        preventClose: true,
        handler: async () => {
          if (!appRef.value?.icon_url) {
            toast.error(t('no-app-icon'))
            return
          }

          const { error } = await supabase
            .storage
            .from(`images`)
            .remove([`org/${appRef.value?.owner_org.id}/${appId.value}/icon`])

          if (error) {
            console.error('Cannot remove app logo', error)
            toast.error(t('picture-delete-fail'))
            return
          }

          const { error: setAppError } = await supabase.from('apps')
            .update({ icon_url: '' })
            .eq('app_id', appId.value)

          if (setAppError) {
            console.error('Cannot remove app logo (set app)', error)
            toast.error(t('picture-delete-fail'))
            return
          }

          toast.success(t('app-logo-deleted'))
          appRef.value.icon_url = ''
          displayStore.showDialog = false
        },
      },
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
    ],
  }

  displayStore.dialogInputText = appRef?.value?.name ?? ''
  displayStore.showDialog = true
}
</script>

<template>
  <div v-if="!displayStore.showDialog" class="flex justify-center flex-col items-center pb-80">
    <div class="flex justify-center flex-col items-center border-3 border-gray-700 p-5 rounded-xl">
      <p class="text-6xl">
        {{ appRef?.name }}
      </p>
      <img v-if="appRef?.icon_url" :src="appRef.icon_url" :alt="`App icon ${appRef.name}`" class="mt-8 rounded shrink-0 mx-auto" width="64" height="64">
      <div v-else class="mt-8 flex items-center justify-center w-16 h-16 border border-black rounded-lg dark:border-white mx-auto">
        <p class="text-xl">
          {{ acronym }}
        </p>
      </div>
      <p class="mt-8 mx-auto">
        {{ t('app-id') }} {{ appRef?.app_id }}
      </p>
      <p class="mt-2 mx-auto">
        {{ t('owner-org') }} {{ appRef?.owner_org.name }}
      </p>
      <div class="flex flex-row mt-8 ">
        <button class="mr-2 px-3 py-2 text-xs font-medium text-center text-gray-700 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-white border-grey focus:ring-4 focus:outline-none focus:ring-blue-300 dark:focus:ring-blue-800" @click="editName">
          {{ t('edit-name') }}
        </button>
        <button class="ml-2 px-3 py-2 text-xs font-medium text-center text-gray-700 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-white border-grey focus:ring-4 focus:outline-none focus:ring-blue-300 dark:focus:ring-blue-800" @click="editPhoto">
          {{ t('edit-pic') }}
        </button>
      </div>
    </div>
  </div>
</template>
