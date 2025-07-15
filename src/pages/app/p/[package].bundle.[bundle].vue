<script setup lang="ts">
import type { Tab } from '~/components/comp_def'
import type { OrganizationRole } from '~/stores/organization'
import type { Database } from '~/types/supabase.types'
import { Capacitor } from '@capacitor/core'
import { FormKit } from '@formkit/vue'
import { parse } from '@std/semver'
import { useI18n } from 'petite-vue-i18n'
import { computed, ref, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import Settings from '~icons/heroicons/cog-8-tooth'
import IconInformations from '~icons/heroicons/information-circle'
import IconTrash from '~icons/heroicons/trash'
import IconSearch from '~icons/ic/round-search?raw'
import IconAlertCircle from '~icons/lucide/alert-circle'
import { appIdToUrl, bytesToMbText, urlToAppId } from '~/services/conversion'
import { formatDate } from '~/services/date'
import { checkCompatibilityNativePackages, isCompatible, useSupabase } from '~/services/supabase'
import { openVersion } from '~/services/versions'
import { useDialogV2Store } from '~/stores/dialogv2'
import { useDisplayStore } from '~/stores/display'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'

const { t } = useI18n()
const route = useRoute('/app/p/[package].bundle.[bundle]')
const router = useRouter()
const dialogStore = useDialogV2Store()
const displayStore = useDisplayStore()
const organizationStore = useOrganizationStore()
const main = useMainStore()
const supabase = useSupabase()
const ActiveTab = ref('info')
const packageId = ref<string>('')
const id = ref<number>()
const loading = ref(true)
const version = ref<Database['public']['Tables']['app_versions']['Row']>()
const channels = ref<(Database['public']['Tables']['channels']['Row'])[]>([])
const channel = ref<(Database['public']['Tables']['channels']['Row'])>()
const version_meta = ref<Database['public']['Tables']['app_versions_meta']['Row']>()
const showBundleMetadataInput = ref<boolean>(false)

// Channel chooser state
const selectedChannelForLink = ref<Database['public']['Tables']['channels']['Row'] | null>(null)
const currentChannelAction = ref<'set' | 'open' | 'unlink' | null>(null)
const channelSearchVal = ref('')
const filteredChannels = ref<(Database['public']['Tables']['channels']['Row'])[]>([])

// Watch for search changes
watch(() => channelSearchVal.value, () => {
  if (channelSearchVal.value.trim()) {
    filteredChannels.value = channels.value.filter(channel =>
      channel.name.toLowerCase().includes(channelSearchVal.value.toLowerCase()),
    )
  }
  else {
    filteredChannels.value = channels.value
  }
})

// Update filtered channels when channels change
watch(() => channels.value, () => {
  if (channelSearchVal.value.trim()) {
    filteredChannels.value = channels.value.filter(channel =>
      channel.name.toLowerCase().includes(channelSearchVal.value.toLowerCase()),
    )
  }
  else {
    filteredChannels.value = channels.value
  }
}, { immediate: true })

const role = ref<OrganizationRole | null>(null)
watch(version, async (version) => {
  if (!version) {
    role.value = null
    return
  }

  await organizationStore.awaitInitialLoad()
  role.value = await organizationStore.getCurrentRoleForApp(version.app_id)
  console.log(role.value)
})

// Function to open link in a new tab
function openLink(url?: string): void {
  if (url) {
    // Using window from global scope
    const win = window.open(url, '_blank')
    // Add some security with noopener
    if (win)
      win.opener = null
  }
}

async function copyToast(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    console.log('displayStore.messageToast', displayStore.messageToast)
    toast.success(t('copied-to-clipboard'))
  }
  catch (err) {
    console.error('Failed to copy: ', err)
    // Display a modal with the copied key
    dialogStore.openDialog({
      title: t('cannot-copy'),
      description: text,
      buttons: [
        {
          text: t('ok'),
          role: 'primary',
        },
      ],
    })
    await dialogStore.onDialogDismiss()
  }
}

const tabs: Tab[] = [
  {
    label: 'info',
    icon: IconInformations,
    key: 'info',
  },
]

