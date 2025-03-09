<script setup lang="ts">
import type { OrganizationRole } from '~/stores/organization'
import type { Database } from '~/types/supabase.types'
import { Camera } from '@capacitor/camera'
import { FormKit, FormKitMessages } from '@formkit/vue'
import mime from 'mime'
import { useI18n } from 'petite-vue-i18n'
import { toast } from 'vue-sonner'
import ArrowUpTray from '~icons/heroicons/arrow-up-tray?raw'
import Pencil from '~icons/heroicons/pencil-square'
import transfer from '~icons/mingcute/transfer-horizontal-line?raw&width=36&height=36'
import gearSix from '~icons/ph/gear-six?raw'
import iconName from '~icons/ph/user?raw'
import { urlToAppId } from '~/services/conversion'
import { useSupabase } from '~/services/supabase'

const isLoading = ref(false)
const isFirstLoading = ref(true)
const route = useRoute('/app/p/[p]/settings')
const router = useRouter()
const supabase = useSupabase()
const appId = ref('')
const appRef = ref<Database['public']['Tables']['apps']['Row'] & { owner_org: Database['public']['Tables']['orgs']['Row'] } | null>(null)
const { t } = useI18n()
const displayStore = useDisplayStore()
const role = ref<OrganizationRole | null>(null)
const forceBump = ref(0)
const organizationStore = useOrganizationStore()

onMounted(async () => {
  if (route.path.includes('/p/') && route.path.endsWith('/settings')) {
    displayStore.NavTitle = t('settings')
    displayStore.defaultBack = `/app/package/${route.params.p}`
    appId.value = (route.params as any).p as string
    appId.value = urlToAppId(appId.value)
    isLoading.value = true

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

    await organizationStore.awaitInitialLoad()
    role.value = organizationStore.getCurrentRoleForApp(appId.value)
    appRef.value = data as any
    isLoading.value = false
    isFirstLoading.value = false
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

async function didCancel(name: string) {
  displayStore.dialogOption = {
    header: t('alert-confirm-delete'),
    message: `${t('alert-not-reverse-message')} ${t('alert-delete-message')} ${name}?`,
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('button-delete'),
        role: 'danger',
        id: 'confirm-button',
      },
    ],
  }
  displayStore.showDialog = true
  return displayStore.onDialogDismiss()
}

async function deleteApp() {
  if (await didCancel(t('app')))
    return

  try {
    const org = organizationStore.getOrgByAppId(appId.value)
    const { error: errorIcon } = await supabase.storage
      .from(`images`)
      .remove([`org/${org?.gid}/${appId.value}/icon`])
    if (errorIcon)
      toast.error(t('cannot-delete-app-icon'))

    const { error: dbAppError } = await supabase
      .from('apps')
      .delete()
      .eq('app_id', appId.value)
    if (dbAppError)
      toast.error(t('cannot-delete-app'))

    else
      toast.success(t('app-deleted'))

    // return to home
    router.push('/app/home')
  }
  catch (error) {
    console.error(error)
    toast.error(t('cannot-delete-app'))
  }
}
async function submit(form: { app_name: string, retention: number }) {
  isLoading.value = true
  if (role.value && !organizationStore.hasPermisisonsInRole(role.value, ['super_admin'])) {
    toast.error(t('no-permission'))
    isLoading.value = false
    return
  }
  const newName = form.app_name
  if (newName !== (appRef.value?.name ?? '')) {
    if (newName.length > 32) {
      toast.error(t('new-name-to-long'))
      isLoading.value = false
      return
    }

    const { error } = await supabase.from('apps').update({ name: newName }).eq('app_id', appId.value)
    if (error) {
      toast.error(t('cannot-change-name'))
      console.error(error)
      isLoading.value = false
      return
    }

    if (appRef.value)
      appRef.value.name = newName

    toast.success(t('changed-app-name'))
  }
  if (form.retention !== appRef.value?.retention) {
    const { error } = await supabase.from('apps').update({ retention: form.retention }).eq('app_id', appId.value)
    if (error) {
      toast.error(t('cannot-change-retention'))
      console.error(error)
      isLoading.value = false
    }
    else {
      toast.success(t('changed-app-retention'))
      if (appRef.value)
        appRef.value.retention = form.retention
    }
  }
  isLoading.value = false
}

async function setDefaultChannel() {
  const { data: channels, error } = await supabase.from('channels')
    .select('name')
    .eq('app_id', appRef.value?.app_id ?? '')

  if (error) {
    toast.error(t('cannot-change-default-upload-channel'))
    console.error(error)
    return
  }

  const buttons = channels.map((chann) => {
    return {
      text: chann.name,
      handler: async () => {
        const { error: appError } = await supabase.from('apps')
          .update({ default_upload_channel: chann.name })
          .eq('app_id', appRef.value?.app_id ?? '')

        if (appError) {
          toast.error(t('cannot-change-default-upload-channel'))
          console.error(error)
          return
        }
        if (appRef.value) {
          appRef.value.default_upload_channel = chann.name
          forceBump.value += 1
        }
        toast.success(t('updated-default-upload-channel'))
      },
    }
  })

  displayStore.dialogOption = {
    header: t('select-default-upload-channel-header'),
    message: `${t('select-default-upload-channel')}`,
    headerStyle: 'w-full text-center',
    textStyle: 'w-full text-center',
    preventAccidentalClose: true,
    buttonVertical: true,
    size: 'max-w-xl',
    buttons: Array.prototype.concat(
      buttons,
      [
        {
          text: t('button-cancel'),
          role: 'cancel',
        },
      ],
    ),
  }
  displayStore.showDialog = true
}

const isSuperAdmin = computed(() => {
  // TODO: check if that is smart to not let admins delete apps
  if (!role.value)
    return false
  return organizationStore.hasPermisisonsInRole(role.value as any, ['super_admin'])
})

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
        text: t('button-cancel'),
        role: 'cancel',
      },
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
        role: 'danger',
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
    ],
  }

  displayStore.dialogInputText = appRef?.value?.name ?? ''
  displayStore.showDialog = true
}

