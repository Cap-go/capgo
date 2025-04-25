<script setup lang="ts">
import type { Tab } from '~/components/comp_def'
import type { OrganizationRole } from '~/stores/organization'
import type { Database } from '~/types/supabase.types'
import { Capacitor } from '@capacitor/core'
import { parse } from '@std/semver'
import { useI18n } from 'petite-vue-i18n'
import { computed, ref, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import IconInformations from '~icons/heroicons/information-circle'
import IconTrash from '~icons/heroicons/trash'
import IconAlertCircle from '~icons/lucide/alert-circle'
import { appIdToUrl, bytesToMbText, urlToAppId } from '~/services/conversion'
import { formatDate } from '~/services/date'
import { useSupabase } from '~/services/supabase'
import { openVersion } from '~/services/versions'
import { useDisplayStore } from '~/stores/display'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'

const { t } = useI18n()
const route = useRoute('/app/p/[package].bundle.[bundle]')
const router = useRouter()
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
    displayStore.dialogOption = {
      header: t('cannot-copy'),
      message: text,
      buttons: [
        {
          text: t('button-cancel'),
          role: 'cancel',
        },
      ],
    }
    displayStore.showDialog = true
    await displayStore.onDialogDismiss()
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
  const buttons = []

  const normalHandler = async (chan: Database['public']['Tables']['channels']['Row']) => {
    if (!version.value)
      return
    try {
      await setChannel(chan, version.value.id)
      await getChannels()
    }
    catch (error) {
      console.error(error)
      toast.error(t('cannot-test-app-some'))
    }
  }

  for (const chan of channels.value) {
    const v: number = chan.version as any
    buttons.push({
      text: chan.name,
      selected: version.value.id === v,
      handler: async () => { await normalHandler(chan) },
    })
  }
  buttons.push({
    text: t('button-cancel'),
    role: 'cancel',
    handler: () => {
      // console.log('Cancel clicked')
    },
  })
  displayStore.dialogOption = {
    header: t('channel-linking'),
    buttons,
    buttonVertical: true,
    headerStyle: 'text-center',
    size: 'max-w-fit px-12',
  }
  displayStore.showDialog = true
  return displayStore.onDialogDismiss()
}