async function getChannels() {
  if (!version.value)
    return
  channel.value = undefined
  const { data: dataChannel } = await supabase
    .from('channels')
    .select()
    .eq('app_id', version.value.app_id)
    // .eq('version', version.value.id)
    .order('updated_at', { ascending: false })
  channels.value = dataChannel || channels.value
  showBundleMetadataInput.value = !!channels.value.find(c => c.disable_auto_update === 'version_number')
}

async function openChannelLink() {
  if (!version.value || !channel.value)
    return
  router.push(`/app/p/${appIdToUrl(version.value.app_id)}/channel/${channel.value?.id}`)
}

const showSize = computed(() => {
  if (version_meta.value?.size)
    return bytesToMbText(version_meta.value.size)
  else if (version.value?.external_url)
    return t('stored-externally')
  else
    return t('metadata-not-found')
})

async function getUnknowBundleId() {
  if (!version.value)
    return
  const { data } = await supabase
    .from('app_versions')
    .select()
    .eq('app_id', version.value.app_id)
    .eq('name', 'unknown')
    .single()
  return data?.id
}
// add check compatibility here
async function setChannel(channel: Database['public']['Tables']['channels']['Row'], id: number) {
  return supabase
    .from('channels')
    .update({
      version: id,
    })
    .eq('id', channel.id)
}

async function ASChannelChooser() {
  if (!version.value)
    return
  if (role.value && !(role.value === 'admin' || role.value === 'super_admin' || role.value === 'write')) {
    toast.error(t('no-permission'))
    return
  }

  selectedChannelForLink.value = null
  currentChannelAction.value = 'set'
  channelSearchVal.value = ''
  filteredChannels.value = channels.value

  dialogStore.openDialog({
    title: t('channel-linking'),
    size: 'lg',
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('set-bundle'),
        role: 'primary',
        handler: async () => {
          if (!selectedChannelForLink.value) {
            toast.error(t('please-select-channel'))
            return false
          }
          await handleChannelLink(selectedChannelForLink.value)
          return true
        },
      },
    ],
  })
  return dialogStore.onDialogDismiss()
}

async function handleChannelLink(chan: Database['public']['Tables']['channels']['Row']) {
  if (!version.value)
    return
  try {
    const {
      finalCompatibility,
      localDependencies,
    } = await checkCompatibilityNativePackages(version.value.app_id, chan.name, (version.value.native_packages as any) ?? [])

    // Check if any package is incompatible
    if (localDependencies.length > 0 && finalCompatibility.find(x => !isCompatible(x))) {
      toast.error(t('bundle-not-compatible-with-channel', { channel: chan.name }))
      toast.info(t('channel-not-compatible-with-channel-description').replace('%', 'npx @capgo/cli@latest bundle compatibility'))

      dialogStore.openDialog({
        title: t('confirm-action'),
        description: t('set-even-not-compatible').replace('%', 'npx @capgo/cli@latest bundle compatibility'),
        buttons: [
          {
            text: t('button-cancel'),
            role: 'cancel',
          },
          {
            text: t('button-confirm'),
            role: 'primary',
          },
        ],
      })
      if (await dialogStore.onDialogDismiss())
        return
    }
    else if (localDependencies.length === 0) {
      toast.info('ignore-compatibility')
    }
    else {
      toast.info(t('bundle-compatible-with-channel').replace('%', chan.name))
    }
    await setChannel(chan, version.value.id)
    await getChannels()
  }
  catch (error) {
    console.error(error)
    toast.error(t('cannot-test-app-some'))
  }
}

async function openChannel(selChannel: Database['public']['Tables']['channels']['Row']) {
  channel.value = selChannel
  if (!version.value || !main.auth)
    return
  if (!channel.value)
    return ASChannelChooser()

  // Direct navigation to channel
  await openChannelLink()
}

async function openChannelSettings(selChannel: Database['public']['Tables']['channels']['Row']) {
  channel.value = selChannel
  if (!version.value || !main.auth)
    return
  if (!channel.value)
    return ASChannelChooser()

  selectedChannelForLink.value = selChannel
  currentChannelAction.value = 'open'

  dialogStore.openDialog({
    title: t('channel-actions'),
    size: 'lg',
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
    ],
  })
  return dialogStore.onDialogDismiss()
}