async function transferAppOwnership() {
  const transferHistory: { transferred_at: string }[] = (appRef.value as any) ?? []
  if (!transferHistory || transferHistory.length === 0)
    return
  const lastTransfer = transferHistory.length > 0
    ? transferHistory.sort((a, b) =>
      new Date(b.transferred_at).getTime() - new Date(a.transferred_at).getTime(),
    )[0]
    : null
  if (lastTransfer && new Date(lastTransfer.transferred_at).getTime() + 32 * 24 * 60 * 60 * 1000 > Date.now()) {
    toast.error(t('transfer-app-ownership-too-soon'))
    return
  }

  displayStore.dialogOption = {
    header: t('transfer-app-ownership'),
    message: t('transfer-app-ownership-requirements'),
    headerStyle: 'w-full text-center',
    textStyle: 'w-full text-center',
    size: 'max-w-xl',
    buttonCenter: true,
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('ok'),
        role: 'danger',
      },
    ],
  }
  displayStore.showDialog = true
  if (await displayStore.onDialogDismiss())
    return

  // Continue with transfer logic here
  const superAdminOrganizations = organizationStore.organizations.filter(org => org.role === 'super_admin' && org.gid !== appRef.value?.owner_org.id)
  if (superAdminOrganizations.length === 0) {
    toast.error(t('no-super-admin-organizations'))
    return
  }

  displayStore.dialogOption = {
    header: t('select-destination-organization'),
    message: t('select-organization-to-transfer'),
    headerStyle: 'w-full text-center',
    textStyle: 'w-full text-center',
    size: 'max-w-xl',
    buttonVertical: true,
    preventAccidentalClose: true,
    buttons: [
      ...superAdminOrganizations.map(org => ({
        text: org.name,
        handler: async () => {
          displayStore.dialogOption = {
            header: t('confirm-transfer'),
            message: `${t('app-will-be-transferred').replace('$ORG_ID', org.name).replace('$APP_ID', appId.value)}`,
            headerStyle: 'w-full text-center',
            textStyle: 'w-full text-center mb-4',
            size: 'max-w-xl',
            input: true,
            preventAccidentalClose: true,
            buttonCenter: true,
            buttons: [
              {
                text: t('button-cancel'),
                role: 'cancel',
              },
              {
                text: t('transfer'),
                role: 'danger',
                handler: async () => {
                  if (displayStore.dialogInputText !== appId.value) {
                    toast.error(t('incorrect-app-id'))
                    return
                  }
                  // Transfer logic will go here
                  const { error } = await supabase.rpc('transfer_app', {
                    p_app_id: appId.value,
                    p_new_org_id: org.gid,
                  })
                  if (error) {
                    toast.error(t('cannot-transfer-app'))
                    console.error(error)
                    return
                  }
                  toast.success(t('app-transferred'))
                  setTimeout(() => {
                    router.push('/app/home')
                  }, 2500)
                },
              },
            ],
          }
          displayStore.showDialog = true
        },
      })),
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
    ],
  }
  displayStore.showDialog = true
}
</script>

