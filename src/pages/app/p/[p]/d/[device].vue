<script setup lang="ts">
import { kBlockTitle, kList, kListInput, kListItem } from 'konsta/vue'
import { computed, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { gt } from 'semver'
import { formatDate } from '~/services/date'
import { useSupabase } from '~/services/supabase'
import TitleHead from '~/components/TitleHead.vue'
import type { Database } from '~/types/supabase.types'
import { useMainStore } from '~/stores/main'
import { useDisplayStore } from '~/stores/display'

interface Device {
  version: Database['public']['Tables']['app_versions']['Row']
}
interface Channel {
  version: Database['public']['Tables']['app_versions']['Row']
}
interface ChannelDev {
  channel_id: Database['public']['Tables']['channels']['Row'] & Channel
}
interface InfiniteScrollCustomEvent extends CustomEvent {
  target: HTMLIonInfiniteScrollElement
}
interface Stat {
  version: {
    name: string
  }
}
const fetchLimit = 40
let fetchOffset = 0
const isDisabled = ref(false)
const displayStore = useDisplayStore()
const { t } = useI18n()
const main = useMainStore()
const route = useRoute()
const supabase = useSupabase()
const packageId = ref<string>('')
const search = ref<string>('')
const id = ref<string>()
const isLoading = ref(true)
const isLoadingSub = ref(true)
const device = ref<Database['public']['Tables']['devices']['Row'] & Device>()
const logs = ref<(Database['public']['Tables']['stats']['Row'] & Stat)[]>([])
const filtered = ref<(Database['public']['Tables']['stats']['Row'] & Stat)[]>([])
const deviceOverride = ref<Database['public']['Tables']['devices_override']['Row'] & Device>()
const channels = ref<(Database['public']['Tables']['channels']['Row'] & Channel)[]>([])
const versions = ref<Database['public']['Tables']['app_versions']['Row'][]>([])
const channelDevice = ref<Database['public']['Tables']['channel_devices']['Row'] & ChannelDev>()

const logFiltered = computed(() => {
  if (search.value)
    return filtered.value
  return logs.value
})
const getVersion = async () => {
  try {
    const { data, error } = await supabase
      .from('app_versions')
      .select()
      .eq('app_id', packageId.value)
      .eq('deleted', false)
      .order('created_at', { ascending: false })
    if (error) {
      console.error('getVersion', error)
      return
    }
    versions.value = data || versions.value
  }
  catch (error) {
    console.error(error)
  }
}
const getChannels = async () => {
  try {
    const { data, error } = await supabase
      .from('channels')
      .select(`
        id,
        name,
        created_at,
        updated_at
      `)
      .eq('app_id', packageId.value)
    if (error) {
      console.error('getChannels', error)
      return
    }
    channels.value = (data || []) as (Database['public']['Tables']['channels']['Row'] & Channel)[]
  }
  catch (error) {
    console.error(error)
  }
}
const onSearchLog = async (val: string | undefined) => {
  if (val == null) {
    search.value = ''
    return
  }
  search.value = val
  isLoadingSub.value = true
  const { data: dataStats } = await supabase
    .from('stats')
    .select(`
        device_id,
        action,
        platform,
        version_build,
        version (
            name
        ),
        created_at,
        updated_at
      `)
    .eq('device_id', id.value)
    .order('created_at', { ascending: false })
    .like('action', `%${search.value}%`)
  logs.value = (dataStats || []) as (Database['public']['Tables']['stats']['Row'] & Stat)[]
  isLoadingSub.value = false
}
const loadStatsData = async (event?: InfiniteScrollCustomEvent) => {
  isLoadingSub.value = true
  try {
    // create a date object for the last day of the previous month with dayjs
    const { data: dataStats } = await supabase
      .from('stats')
      .select(`
        device_id,
        action,
        platform,
        version_build,
        version (
            name
        ),
        created_at,
        updated_at
      `)
      .eq('device_id', id.value)
      .order('created_at', { ascending: false })
      .range(fetchOffset, fetchOffset + fetchLimit - 1)
    if (!dataStats)
      return
    logs.value.push(...dataStats as (Database['public']['Tables']['stats']['Row'] & Stat)[])
    if (dataStats.length === fetchLimit)
      fetchOffset += fetchLimit
    else
      isDisabled.value = true
  }
  catch (error) {
    console.error(error)
  }
  isLoadingSub.value = false
  if (event)
    event.target.complete()
}
const getChannelOverride = async () => {
  const { data, error } = await supabase
    .from('channel_devices')
    .select(`
      device_id,
      app_id,
      channel_id (
        name,
        version (
          name
        )
      ),
      created_at,
      updated_at
    `)
    .eq('app_id', packageId.value)
    .eq('device_id', id.value)
    .single()
  if (error) {
    console.error('getChannelOverride', error)
    return
  }
  channelDevice.value = (data || undefined) as Database['public']['Tables']['channel_devices']['Row'] & ChannelDev
}
const getDeviceOverride = async () => {
  const { data, error } = await supabase
    .from('devices_override')
    .select(`
      device_id,
      app_id,
      version (
          name
      ),
      created_at,
      updated_at
    `)
    .eq('app_id', packageId.value)
    .eq('device_id', id.value)
    .single()
  if (error) {
    console.error('getDeviceOverride', error)
    return
  }
  deviceOverride.value = (data || undefined) as Database['public']['Tables']['devices_override']['Row'] & Device
}
const getDevice = async () => {
  if (!id.value)
    return
  try {
    const { data, error } = await supabase
      .from('devices')
      .select(`
          device_id,
          app_id,
          platform,
          os_version,
          custom_id,
          version (
            name,
            app_id,
            bucket_id,
            created_at
          ),
          is_prod,
          is_emulator,
          version_build,
          created_at,
          plugin_version,
          updated_at
        `)
      .eq('device_id', id.value)
      .single()
    if (data && !error)
      device.value = data as Database['public']['Tables']['devices']['Row'] & Device
    else
      console.error('no devices', error)
    // console.log('device', device.value)
  }
  catch (error) {
    console.error(error)
  }
}

const minVersion = (val: string, min = '4.6.99') => {
  return gt(val, min)
}

const loadData = async () => {
  isLoading.value = true
  logs.value = []
  fetchOffset = 0
  await Promise.all([
    getDevice(),
    getDeviceOverride(),
    getChannelOverride(),
    getChannels(),
    getVersion(),
    loadStatsData(),
  ])
  isLoading.value = false
}

const upsertDevVersion = async (device: string, v: Database['public']['Tables']['app_versions']['Row']) => {
  return supabase
    .from('devices_override')
    .upsert({
      device_id: device,
      version: v.id,
      app_id: packageId.value,
      created_by: main.user?.id,
    })
}
const didCancel = async (name: string) => {
  displayStore.dialogOption = {
    header: t('alert.confirm-delete'),
    message: `${t('alert.delete-message')} ${name} ${t('from-device')} ?`,
    buttons: [
      {
        text: t('button.cancel'),
        role: 'cancel',
      },
      {
        text: t('button.delete'),
        id: 'confirm-button',
      },
    ],
  }
  displayStore.showDialog = true
  return displayStore.onDialogDismiss()
}
const saveCustomId = async () => {
  console.log('device.value?.custom_id', device.value?.custom_id)
  await supabase
    .from('devices')
    .update({
      custom_id: device.value?.custom_id,
    })
    .eq('device_id', id.value)
  displayStore.messageToast.push(t('custom-id-saved'))
}
const delDevVersion = async (device: string) => {
  if (await didCancel(t('channel.device')))
    return
  return supabase
    .from('devices_override')
    .delete()
    .eq('device_id', device)
    .eq('app_id', packageId.value)
}
const updateOverride = async () => {
  const buttons = []
  if (deviceOverride.value) {
    buttons.push({
      text: t('button.remove'),
      handler: async () => {
        device.value?.device_id && delDevVersion(device.value?.device_id)
        displayStore.messageToast.push(t('device.unlink_version'))
        await loadData()
      },
    })
  }
  for (const version of versions.value) {
    buttons.push({
      text: version.name,
      handler: async () => {
        if (!device.value?.device_id)
          return
        isLoading.value = true
        try {
          await upsertDevVersion(device.value?.device_id, version)
          displayStore.messageToast.push(t('device.link_version'))
          await loadData()
        }
        catch (error) {
          console.error(error)
          displayStore.messageToast.push(t('device.link_fail'))
        }
        isLoading.value = false
      },
    })
  }
  buttons.push({
    text: t('button.cancel'),
    role: 'cancel',
    handler: () => {
      // console.log('Cancel clicked')
    },
  })
  displayStore.actionSheetOption = {
    header: t('package.link_version'),
    buttons,
  }
  displayStore.showActionSheet = true
}
const upsertDevChannel = async (device: string, channel: Database['public']['Tables']['channels']['Row']) => {
  if (!main?.user?.id)
    return
  return supabase
    .from('channel_devices')
    .upsert({
      device_id: device,
      channel_id: channel.id,
      app_id: packageId.value,
      created_by: main.user.id,
    })
}
const delDevChannel = async (device: string) => {
  if (await didCancel(t('channel.title')))
    return
  return supabase
    .from('channel_devices')
    .delete()
    .eq('device_id', device)
    .eq('app_id', packageId.value)
}
const updateChannel = async () => {
  const buttons = []
  if (channelDevice.value) {
    buttons.push({
      text: t('button.remove'),
      handler: async () => {
        device.value?.device_id && delDevChannel(device.value?.device_id)
        displayStore.messageToast.push(t('device.unlink_channel'))
        await loadData()
      },
    })
  }
  for (const channel of channels.value) {
    buttons.push({
      text: channel.name,
      handler: async () => {
        if (!device.value?.device_id)
          return
        isLoading.value = true
        try {
          await upsertDevChannel(device.value?.device_id, channel)
          displayStore.messageToast.push(t('device.link_channel'))
          await loadData()
        }
        catch (error) {
          console.error(error)
          displayStore.messageToast.push(t('device.link_fail'))
        }
        isLoading.value = false
      },
    })
  }
  buttons.push({
    text: t('button.cancel'),
    role: 'cancel',
    handler: () => {
      // console.log('Cancel clicked')
    },
  })
  displayStore.actionSheetOption = {
    header: t('package.link_channel'),
    buttons,
  }
  displayStore.showActionSheet = true
}

watchEffect(async () => {
  if (route.path.includes('/d/')) {
    packageId.value = route.params.p as string
    packageId.value = packageId.value.replace(/--/g, '.')
    id.value = route.params.device as string
    await loadData()
  }
})
</script>

<template>
  <TitleHead :title="t('device.title')" color="warning" />
  <!-- <IonList>
    <IonListHeader>
      <span class="text-vista-blue-500">
        {{ device?.device_id }}
      </span>
    </IonListHeader>
    <IonItemDivider>
      <IonLabel>
        {{ t('device.info') }}
      </IonLabel>
    </IonItemDivider>
    <IonItem v-if="device">
      <IonLabel>
        <h2 class="text-sm text-azure-500">
          {{ t('device.platform') }}
        </h2>
      </IonLabel>
      <IonNote slot="end">
        {{ device.platform }}
      </IonNote>
    </IonItem>
    <IonItem v-if="device">
      <IonLabel>
        <h2 class="text-sm text-azure-500">
          {{ t('custom-id') }}
        </h2>
      </IonLabel>
      <IonNote slot="end">
        <IonInput v-model="device.custom_id" @ion-blur="saveCustomId()" />
      </IonNote>
    </IonItem>
    <IonItem v-if="device">
      <IonLabel>
        <h2 class="text-sm text-azure-500">
          {{ t('device.plugin_version') }}
        </h2>
      </IonLabel>
      <IonNote slot="end">
        {{ device.plugin_version }}
      </IonNote>
    </IonItem>
    <IonItem v-if="device">
      <IonLabel>
        <h2 class="text-sm text-azure-500">
          {{ t('device.version') }}
        </h2>
      </IonLabel>
      <IonNote slot="end">
        {{ device.version.name }}
      </IonNote>
    </IonItem>
    <IonItem v-if="device">
      <IonLabel>
        <h2 class="text-sm text-azure-500">
          {{ t('version-builtin') }}
        </h2>
      </IonLabel>
      <IonNote slot="end">
        {{ device.version_build }}
      </IonNote>
    </IonItem>
    <IonItem v-if="device">
      <IonLabel>
        <h2 class="text-sm text-azure-500">
          {{ t('device.os_version') }}
        </h2>
      </IonLabel>
      <IonNote slot="end">
        {{ device.os_version || 'unknow' }}
      </IonNote>
    </IonItem>
    <IonItem v-if="device && minVersion(device.plugin_version)">
      <IonLabel>
        <h2 class="text-sm text-azure-500">
          {{ t('is-emulator') }}
        </h2>
      </IonLabel>
      <IonNote slot="end">
        {{ device.is_emulator }}
      </IonNote>
    </IonItem>
    <IonItem v-if="device && minVersion(device.plugin_version)">
      <IonLabel>
        <h2 class="text-sm text-azure-500">
          {{ t('is-production-app') }}
        </h2>
      </IonLabel>
      <IonNote slot="end">
        {{ device.is_prod }}
      </IonNote>
    </IonItem>
    <IonItem v-if="(device && device.updated_at)">
      <IonLabel>
        <h2 class="text-sm text-azure-500">
          {{ t('device.last_update') }}
        </h2>
      </IonLabel>
      <IonNote slot="end">
        {{ formatDate(device.updated_at) }}
      </IonNote>
    </IonItem>
    <IonItem v-if="(device && device.created_at)">
      <IonLabel>
        <h2 class="text-sm text-azure-500">
          {{ t('device.created_at') }}
        </h2>
      </IonLabel>
      <IonNote slot="end">
        {{ formatDate(device.created_at) }}
      </IonNote>
    </IonItem>
    <IonItem v-if="device" class="cursor-pointer" @click="updateOverride">
      <IonLabel>
        <h2 class="text-sm text-azure-500">
          {{ t('device.force_version') }}
        </h2>
      </IonLabel>
      <IonNote slot="end">
        {{ deviceOverride?.version?.name || t('device.no_override') }}
      </IonNote>
    </IonItem>
    <IonItem v-if="device" class="cursor-pointer" @click="updateChannel">
      <IonLabel>
        <h2 class="text-sm text-azure-500">
          {{ t('device.channel') }}
        </h2>
      </IonLabel>
      <IonNote slot="end">
        {{ channelDevice?.channel_id.name || t('device.no_channel') }}
      </IonNote>
    </IonItem>
  </IonList>
  <IonList>
    <IonListHeader>
      <IonLabel>Logs</IonLabel>
    </IonListHeader>
    <div v-if="isLoadingSub" class="flex justify-center chat-items">
      <Spinner />
    </div>
    <IonSearchbar v-if="!isLoadingSub" @ion-change="onSearchLog($event.detail.value)" />
    <template v-for="s in logFiltered" :key="s.id">
      <IonItem>
        <IonLabel>
          <h2 class="text-sm text-azure-500">
            {{ s.action }} {{ s.version.name }}, builtin {{ s.version_build }}
          </h2>
        </IonLabel>
        <IonNote slot="end">
          {{ formatDate(s.created_at || '') }}
        </IonNote>
      </IonItem>
    </template>
    <IonInfiniteScroll
      threshold="100px"
      :disabled="isDisabled || !!search"
      @ion-infinite="loadStatsData($event)"
    >
      <IonInfiniteScrollContent
        loading-spinner="bubbles"
        :loading-text="t('loading-more-data')"
      />
    </IonInfiniteScroll>
  </IonList> -->
  <k-block-title class="md:hidden">
    {{ t('device.info') }}
  </k-block-title>
  <k-list v-if="device" class="h-full overflow-y-scroll md:hidden max-h-fit" strong-ios outline-ios>
    <k-list-item
      :title="t('device-id')"
      :text="device.device_id"
    />
    <k-list-item
      v-if="device.platform"
      :title="t('device.platform')"
      :after="device.platform"
    />
    <k-list-input :label="t('custom-id')" type="text" placeholder="1234" />
    <k-list-item
      :title="t('device.plugin_version')"
      :after="device.plugin_version"
    />
    <k-list-item
      :title="t('device.version')"
      :after="device.version.name"
    />
    <k-list-item
      v-if="device.version_build"
      :title="t('version-builtin')"
      :after="device.version_build"
    />
    <k-list-item
      :title="t('device.os_version')"
      :after="device.os_version || 'unknow'"
    />
    <k-list-item
      v-if="device.is_emulator && minVersion(device.plugin_version)"
      :title="t('is-emulator')"
      :after="device.is_emulator"
    />
    <k-list-item
      v-if="device.is_emulator && minVersion(device.plugin_version)"
      :title="t('is-production-app')"
      :after="device.is_prod"
    />
    <k-list-item
      v-if="device.updated_at"
      :title="t('device.last_update')"
      :after="formatDate(device.updated_at)"
    />
    <k-list-item
      v-if="device.created_at"
      :title="t('device.created_at')"
      :after="formatDate(device.created_at)"
    />
    <k-list-item
      :title="t('device.force_version')"
      :after="deviceOverride?.version?.name || t('device.no_override') "
      @click="updateOverride"
    />
    <k-list-item
      :title="t('device.channel')"
      :after="channelDevice?.channel_id.name || t('device.no_channel')"
      @click="updateChannel"
    />
  </k-list>
  <div v-if="device" class="hidden h-full p-8 pb-16 overflow-y-scroll md:block">
    <div>
      <h3 class="text-lg font-medium leading-6 text-gray-300">
        {{ t('device.info') }}
      </h3>
      <p class="max-w-2xl mt-1 text-sm text-gray-500">
        {{ t('details-and-logs') }}
      </p>
    </div>
    <div class="mt-5 border-t border-gray-200">
      <dl class="sm:divide-y sm:divide-gray-200">
        <div class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
          <dt class="text-sm font-medium text-gray-500">
            {{ t('device-id') }}
          </dt>
          <dd class="mt-1 text-sm text-gray-300 sm:col-span-2 sm:mt-0">
            {{ device.device_id }}
          </dd>
        </div>
        <div class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
          <dt class="text-sm font-medium text-gray-500">
            {{ t('device.platform') }}
          </dt>
          <dd class="mt-1 text-sm text-gray-300 sm:col-span-2 sm:mt-0">
            {{ device.platform }}
          </dd>
        </div>
        <div class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
          <dt class="text-sm font-medium text-gray-500">
            {{ t('custom-id') }}
          </dt>
          <dd class="mt-1 text-sm text-gray-300 sm:col-span-2 sm:mt-0">
            <input v-model="device.custom_id" class="w-full max-w-xs input input-bordered" @ion-blur="saveCustomId()">
          </dd>
        </div>
        <div class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
          <dt class="text-sm font-medium text-gray-500">
            {{ t('device.plugin_version') }}
          </dt>
          <dd class="mt-1 text-sm text-gray-300 sm:col-span-2 sm:mt-0">
            {{ device.plugin_version }}
          </dd>
        </div>
        <div class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
          <dt class="text-sm font-medium text-gray-500">
            {{ t('device.version') }}
          </dt>
          <dd class="mt-1 text-sm text-gray-300 sm:col-span-2 sm:mt-0">
            {{ device.version.name }}
          </dd>
        </div>
        <div class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
          <dt class="text-sm font-medium text-gray-500">
            {{ t('version-builtin') }}
          </dt>
          <dd class="mt-1 text-sm text-gray-300 sm:col-span-2 sm:mt-0">
            {{ device.version_build }}
          </dd>
        </div>
        <div class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
          <dt class="text-sm font-medium text-gray-500">
            {{ t('device.os_version') }}
          </dt>
          <dd class="mt-1 text-sm text-gray-300 sm:col-span-2 sm:mt-0">
            {{ device.os_version || 'unknow' }}
          </dd>
        </div>
        <div v-if="minVersion(device.plugin_version)" class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
          <dt class="text-sm font-medium text-gray-500">
            {{ t('is-emulator') }}
          </dt>
          <dd class="mt-1 text-sm text-gray-300 sm:col-span-2 sm:mt-0">
            {{ device.is_emulator }}
          </dd>
        </div>
        <div v-if="minVersion(device.plugin_version)" class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
          <dt class="text-sm font-medium text-gray-500">
            {{ t('is-production-app') }}
          </dt>
          <dd class="mt-1 text-sm text-gray-300 sm:col-span-2 sm:mt-0">
            {{ device.is_prod }}
          </dd>
        </div>
        <div v-if="device.updated_at" class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
          <dt class="text-sm font-medium text-gray-500">
            {{ t('device.last_update') }}
          </dt>
          <dd class="mt-1 text-sm text-gray-300 sm:col-span-2 sm:mt-0">
            {{ formatDate(device.updated_at) }}
          </dd>
        </div>
        <div v-if="device.created_at" class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
          <dt class="text-sm font-medium text-gray-500">
            {{ t('device.created_at') }}
          </dt>
          <dd class="mt-1 text-sm text-gray-300 sm:col-span-2 sm:mt-0">
            {{ formatDate(device.created_at) }}
          </dd>
        </div>
        <div class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
          <dt class="text-sm font-medium text-gray-500">
            {{ t('device.force_version') }}
          </dt>
          <dd class="mt-1 text-sm text-gray-300 sm:col-span-2 sm:mt-0" @click="updateOverride">
            {{ deviceOverride?.version?.name || t('device.no_override') }}
          </dd>
        </div>
        <div class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
          <dt class="text-sm font-medium text-gray-500">
            {{ t('device.channel') }}
          </dt>
          <dd class="mt-1 text-sm text-gray-300 sm:col-span-2 sm:mt-0" @click="updateChannel">
            {{ channelDevice?.channel_id.name || t('device.no_channel') }}
          </dd>
        </div>
      </dl>
    </div>
  </div>
</template>

<style>
  #confirm-button {
    background-color: theme('colors.red.500');
    color: theme('colors.white');
  }
</style>