async function handleChannelAction(action: 'set' | 'open' | 'unlink') {
  if (!channel.value)
    return

  if (action === 'set') {
    await ASChannelChooser()
  }
  else if (action === 'open') {
    await openChannelLink()
  }
  else if (action === 'unlink') {
    try {
      const id = await getUnknowBundleId()
      if (!id)
        return
      await setChannel(channel.value, id)
      await getChannels()
    }
    catch (error) {
      console.error(error)
      toast.error(t('cannot-test-app-some'))
    }
  }
}

async function downloadNow() {
  if (!version.value)
    return
  if (version.value.session_key) {
    const filename = version.value.r2_path?.replace('/', '_')
    const localPath = `./${filename}`
    const command = `npx @capgo/cli@latest bundle decrypt ${localPath}  ${version.value.session_key} --key ./.capgo_key`

    dialogStore.openDialog({
      title: t('to-open-encrypted-bu'),
      buttons: [
        {
          text: t('copy-command'),
          role: 'primary',
          handler: () => {
            copyToast(command)
          },
        },
      ],
    })
    await dialogStore.onDialogDismiss()
  }
  openVersion(version.value)
}

async function openDownload() {
  if (!version.value || !main.auth)
    return
  dialogStore.openDialog({
    title: t('are-you-sure-you-want-to-download'),
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: Capacitor.isNativePlatform() ? t('launch-bundle') : t('download'),
        role: 'primary',
        handler: async () => {
          await downloadNow()
        },
      },
    ],
  })
  return dialogStore.onDialogDismiss()
}

async function getVersion() {
  if (!id.value)
    return
  try {
    const { data } = await supabase
      .from('app_versions')
      .select()
      .eq('app_id', packageId.value)
      .eq('id', id.value)
      .single()
    const { data: dataVersionsMeta } = await supabase
      .from('app_versions_meta')
      .select()
      .eq('id', id.value)
      .single()
    if (!data) {
      console.error('no version found')
      return
    }
    if (dataVersionsMeta)
      version_meta.value = dataVersionsMeta

    version.value = data
  }
  catch (error) {
    console.error(error)
  }
}

watchEffect(async () => {
  if (route.path.includes('/bundle/')) {
    loading.value = true
    packageId.value = route.params.package as string
    packageId.value = urlToAppId(packageId.value)
    id.value = Number(route.params.bundle as string)
    await getVersion()
    await getChannels()
    loading.value = false
    displayStore.NavTitle = t('bundle')
    displayStore.defaultBack = `/app/p/${route.params.package}/bundles`
  }
})

function hideString(str: string) {
  const first = str.slice(0, 5)
  const last = str.slice(-5)
  return `${first}...${last}`
}

async function saveCustomId(input: string) {
  if (!id.value)
    return

  if (input.length === 0) {
    const { error: errorNull } = await supabase
      .from('app_versions')
      .update({
        min_update_version: null,
      })
      .eq('id', id.value)

    if (errorNull) {
      console.log('Cannot set min update version to null', errorNull)
      return
    }

    toast.success(t('updated-min-version'))
    return
  }

  if (!parse(input)) {
    toast.error(t('invalid-version'))
    return
  }

  const { error } = await supabase
    .from('app_versions')
    .update({
      min_update_version: input,
    })
    .eq('id', id.value)

  if (error) {
    console.log('Cannot set min update version', error)
    return
  }

  toast.success(t('updated-min-version'))
}

function guardMinAutoUpdate(event: Event) {
  if (!organizationStore.hasPermisisonsInRole(role.value, ['admin', 'super_admin', 'write'])) {
    toast.error(t('no-permission'))
    event.preventDefault()
    return false
  }
}

function preventInputChangePerm(event: Event) {
  if (!organizationStore.hasPermisisonsInRole(role.value, ['admin', 'super_admin', 'write'])) {
    event.preventDefault()
    return false
  }
}

