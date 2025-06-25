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
import { useSupabase } from '~/services/supabase'
import { useDialogV2Store } from '~/stores/dialogv2'

const props = defineProps<{ appId: string }>()
const isLoading = ref(false)
const isFirstLoading = ref(true)
const router = useRouter()
const supabase = useSupabase()
const appRef = ref<Database['public']['Tables']['apps']['Row'] & { owner_org: Database['public']['Tables']['orgs']['Row'] } | null>(null)
const { t } = useI18n()
const dialogStore = useDialogV2Store()
const role = ref<OrganizationRole | null>(null)
const forceBump = ref(0)
const organizationStore = useOrganizationStore()
const transferAppIdInput = ref('')
const selectedChannel = ref('')
const availableChannels = ref<{ name: string }[]>([])

onMounted(async () => {
  isLoading.value = true

  const [{ error, data }] = await Promise.all([
    supabase
      .from('apps')
      .select('*, owner_org ( name, id )')
      .eq('app_id', props.appId)
      .single(),
  ])

  if (error) {
    toast.error(t('cannot-load-app-settings'))
    return
  }

  await organizationStore.awaitInitialLoad()
  role.value = organizationStore.getCurrentRoleForApp(props.appId)
  appRef.value = data as any
  isLoading.value = false
  isFirstLoading.value = false
})

const acronym = computed(() => {
  const words = appRef.value?.name?.split(' ') ?? []
  let res = appRef.value?.name?.slice(0, 2) || 'AP'
  if (words?.length > 2)
    res = words[0][0] + words[1][0]
  else if (words?.length > 1)
    res = words[0][0] + words[1][0]
  return res.toUpperCase()
})

async function didCancel(name: string) {
  dialogStore.openDialog({
    title: t('alert-confirm-delete'),
    description: `${t('alert-not-reverse-message')} ${t('alert-delete-message')} ${name}?`,
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
  })
  return dialogStore.onDialogDismiss()
}