<template>
  <div class="h-full pb-8 max-h-fit grow md:pb-0">
    <FormKit id="update-app" type="form" :actions="false" @submit="submit">
      <!-- Panel body -->
      <div class="p-6 space-y-6">
        <h2 class="mb-5 text-2xl font-bold text-slate-800 dark:text-white">
          {{ t('app-info') }}
        </h2>
        <div class="text-sm dark:text-gray-100">
          {{ t('app-info-desc') }}
        </div>
        <!-- Picture -->
        <section>
          <div class="flex items-center">
            <div class="mr-4">
              <img
                v-if="appRef?.icon_url" class="object-cover w-20 h-20 mask mask-squircle" :src="appRef?.icon_url"
                width="80" height="80" alt="User upload"
              >
              <div v-else class="p-6 text-xl bg-gray-700 mask mask-squircle">
                <span class="font-medium text-gray-300">
                  {{ acronym }}
                </span>
              </div>
            </div>
            <button id="change-org-pic" type="button" class="px-3 py-2 text-xs font-medium text-center text-gray-700 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-white border-slate-500 focus:ring-4 focus:outline-hidden focus:ring-blue-300 dark:focus:ring-blue-800" @click="editPhoto">
              {{ t('change') }}
            </button>
          </div>
        </section>

        <!-- Personal Info -->
        <section v-if="!isFirstLoading && !isLoading">
          <div class="mt-5 space-y-4 sm:flex sm:items-center sm:space-x-4 sm:space-y-0">
            <div class="sm:w-1/2">
              <FormKit
                type="text"
                name="app_name"
                :prefix-icon="iconName"
                :value="appRef?.name || ''"
                :label="t('app-name')"
              />
              <div :key="forceBump" class="flex flex-row">
                <FormKit
                  type="text"
                  name="default_upload_channel"
                  :prefix-icon="ArrowUpTray"
                  :value="appRef?.default_upload_channel ?? t('undefined')"
                  :label="t('default-upload-channel')"
                  :sections-schema="{
                    suffix: {
                      children: [
                        '$slots.suffix',
                      ],
                    },
                  }"
                  :disabled="true"
                >
                  <template #suffix>
                    <button type="button" class="ml-auto w-[24px] h-[24px] mr-1" @click="setDefaultChannel">
                      <Pencil width="24px" height="24px" />
                    </button>
                  </template>
                </FormKit>
              </div>
              <FormKit
                type="number"
                number="integer"
                name="retention"
                :prefix-icon="gearSix"
                :value="appRef?.retention || 0"
                :label="t('retention')"
              />
              <FormKit
                type="button"
                :label="t('transfer-app-ownership')"
                :help="t('change-app-organisation-owner')"
                :prefix-icon="transfer"
                :sections-schema="{
                  outer: {
                    $el: 'div',
                    attrs: {
                      class: 'flex flex-col-reverse',
                    },
                  },
                  help: {
                    attrs: {
                      class: 'block text-neutral-700 text-sm font-bold dark:text-neutral-300 inline-flex! mb-1 formkit-label',
                    },
                  },
                }"
                @click="transferAppOwnership"
              />
            </div>
          </div>
          <FormKitMessages />
        </section>
      </div>
      <!-- Panel footer -->
      <footer>
        <div class="flex flex-col px-6 py-5 border-t dark:border-slate-600">
          <div class="flex self-end">
            <button v-if="isSuperAdmin" type="button" class="p-2 text-red-600 border border-red-400 rounded-lg hover:bg-red-600 hover:text-white" @click="deleteApp()">
              {{ t('delete-app') }}
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
</template>

<route lang="yaml">
  meta:
    layout: app_settings
      </route>