// Replicated logic from BundleTable.vue for deletion
async function didCancel(name: string, askForMethod = true): Promise<boolean | 'normal' | 'unsafe'> {
  let method: 'normal' | 'unsafe' | null = null
  if (askForMethod) {
    dialogStore.openDialog({
      title: t('select-style-of-deletion'),
      description: t('select-style-of-deletion-msg'),
      buttons: [
        {
          text: t('normal'),
          role: 'secondary',
          handler: () => {
            method = 'normal'
          },
        },
        {
          text: t('unsafe'),
          role: 'danger',
          handler: async () => {
            if (!organizationStore.hasPermisisonsInRole(await organizationStore.getCurrentRoleForApp(packageId.value), ['super_admin'])) {
              toast.error(t('no-permission-ask-super-admin'))
              return false
            }
            method = 'unsafe'
          },
        },
      ],
    })
    if (await dialogStore.onDialogDismiss() || !method)
      return true
  }
  else {
    method = 'unsafe' // If not asking, assume unsafe (used for already soft-deleted)
  }

  const description = askForMethod
    ? `${t('alert-not-reverse-message')} ${t('alert-delete-message')} ${name} ${t('you-cannot-reuse')}.`
    : `${t('alert-not-reverse-message')} ${t('alert-delete-message')} ${name}?`

  dialogStore.openDialog({
    title: t('alert-confirm-delete'),
    description,
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('button-delete'),
        role: 'danger',
      },
    ],
  })

  if (await dialogStore.onDialogDismiss())
    return true
  if (method === null)
    throw new Error('Unreachable, method = null')

  return method
}

async function unlinkChannels(appId: string, unlink: { id: number, name: string }[]) {
  // Unlink channels if confirmed
  if (unlink.length === 0) {
    return
  }
  const { data: unknownVersion, error: unknownError } = await supabase
    .from('app_versions')
    .select('id')
    .eq('app_id', appId)
    .eq('name', 'unknown')
    .single()

  if (unknownError || !unknownVersion) {
    toast.error(t('cannot-find-unknown-version'))
    console.error('Cannot find unknown version:', unknownError)
    return Promise.reject(new Error('Cannot find unknown version'))
  }

  const { error: updateError } = await supabase
    .from('channels')
    .update({ version: unknownVersion.id })
    .in('id', unlink.map(c => c.id))

  if (updateError) {
    toast.error(t('unlink-error'))
    console.error('Channel unlink error:', updateError)
    return Promise.reject(new Error('Channel unlink error'))
  }
  toast.success(t('channels-unlinked-successfully')) // Add translation key
}

async function deleteBundle() {
  if (!version.value)
    return

  if (role.value && !organizationStore.hasPermisisonsInRole(role.value, ['admin', 'write', 'super_admin'])) {
    toast.error(t('no-permission'))
    return
  }

  try {
    const { data: channelFound, error: errorChannel } = await supabase
      .from('channels')
      .select('id, name, version!inner(name)') // Ensure version is selected for display
      .eq('app_id', version.value.app_id)
      .eq('version', version.value.id)

    let unlink = [] as { id: number, name: string }[] // Store id and name
    if (errorChannel) {
      console.error('Error checking channels:', errorChannel)
      toast.error(t('error-checking-channels'))
      return
    }

    if (channelFound && channelFound.length > 0) {
      let shouldUnlink = false

      dialogStore.openDialog({
        title: t('want-to-unlink'),
        description: t('channel-bundle-linked').replace('%s', channelFound.map((ch: any) => `${ch.name} (${ch.version.name})`).join(', ')),
        buttons: [
          {
            text: t('no'),
            role: 'cancel',
          },
          {
            text: t('yes'),
            role: 'primary',
            handler: () => {
              shouldUnlink = true
              unlink = channelFound.map((ch: any) => ({ id: ch.id, name: ch.name })) // Map to id and name
            },
          },
        ],
      })

      const cancelled = await dialogStore.onDialogDismiss()
      if (cancelled || !shouldUnlink) {
        toast.info(t('canceled-delete')) // Use info for cancellation
        return
      }
    }

    // Prevent deletion of essential bundles
    if (version.value.name === 'unknown' || version.value.name === 'builtin') {
      toast.error(t('cannot-delete-unknown-or-builtin'))
      return
    }

    const didCancelRes = await didCancel(t('bundle'), !version.value.deleted)
    if (typeof didCancelRes === 'boolean' && didCancelRes === true) {
      toast.info(t('canceled-delete'))
      return
    }

    await unlinkChannels(version.value.app_id, unlink)

    // Perform deletion (soft or hard)
    const deleteQuery = didCancelRes === 'normal'
      ? supabase
          .from('app_versions')
          .update({ deleted: true })
          .eq('id', version.value.id)
          .eq('app_id', version.value.app_id)
      : supabase
          .from('app_versions')
          .delete()
          .eq('id', version.value.id)
          .eq('app_id', version.value.app_id)

    const { error: deleteError } = await deleteQuery

    if (deleteError) {
      toast.error(t('cannot-delete-bundle'))
      console.error('Bundle deletion error:', deleteError)
    }
    else {
      toast.success(t('bundle-deleted'))
      // Navigate back to the bundle list
      router.push(`/app/p/${appIdToUrl(packageId.value)}/bundles/`)
    }
  }
  catch (error) {
    console.error('Unexpected error during deletion:', error)
    toast.error(t('cannot-delete-bundle'))
  }
}
</script>