async function deleteApp() {
  if (await didCancel(t('app')))
    return

  try {
    const org = organizationStore.getOrgByAppId(props.appId)
    const { error: errorIcon } = await supabase.storage
      .from(`images`)
      .remove([`org/${org?.gid}/${props.appId}/icon`])
    if (errorIcon)
      toast.error(t('cannot-delete-app-icon'))

    const { error: dbAppError } = await supabase
      .from('apps')
      .delete()
      .eq('app_id', props.appId)
    if (dbAppError)
      toast.error(t('cannot-delete-app'))

    else
      toast.success(t('app-deleted'))

    // return to home
    router.push('/app')
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

  try {
    await updateAppName(form.app_name)
  }
  catch (error) {
    toast.error(error as string)
  }

  try {
    await updateAppRetention(form.retention)
  }
  catch (error) {
    toast.error(error as string)
  }

  isLoading.value = false
}

async function updateAppName(newName: string) {
  if (newName === (appRef.value?.name ?? '')) {
    return Promise.resolve()
  }
  if (newName.length > 32) {
    toast.error(t('new-name-to-long'))
    return Promise.reject(t('new-name-to-long'))
  }

  const { error } = await supabase.from('apps').update({ name: newName }).eq('app_id', props.appId)
  if (error) {
    toast.error(t('cannot-change-name'))
    console.error(error)
    return
  }

  if (appRef.value)
    appRef.value.name = newName

  toast.success(t('changed-app-name'))
}

async function updateAppRetention(newRetention: number) {
  if (newRetention === appRef.value?.retention) {
    return Promise.resolve()
  }

  const { error } = await supabase.from('apps').update({ retention: newRetention }).eq('app_id', props.appId)
  if (error) {
    return Promise.reject(t('cannot-change-retention'))
  }
  toast.success(t('changed-app-retention'))
  if (appRef.value)
    appRef.value.retention = newRetention
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

  availableChannels.value = channels || []
  selectedChannel.value = appRef.value?.default_upload_channel || ''

  dialogStore.openDialog({
    title: t('select-default-upload-channel-header'),
    description: t('select-default-upload-channel'),
    size: 'lg',
    preventAccidentalClose: true,
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('button-confirm'),
        role: 'primary',
        handler: async () => {
          if (!selectedChannel.value) {
            toast.error(t('please-select-channel'))
            return false
          }

          const { error: appError } = await supabase.from('apps')
            .update({ default_upload_channel: selectedChannel.value })
            .eq('app_id', appRef.value?.app_id ?? '')

          if (appError) {
            toast.error(t('cannot-change-default-upload-channel'))
            console.error(appError)
            return false
          }

          if (appRef.value) {
            appRef.value.default_upload_channel = selectedChannel.value
            forceBump.value += 1
          }
          toast.success(t('updated-default-upload-channel'))
          return true
        },
      },
    ],
  })
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

  dialogStore.openDialog({
    title: t('what-to-do-with-photo'),
    description: `${t('what-to-do-with-photo-dec')}`,
    size: 'sm',
    preventAccidentalClose: true,
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('change'),
        id: 'verify',
        handler: async () => {
          const rawPhotos = await Camera.pickImages({
            limit: 1,
            quality: 100,
          }).catch(err => console.log(err))

          if (!rawPhotos || rawPhotos.photos.length === 0) {
            toast.error(t('canceled-photo-selection'))
            return false
          }

          const photos = rawPhotos.photos

          const blob = await fetch(photos[0].webPath).then(async r => await r.arrayBuffer())
          const mimeType = mime.getType(photos[0].format)

          if (!mimeType) {
            toast.error(t('unknown-mime'))
            console.error(`Unknown mime type for ${photos[0].format}`)
            return false
          }

          const { error } = await supabase.storage
            .from(`images/org/${appRef.value?.owner_org.id}/${props.appId}`)
            .upload('icon', blob, {
              contentType: mimeType,
            })

          if (error) {
            toast.error(t('upload-img-error'))
            console.error(`Cannot upload picture: ${JSON.stringify(error)}`)
            return false
          }

          const { data: signedURLData } = await supabase
            .storage
            .from(`images/org/${appRef.value?.owner_org.id}/${props.appId}`)
            .getPublicUrl('icon')

          const { error: appUpdateErr } = await supabase.from('apps')
            .update({ icon_url: signedURLData.publicUrl })
            .eq('app_id', props.appId)

          if (appUpdateErr) {
            toast.error(t('upload-img-error'))
            console.error(`Cannot upload picture (appUpdateErr): ${appUpdateErr}`)
            return false
          }

          if (appRef.value)
            appRef.value.icon_url = signedURLData.publicUrl

          toast.success(t('picture-uploaded'))
        },
      },
      {
        text: t('delete'),
        id: 'verify',
        role: 'danger',
        handler: async () => {
          if (!appRef.value?.icon_url) {
            toast.error(t('no-app-icon'))
            return false
          }

          const { error } = await supabase
            .storage
            .from(`images`)
            .remove([`org/${appRef.value?.owner_org.id}/${props.appId}/icon`])

          if (error) {
            console.error('Cannot remove app logo', error)
            toast.error(t('picture-delete-fail'))
            return false
          }

          const { error: setAppError } = await supabase.from('apps')
            .update({ icon_url: '' })
            .eq('app_id', props.appId)

          if (setAppError) {
            console.error('Cannot remove app logo (set app)', error)
            toast.error(t('picture-delete-fail'))
            return false
          }

          toast.success(t('app-logo-deleted'))
          appRef.value.icon_url = ''
        },
      },
    ],
  })
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

  // Step 1: Initial confirmation
  dialogStore.openDialog({
    title: t('transfer-app-ownership'),
    description: t('transfer-app-ownership-requirements'),
    size: 'xl',
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
  })
  if (await dialogStore.onDialogDismiss())
    return

  // Step 2: Organization selection
  const superAdminOrganizations = organizationStore.organizations.filter(org => org.role === 'super_admin' && org.gid !== appRef.value?.owner_org.id)
  if (superAdminOrganizations.length === 0) {
    toast.error(t('no-super-admin-organizations'))
    return
  }

  dialogStore.openDialog({
    title: t('select-destination-organization'),
    description: t('select-organization-to-transfer'),
    size: 'xl',
    preventAccidentalClose: true,
    buttons: [
      ...superAdminOrganizations.map(org => ({
        text: org.name,
        role: 'secondary' as const,
        handler: async () => {
          // Step 3: Final confirmation with app ID input
          transferAppIdInput.value = ''

          dialogStore.openDialog({
            title: t('confirm-transfer'),
            description: `${t('app-will-be-transferred').replace('$ORG_ID', org.name).replace('$APP_ID', props.appId)}`,
            size: 'xl',
            preventAccidentalClose: true,
            buttons: [
              {
                text: t('button-cancel'),
                role: 'cancel',
              },
              {
                text: t('transfer'),
                role: 'danger',
                handler: async () => {
                  if (transferAppIdInput.value !== props.appId) {
                    toast.error(t('incorrect-app-id'))
                    return false
                  }
                  // Transfer logic will go here
                  const { error } = await supabase.rpc('transfer_app', {
                    p_app_id: props.appId,
                    p_new_org_id: org.gid,
                  })
                  if (error) {
                    toast.error(t('cannot-transfer-app'))
                    console.error(error)
                    return false
                  }
                  toast.success(t('app-transferred'))
                  setTimeout(() => {
                    router.push('/app')
                  }, 2500)
                },
              },
            ],
          })
        },
      })),
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
    ],
  })
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
            <button id="change-org-pic" type="button" class="px-3 py-2 text-xs font-medium text-center text-gray-700 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-white border-slate-500 focus:ring-4 focus:outline-hidden focus:ring-blue-300 dark:focus:ring-blue-800 cursor-pointer" @click="editPhoto">
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
                name="app_id"
                :prefix-icon="iconName"
                :value="appRef?.app_id ?? ''"
                :label="t('app-id')"
                :disabled="true"
              />
              <FormKit
                type="text"
                name="app_name"
                :prefix-icon="iconName"
                :value="appRef?.name ?? ''"
                :label="t('app-name')"
              />
              <div :key="forceBump" class="flex flex-row">
                <FormKit
                  type="text"
                  name="default_upload_channel"
                  class="cursor-pointer"
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
                :value="appRef?.retention ?? 0"
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
                      class: 'block text-neutral-700 text-sm dark:text-neutral-300 mb-1',
                    },
                  },
                  input: {
                    attrs: {
                      class: 'inline-flex items-center px-3 py-2 text-xs font-medium text-center text-gray-700 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-white border-slate-500 focus:ring-4 focus:outline-hidden focus:ring-blue-300 dark:focus:ring-blue-800 cursor-pointer',
                    },
                  },
                  prefix: {
                    attrs: {
                      class: 'w-4 h-4 mr-2',
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

    <!-- Teleport for Transfer App ID Input -->
    <Teleport v-if="dialogStore.showDialog && dialogStore.dialogOptions?.title === t('confirm-transfer')" defer to="#dialog-v2-content">
      <div class="w-full">
        <input
          v-model="transferAppIdInput"
          type="text"
          :placeholder="t('type-app-id-to-confirm')"
          class="w-full p-3 border border-gray-300 rounded-lg dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          @keydown.enter="$event.preventDefault()"
        >
      </div>
    </Teleport>

    <!-- Teleport for Default Channel Selection -->
    <Teleport v-if="dialogStore.showDialog && dialogStore.dialogOptions?.title === t('select-default-upload-channel-header')" defer to="#dialog-v2-content">
      <div class="w-full">
        <div class="space-y-3">
          <div v-for="channel in availableChannels" :key="channel.name" class="flex items-center gap-3">
            <input
              :id="`channel-${channel.name}`"
              v-model="selectedChannel"
              type="radio"
              :value="channel.name"
              class="radio radio-primary"
            >
            <label :for="`channel-${channel.name}`" class="text-sm font-medium cursor-pointer flex-1">
              {{ channel.name }}
            </label>
          </div>
          <div v-if="availableChannels.length === 0" class="text-center text-gray-500 dark:text-gray-400 py-4">
            {{ t('no-channels-available') }}
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