async function openChannel(selChannel: Database['public']['Tables']['channels']['Row']) {
  channel.value = selChannel
  if (!version.value || !main.auth)
    return
  if (!channel.value)
    return ASChannelChooser()

  displayStore.dialogOption = {
    header: t('channel-linking'),
    buttonVertical: true,
    headerStyle: 'text-center',
    size: 'max-w-fit px-12',
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
        handler: () => {
          // console.log('Cancel clicked')
        },
      },
    ],
  }

  // Push set-bundle if role > read
  if (displayStore.dialogOption.buttons && role.value && (role.value === 'admin' || role.value === 'super_admin' || role.value === 'write')) {
    displayStore.dialogOption.buttons.splice(0, 0, {
      text: t('set-bundle'),
      handler: () => {
        ASChannelChooser()
      },
    })
  }

  const baseIndex = (displayStore.dialogOption?.buttons?.length ?? 0) - 1

  // push in button at index 1 if channel is set
  if (channel.value && displayStore.dialogOption.buttons) {
    displayStore.dialogOption.buttons.splice(baseIndex, 0, {
      text: t('open-channel'),
      handler: () => {
        openChannelLink()
      },
    })
    if (role.value && (role.value === 'admin' || role.value === 'super_admin' || role.value === 'write')) {
      displayStore.dialogOption.buttons.splice(baseIndex + 1, 0, {
        text: t('unlink-channel'),
        role: 'danger',
        handler: async () => {
          try {
            if (!channel.value)
              return
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
        },
      })
    }
  }
  displayStore.showDialog = true
  return displayStore.onDialogDismiss()
}
async function openDownload() {
  if (!version.value || !main.auth)
    return
  displayStore.dialogOption = {
    header: t('are-you-sure-you-want-to-download'),
    headerStyle: 'w-full text-center',
    size: 'max-w-fit px-12',
    buttonCenter: true,
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
        handler: () => {
          // console.log('Cancel clicked')
        },
      },
      {
        text: Capacitor.isNativePlatform() ? t('launch-bundle') : t('download'),
        handler: async () => {
          if (!version.value)
            return
          if (version.value.session_key) {
            const filename = version.value.r2_path?.replace('/', '_')
            const localPath = `./${filename}`
            const command = `npx @capgo/cli@latest bundle decrypt ${localPath}  ${version.value.session_key} --key ./.capgo_key`
            displayStore.dialogOption = {
              header: '',
              message: `${t('to-open-encrypted-bu')}<br/><code>${command}</code>`,
              buttons: [
                {
                  text: t('copy-command'),
                  id: 'confirm-button',
                },
              ],
            }
            displayStore.showDialog = true
            await displayStore.onDialogDismiss()
            copyToast(command)
          }
          openVersion(version.value)
        },
      },
      {
        text: t('button-cancel'),
        role: 'cancel',
        handler: () => {
          // console.log('Cancel clicked')
        },
      },
    ],
  }
  displayStore.showDialog = true
  return displayStore.onDialogDismiss()
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
    displayStore.dialogOption = {
      header: t('select-style-of-deletion'),
      message: t('select-style-of-deletion-msg').replace('$1', `<a href="https://capgo.app/docs/webapp/bundles/#delete-a-bundle" target="_blank">${t('here')}</a>`),
      buttons: [
        {
          text: t('normal'),
          role: 'normal',
          handler: () => {
            method = 'normal'
          },
        },
        {
          text: t('unsafe'),
          role: 'danger',
          id: 'unsafe',
          handler: async () => {
            if (!organizationStore.hasPermisisonsInRole(await organizationStore.getCurrentRoleForApp(packageId.value), ['super_admin'])) {
              toast.error(t('no-permission-ask-super-admin'))
              return
            }
            method = 'unsafe'
          },
        },
      ],
    }
    displayStore.showDialog = true
    if (await displayStore.onDialogDismiss() || !method)
      return true
  }
  else {
    method = 'unsafe' // If not asking, assume unsafe (used for already soft-deleted)
  }

  displayStore.dialogOption = {
    header: t('alert-confirm-delete'),
    message:
      askForMethod
        ? `${t('alert-not-reverse-message')} ${t('alert-delete-message')} ${name} ${t('you-cannot-reuse')}.`
        : `${t('alert-not-reverse-message')} ${t('alert-delete-message')} ${name}?\
${t('you-are-deleting-unsafely').replace('$1', '<b><u>').replace('$2', '</u></b>').replace('$3', '<a href="https://capgo.app/docs/webapp/bundles/#delete-a-bundle" target="_blank">').replace('$4', '</a>')}.`,
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
  if (await displayStore.onDialogDismiss())
    return true
  if (method === null)
    throw new Error('Unreachable, method = null')

  return method
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
      toast.error(t('error-checking-channels')) // Add translation key
      return
    }

    if (channelFound && channelFound.length > 0) {
      displayStore.dialogOption = {
        header: t('want-to-unlink'),
        message: t('channel-bundle-linked').replace('%s', channelFound.map((ch: any) => `${ch.name} (${ch.version.name})`).join(', ')),
        buttons: [
          {
            text: t('yes'),
            role: 'yes',
            id: 'yes',
            handler: () => {
              unlink = channelFound.map((ch: any) => ({ id: ch.id, name: ch.name })) // Map to id and name
            },
          },
          {
            text: t('no'),
            id: 'cancel',
            role: 'cancel',
          },
        ],
      }
      displayStore.showDialog = true
      if (await displayStore.onDialogDismiss()) {
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

    // Unlink channels if confirmed
    if (unlink.length > 0) {
      const { data: unknownVersion, error: unknownError } = await supabase
        .from('app_versions')
        .select('id')
        .eq('app_id', version.value.app_id)
        .eq('name', 'unknown')
        .single()

      if (unknownError || !unknownVersion) {
        toast.error(t('cannot-find-unknown-version'))
        console.error('Cannot find unknown version:', unknownError)
        return
      }

      const { error: updateError } = await supabase
        .from('channels')
        .update({ version: unknownVersion.id })
        .in('id', unlink.map(c => c.id))

      if (updateError) {
        toast.error(t('unlink-error'))
        console.error('Channel unlink error:', updateError)
        // Decide whether to proceed with deletion or stop
        // return // Optional: stop deletion if unlinking fails
      }
      else {
        toast.success(t('channels-unlinked-successfully')) // Add translation key
      }
    }

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
            <InfoRow v-if="version.checksum" :label="t('checksum')">
              {{ version.checksum }}
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
            <!-- <InfoRow v-if="version_meta?.installs && version_meta?.fails" :label="t('percent-fail')" :value="failPercent" /> -->
            <InfoRow v-if="channels && channels.length > 0 && version && channels.filter(c => c.version === version!.id).length > 0" :label="t('channel')">
              <span class="flex justify-end w-full">
                <span v-for="chn in channels.filter(c => c.version === version!.id)" id="open-channel" :key="chn.id">
                  <span
                    class="pr-3 font-bold text-blue-600 underline cursor-pointer underline-offset-4 active dark:text-blue-500 text-dust"
                    @click="openChannel(chn)"
                  >
                    {{ chn!.name }}
                  </span>
                </span>
              </span>
            </InfoRow>
            <InfoRow
              v-else id="open-channel" :label="t('channel')" :is-link="true"
              @click="openChannel(channel!)"
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
              @click="copyToast(version?.session_key || '')"
            >
              {{ hideString(version.session_key) }}
            </InfoRow>
            <!-- version.external_url -->
            <InfoRow
              v-if="version.external_url" :label="t('url')" :is-link="true"
              @click="copyToast(version?.external_url || '')"
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
              :value="t('bundle-active')"
              :icon="IconTrash"
              :disabled="!organizationStore.hasPermisisonsInRole(role, ['admin', 'write', 'super_admin'])"
            >
              <span class="text-red-500 dark:text-red-400 cursor-pointer underline underline-offset-4 active font-bold text-dust hover:text-red-600" @click="deleteBundle">
                {{ t('bundle-delete') }}
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
      <button class="mt-4 btn btn-primary" @click="router.push(`/app/p/${appIdToUrl(packageId)}/bundles/`)">
        {{ t('back-to-bundles') }}
      </button>
    </div>
  </div>
</template>