<template>
  <div>
    <div v-if="loading" class="flex flex-col items-center justify-center min-h-[50vh]">
      <Spinner size="w-40 h-40" />
    </div>
    <div v-else-if="version">
      <Tabs v-model:active-tab="ActiveTab" :tabs="tabs" />
      <div v-if="ActiveTab === 'info'" id="devices" class="flex flex-col">
        <div
          class="flex flex-col overflow-y-auto bg-white shadow-lg border-slate-300 md:mx-auto md:mt-5 md:w-2/3 md:border dark:border-slate-900 md:rounded-lg dark:bg-slate-800"
        >
          <dl class="divide-y dark:divide-slate-500 divide-slate-200">
            <InfoRow :label="t('bundle-number')">
              {{ version.name }}
            </InfoRow>
            <InfoRow :label="t('id')">
              {{ version.id.toString() }}
            </InfoRow>
            <InfoRow v-if="version.created_at" :label="t('created-at')">
              {{ formatDate(version.created_at) }}
            </InfoRow>
            <InfoRow v-if="version.updated_at" :label="t('updated-at')">
              {{ formatDate(version.updated_at) }}
            </InfoRow>
            <!-- Checksum -->
            <InfoRow
              v-if="version.checksum" :label="t('checksum')" :is-link="true"
              @click="copyToast(version?.checksum ?? '')"
            >
              {{ hideString(version.checksum) }}
            </InfoRow>
            <!-- Min update version -->
            <InfoRow
              v-if="showBundleMetadataInput" id="metadata-bundle"
              :label="t('min-update-version')" editable
              :readonly="organizationStore.hasPermisisonsInRole(role, ['admin', 'super_admin', 'write']) === false"
              @click="guardMinAutoUpdate" @update:value="(saveCustomId as any)" @keydown="preventInputChangePerm"
            >
              {{ version.min_update_version }}
            </InfoRow>

            <!-- meta devices -->
            <InfoRow v-if="version_meta?.devices" :label="t('devices')">
              {{ version_meta.devices.toLocaleString() }}
            </InfoRow>
            <InfoRow
              v-if="version_meta?.installs" :label="t('install')"
            >
              {{ version_meta.installs.toLocaleString() }}
            </InfoRow>
            <InfoRow
              v-if="version_meta?.uninstalls" :label="t('uninstall')"
            >
              {{ version_meta.uninstalls.toLocaleString() }}
            </InfoRow>
            <InfoRow v-if="version_meta?.fails" :label="t('fail')">
              {{ version_meta.fails.toLocaleString() }}
            </InfoRow>
            <InfoRow v-if="channels && channels.length > 0 && version && channels.filter(c => c.version === version!.id).length > 0" :label="t('channel')">
              <div class="flex flex-wrap justify-end w-full gap-3">
                <div v-for="chn in channels.filter(c => c.version === version!.id)" id="open-channel" :key="chn.id" class="flex items-center gap-2">
                  <span
                    class="font-bold text-blue-600 underline cursor-pointer underline-offset-4 hover:text-blue-700 dark:text-blue-500 dark:hover:text-blue-400"
                    @click="openChannel(chn)"
                  >
                    {{ chn!.name }}
                  </span>
                  <button
                    class="p-1 rounded-md border border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-gray-600 dark:hover:bg-gray-800 transition-colors"
                    @click="openChannelSettings(chn)"
                  >
                    <Settings class="w-4 h-4 text-gray-500 hover:text-blue-500 dark:text-gray-400 dark:hover:text-blue-400" />
                  </button>
                </div>
              </div>
            </InfoRow>
            <InfoRow
              v-else id="open-channel" :label="t('channel')" :is-link="true"
              @click="ASChannelChooser()"
            >
              {{ t('set-bundle') }}
            </InfoRow>
            <InfoRow
              v-if="version.session_key" :label="t('encryption')"
            >
              {{ t('encrypted') }}
            </InfoRow>
            <InfoRow
              v-else :label="t('encryption')"
            >
              {{ t('not-encrypted-bundle') }}
            </InfoRow>
            <!-- session_key -->
            <InfoRow
              v-if="version.session_key" :label="t('session_key')" :is-link="true"
              @click="copyToast(version?.session_key ?? '')"
            >
              {{ hideString(version.session_key) }}
            </InfoRow>
            <!-- version.external_url -->
            <InfoRow
              v-if="version.external_url" :label="t('url')" :is-link="true"
              @click="copyToast(version?.external_url ?? '')"
            >
              {{ version.external_url }}
            </InfoRow>
            <!-- Bundle Link -->
            <InfoRow
              v-if="version.link" :label="t('bundle-link')" :is-link="true"
              @click="openLink(version.link)"
            >
              {{ version.link }}
            </InfoRow>
            <!-- Bundle Comment -->
            <InfoRow
              v-if="version.comment" :label="t('bundle-comment')"
            >
              {{ version.comment }}
            </InfoRow>
            <!-- size -->
            <InfoRow v-if="version?.r2_path" :label="t('size')" :is-link="true" @click="openDownload()">
              {{ showSize }}
            </InfoRow>
            <InfoRow v-if="!version?.r2_path" :label="t('size')" :is-link="true" @click="openDownload()">
              {{ t('cannot-calculate-size-of-partial-bundle') }}
            </InfoRow>
            <InfoRow v-if="version?.manifest" :label="t('partial-bundle')" :is-link="false">
              {{ t('enabled') }}
            </InfoRow>
            <InfoRow v-if="version?.r2_path" :label="t('zip-bundle')" :is-link="false">
              {{ t('enabled') }}
            </InfoRow>

            <!-- Delete Bundle Action -->
            <InfoRow
              v-if="!version.deleted"
              :label="t('status')"
              :icon="IconTrash"
              :disabled="!organizationStore.hasPermisisonsInRole(role, ['admin', 'write', 'super_admin'])"
            >
              <span class="">
                {{ t('bundle-active') }}
                <button
                  class="p-1 rounded-md border border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-gray-600 dark:hover:bg-gray-800 transition-colors"
                  @click="deleteBundle"
                >
                  <IconTrash class="w-4 h-4 text-red-500 dark:text-red-400 cursor-pointer hover:text-red-600 transition-colors" />
                </button>
              </span>
            </InfoRow>

            <!-- Show deleted status if applicable -->
            <InfoRow v-if="version.deleted" :label="t('status')">
              {{ t('bundle-deleted') }}
            </InfoRow>
          </dl>
        </div>
      </div>
      <div v-else-if="ActiveTab === 'devices'" id="devices" class="flex flex-col">
        <div
          class="flex flex-col mx-auto overflow-y-auto bg-white shadow-lg border-slate-300 md:mt-5 md:w-2/3 md:border dark:border-slate-900 md:rounded-lg dark:bg-gray-800"
        >
          <DeviceTable class="p-3" :app-id="packageId" :version-id="version.id" />
        </div>
      </div>
    </div>
    <div v-else class="flex flex-col items-center justify-center min-h-[50vh]">
      <IconAlertCircle class="w-16 h-16 text-destructive mb-4" />
      <h2 class="text-xl font-semibold text-foreground">
        {{ t('bundle-not-found') }}
      </h2>
      <p class="text-muted-foreground mt-2">
        {{ t('bundle-not-found-description') }}
      </p>
      <button class="mt-4 d-btn d-btn-primary" @click="router.push(`/app/p/${appIdToUrl(packageId)}/bundles/`)">
        {{ t('back-to-bundles') }}
      </button>
    </div>

    <!-- Teleport Content for Deletion Style Modal -->
    <Teleport v-if="dialogStore.showDialog && dialogStore.dialogOptions?.title === t('select-style-of-deletion')" defer to="#dialog-v2-content">
      <div class="mt-4 space-y-3">
        <p class="text-sm text-gray-600 dark:text-gray-400">
          {{ t('select-style-of-deletion-recommendation') }}
        </p>
        <p class="text-sm">
          {{ t('select-style-of-deletion-link') }}
          <a
            href="https://capgo.app/docs/webapp/bundles/#delete-a-bundle"
            target="_blank"
            class="text-blue-500 underline hover:text-blue-600 ml-1"
          >
            {{ t('here') }}
          </a>
        </p>
      </div>
    </Teleport>

    <!-- Teleport Content for Encrypted Command Display -->
    <Teleport v-if="dialogStore.showDialog && dialogStore.dialogOptions?.title === t('to-open-encrypted-bu')" defer to="#dialog-v2-content">
      <div class="mt-4">
        <div class="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg">
          <code class="text-sm break-all">
            npx @capgo/cli@latest bundle decrypt ./{{ version?.r2_path?.replace('/', '_') }} {{ version?.session_key }} --key ./.capgo_key
          </code>
        </div>
      </div>
    </Teleport>

    <!-- Teleport Content for Unsafe Deletion Warning -->
    <Teleport v-if="dialogStore.showDialog && dialogStore.dialogOptions?.title === t('alert-confirm-delete') && version?.deleted" defer to="#dialog-v2-content">
      <div class="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <p class="text-sm text-red-800 dark:text-red-200">
          <strong class="underline">{{ t('you-are-deleting-unsafely') }}</strong>
        </p>
        <p class="text-sm text-red-600 dark:text-red-300 mt-2">
          {{ t('select-style-of-deletion-link') }}
          <a
            href="https://capgo.app/docs/webapp/bundles/#delete-a-bundle"
            target="_blank"
            class="text-blue-500 underline hover:text-blue-600 ml-1"
          >
            {{ t('here') }}
          </a>
        </p>
      </div>
    </Teleport>

    <!-- Teleport Content for Channel Linking (Set Bundle) -->
    <Teleport v-if="dialogStore.showDialog && dialogStore.dialogOptions?.title === t('channel-linking') && currentChannelAction === 'set'" defer to="#dialog-v2-content">
      <div class="w-full space-y-4">
        <div class="text-center">
          <h3 class="text-lg font-medium mb-2">
            {{ t('select-channel-to-link') }}
          </h3>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
            {{ t('choose-which-channel-to-link-this-bundle-to') }}
          </p>
        </div>

        <!-- Search Input -->
        <div class="mb-6">
          <FormKit
            v-model="channelSearchVal"
            :prefix-icon="IconSearch"
            enterkeyhint="send"
            :placeholder="t('search-channels')"
            :classes="{
              outer: 'mb-0! w-full',
              inner: 'rounded-full!',
            }"
          />
        </div>

        <div class="space-y-3">
          <!-- Current Bundle Info -->
          <div v-if="version" class="p-3 border border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div class="flex items-center justify-between">
              <div>
                <div class="font-medium text-blue-800 dark:text-blue-200">
                  {{ t('current-bundle') }}
                </div>
                <div class="text-sm text-blue-600 dark:text-blue-300">
                  {{ version.name }}
                </div>
              </div>
              <div class="text-blue-600 dark:text-blue-400 text-xl">
                📦
              </div>
            </div>
          </div>

          <!-- Available Channels -->
          <div v-if="filteredChannels.length > 0" class="space-y-2">
            <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">
              {{ t('available-channels') }}
            </h4>
            <div
              v-for="chan in filteredChannels"
              :key="chan.id"
              class="p-3 border rounded-lg cursor-pointer transition-colors"
              :class="{
                'border-blue-500 bg-blue-50 dark:bg-blue-900/20': selectedChannelForLink?.id === chan.id,
                'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700': selectedChannelForLink?.id !== chan.id,
                'border-green-500 bg-green-50 dark:bg-green-900/20': version && chan.version === version.id,
              }"
              @click="selectedChannelForLink = chan"
            >
              <div class="flex items-center justify-between">
                <div>
                  <div class="font-medium flex items-center gap-2">
                    {{ chan.name }}
                    <span v-if="version && chan.version === version.id" class="text-xs bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-200 px-2 py-1 rounded-full">
                      {{ t('current') }}
                    </span>
                  </div>
                  <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {{ t('channel-id') }}: {{ chan.id }}
                    <span v-if="chan.public" class="text-blue-600 dark:text-blue-400 ml-2">• {{ t('public') }}</span>
                    <span v-else class="text-gray-500 dark:text-gray-400 ml-2">• {{ t('private') }}</span>
                  </div>
                  <div v-if="chan.ios || chan.android" class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    <span v-if="chan.ios" class="mr-2">📱 iOS</span>
                    <span v-if="chan.android">🤖 Android</span>
                  </div>
                  <div v-if="chan.created_at" class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {{ t('created') }}: {{ new Date(chan.created_at).toLocaleDateString() }}
                  </div>
                </div>
                <div class="text-2xl">
                  <span v-if="selectedChannelForLink?.id === chan.id" class="text-blue-600 dark:text-blue-400">✓</span>
                  <span v-else-if="version && chan.version === version.id" class="text-green-600 dark:text-green-400">🔗</span>
                  <span v-else class="text-gray-300 dark:text-gray-600">○</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Empty states -->
          <div v-if="channels.length === 0" class="text-center text-gray-500 dark:text-gray-400 py-8">
            <div class="text-4xl mb-2">
              📱
            </div>
            <div class="font-medium">
              {{ t('no-channels-available') }}
            </div>
            <div class="text-sm mt-1">
              {{ t('create-a-channel-first-to-link-bundles') }}
            </div>
          </div>

          <div v-else-if="filteredChannels.length === 0 && channelSearchVal.trim()" class="text-center text-gray-500 dark:text-gray-400 py-8">
            <div class="text-4xl mb-2">
              🔍
            </div>
            <div class="font-medium">
              {{ t('no-channels-found') }}
            </div>
            <div class="text-sm mt-1">
              {{ t('try-a-different-search-term') }}
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Teleport Content for Channel Actions (Settings) -->
    <Teleport v-if="dialogStore.showDialog && dialogStore.dialogOptions?.title === t('channel-actions') && currentChannelAction === 'open'" defer to="#dialog-v2-content">
      <div class="w-full space-y-4">
        <div class="text-left">
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
            {{ t('select-action-for-channel', { channel: selectedChannelForLink?.name || '' }) }}
          </p>
        </div>

        <div class="space-y-3">
          <!-- Set Bundle (if user has permissions) -->
          <div
            v-if="role && (role === 'admin' || role === 'super_admin' || role === 'write')"
            class="p-3 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
            @click="handleChannelAction('set')"
          >
            <div class="flex items-center justify-between">
              <div>
                <div class="font-medium">
                  {{ t('set-bundle') }}
                </div>
                <div class="text-sm text-gray-600 dark:text-gray-400">
                  {{ t('link-this-bundle-to-another-channel') }}
                </div>
              </div>
              <div class="text-green-600 dark:text-green-400">
                ⚡
              </div>
            </div>
          </div>

          <!-- Unlink Channel (if user has permissions) -->
          <div
            v-if="role && (role === 'admin' || role === 'super_admin' || role === 'write')"
            class="p-3 border border-red-300 dark:border-red-600 rounded-lg cursor-pointer hover:bg-red-50 dark:hover:bg-red-900/20"
            @click="handleChannelAction('unlink')"
          >
            <div class="flex items-center justify-between">
              <div>
                <div class="font-medium text-red-600 dark:text-red-400">
                  {{ t('unlink-channel') }}
                </div>
                <div class="text-sm text-red-500 dark:text-red-300">
                  {{ t('remove-bundle-from-channel') }}
                </div>
              </div>
              <div class="text-red-600 dark:text-red-400">
                🔗⚡
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
