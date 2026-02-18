<script setup lang="ts">
import type { Ref } from 'vue'
import type { TableColumn } from '../comp_def'
import type { Database } from '~/types/supabase.types'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import IconShield from '~icons/heroicons/shield-check'
import IconTrash from '~icons/heroicons/trash'
import IconWrench from '~icons/heroicons/wrench'
import { formatDate } from '~/services/date'
import { checkPermissions } from '~/services/permissions'
import { useSupabase } from '~/services/supabase'
import { useDialogV2Store } from '~/stores/dialogv2'

const props = defineProps<{
  appId: string
}>()

interface RoleBinding {
  id: string
  principal_type: string
  principal_id: string
  role_id: string
  role_name: string
  role_description: string
  scope_type: string
  org_id: string
  app_id: string | null
  channel_id: string | null
  granted_at: string
  granted_by: string
  expires_at: string | null
  reason: string | null
  is_direct: boolean
  principal_name: string
  user_email: string | null
  group_name: string | null
}

type Element = RoleBinding

type ChannelPermissionKey = 'channel.read' | 'channel.read_history' | 'channel.promote_bundle'

interface ChannelSummary {
  id: number
  name: string
}

const { t } = useI18n()
const dialogStore = useDialogV2Store()
const supabase = useSupabase()
const app = ref<Database['public']['Tables']['apps']['Row']>()
const total = ref(0)
const search = ref('')
const columns: Ref<TableColumn[]> = ref<TableColumn[]>([])
const elements = ref<Element[]>([])
const isLoading = ref(true)
const currentPage = ref(1)
const canUpdateUserRoles = ref(false)
const selectedRole = ref('')
const channelOverrides = ref<Record<string, boolean>>({})
const channelOverridesLoading = ref(false)
const channelOverridesSearch = ref('')
const channelOverridesSaving = ref<Record<string, boolean>>({})
const selectedPrincipal = ref<Element | null>(null)
const channels = ref<ChannelSummary[]>([])

// Define app role options
const appRoleOptions = computed(() => [
  { label: t('role-app-developer'), value: 'app_developer' },
  { label: t('role-app-uploader'), value: 'app_uploader' },
  { label: t('role-app-reader'), value: 'app_reader' },
])

const channelPermissionOptions = computed(() => [
  { key: 'channel.read' as ChannelPermissionKey, label: t('channel-permission-read') },
  { key: 'channel.read_history' as ChannelPermissionKey, label: t('channel-permission-history') },
  { key: 'channel.promote_bundle' as ChannelPermissionKey, label: t('channel-permission-associate') },
])

const roleDefaultChannelPermissions: Record<string, Record<ChannelPermissionKey, boolean>> = {
  app_admin: {
    'channel.read': true,
    'channel.read_history': true,
    'channel.promote_bundle': true,
  },
  app_developer: {
    'channel.read': true,
    'channel.read_history': true,
    'channel.promote_bundle': true,
  },
  app_uploader: {
    'channel.read': true,
    'channel.read_history': true,
    'channel.promote_bundle': true,
  },
  app_reader: {
    'channel.read': false,
    'channel.read_history': false,
    'channel.promote_bundle': false,
  },
}

function getOverrideKey(channelId: number, permission: ChannelPermissionKey) {
  return `${channelId}:${permission}`
}

function hasOverride(channelId: number, permission: ChannelPermissionKey) {
  const key = getOverrideKey(channelId, permission)
  return Object.prototype.hasOwnProperty.call(channelOverrides.value, key)
}

function getOverrideValue(channelId: number, permission: ChannelPermissionKey) {
  const key = getOverrideKey(channelId, permission)
  if (!hasOverride(channelId, permission))
    return undefined
  return channelOverrides.value[key]
}

function getDefaultPermission(roleName: string, permission: ChannelPermissionKey) {
  return roleDefaultChannelPermissions[roleName]?.[permission] ?? false
}

function getSelectValue(channelId: number, permission: ChannelPermissionKey): 'default' | 'allow' | 'deny' {
  const override = getOverrideValue(channelId, permission)
  if (override === undefined)
    return 'default'
  return override ? 'allow' : 'deny'
}

function getDefaultLabel(roleName: string, permission: ChannelPermissionKey) {
  return getDefaultPermission(roleName, permission)
    ? t('channel-permissions-default-allow')
    : t('channel-permissions-default-deny')
}

function isSavingOverride(channelId: number, permission: ChannelPermissionKey) {
  const key = getOverrideKey(channelId, permission)
  return !!channelOverridesSaving.value[key]
}

async function loadAppInfo() {
  try {
    const { data: dataApp } = await supabase
      .from('apps')
      .select()
      .eq('app_id', props.appId)
      .single()
    app.value = dataApp ?? undefined
    canUpdateUserRoles.value = false

    // Check app.update_user_roles permission
    if (app.value?.app_id) {
      canUpdateUserRoles.value = await checkPermissions('app.update_user_roles', { appId: app.value.app_id })
    }
  }
  catch (error) {
    console.error('Error loading app info:', error)
    app.value = undefined
    canUpdateUserRoles.value = false
  }
}

async function fetchData() {
  if (!props.appId || !app.value?.owner_org || !app.value?.id)
    return

  isLoading.value = true
  try {
    // Use the secure RPC to fetch access
    const { data, error } = await supabase
      .rpc('get_app_access_rbac', {
        p_app_id: app.value.id,
      })

    if (error)
      throw error

    // Data is already enriched by the RPC
    elements.value = (data as any) || []
    total.value = data?.length || 0
  }
  catch (error: any) {
    console.error('Error fetching role bindings:', error)
    toast.error(t('error-fetching-role-bindings'))
  }
  finally {
    isLoading.value = false
  }
}

const filteredChannels = computed(() => {
  if (!channelOverridesSearch.value)
    return channels.value
  const searchLower = channelOverridesSearch.value.toLowerCase()
  return channels.value.filter(channel => channel.name.toLowerCase().includes(searchLower))
})

async function loadChannelPermissions() {
  if (!selectedPrincipal.value)
    return

  channelOverridesLoading.value = true
  try {
    const { data: channelData, error: channelError } = await supabase
      .from('channels')
      .select('id, name')
      .eq('app_id', props.appId)
      .order('name', { ascending: true })

    if (channelError)
      throw channelError

    channels.value = (channelData as ChannelSummary[]) || []

    if (channels.value.length === 0) {
      channelOverrides.value = {}
      return
    }

    const channelIds = channels.value.map(channel => channel.id)
    const { data: overrides, error: overridesError } = await supabase
      .from('channel_permission_overrides' as any)
      .select('channel_id, permission_key, is_allowed')
      .eq('principal_type', selectedPrincipal.value.principal_type)
      .eq('principal_id', selectedPrincipal.value.principal_id)
      .in('channel_id', channelIds)

    if (overridesError)
      throw overridesError

    const nextOverrides: Record<string, boolean> = {}
    for (const override of (overrides as any[] || [])) {
      const key = getOverrideKey(override.channel_id, override.permission_key)
      nextOverrides[key] = override.is_allowed
    }
    channelOverrides.value = nextOverrides
  }
  catch (error) {
    console.error('Error loading channel permissions:', error)
    toast.error(t('error-loading-channel-permissions'))
  }
  finally {
    channelOverridesLoading.value = false
  }
}

async function openChannelPermissions(element: Element) {
  if (!canUpdateUserRoles.value)
    return

  selectedPrincipal.value = element
  channelOverridesSearch.value = ''
  channelOverrides.value = {}
  channels.value = []

  dialogStore.openDialog({
    id: 'channel-permissions',
    title: t('channel-permissions-title'),
    description: t('channel-permissions-description'),
    size: 'xl',
    buttons: [
      {
        text: t('close'),
        role: 'cancel',
      },
    ],
  })

  await loadChannelPermissions()
}

async function updateChannelPermission(channelId: number, permission: ChannelPermissionKey, value: 'default' | 'allow' | 'deny') {
  if (!selectedPrincipal.value || !canUpdateUserRoles.value)
    return

  const key = getOverrideKey(channelId, permission)
  if (channelOverridesSaving.value[key])
    return

  const roleName = selectedPrincipal.value.role_name
  const defaultAllowed = getDefaultPermission(roleName, permission)
  const previousOverrides = { ...channelOverrides.value }

  channelOverridesSaving.value = { ...channelOverridesSaving.value, [key]: true }

  let nextOverride: boolean | null = null
  if (value === 'default') {
    nextOverride = null
  }
  else {
    const isAllowed = value === 'allow'
    nextOverride = isAllowed === defaultAllowed ? null : isAllowed
  }

  if (nextOverride === null) {
    const updated = { ...channelOverrides.value }
    delete updated[key]
    channelOverrides.value = updated
  }
  else {
    channelOverrides.value = { ...channelOverrides.value, [key]: nextOverride }
  }

  try {
    if (nextOverride === null) {
      const { error } = await supabase
        .from('channel_permission_overrides' as any)
        .delete()
        .eq('principal_type', selectedPrincipal.value.principal_type)
        .eq('principal_id', selectedPrincipal.value.principal_id)
        .eq('channel_id', channelId)
        .eq('permission_key', permission)

      if (error)
        throw error
    }
    else {
      const { error } = await supabase
        .from('channel_permission_overrides' as any)
        .upsert({
          principal_type: selectedPrincipal.value.principal_type,
          principal_id: selectedPrincipal.value.principal_id,
          channel_id: channelId,
          permission_key: permission,
          is_allowed: nextOverride,
        }, { onConflict: 'principal_type,principal_id,channel_id,permission_key' })

      if (error)
        throw error
    }
  }
  catch (error) {
    console.error('Error saving channel permission override:', error)
    channelOverrides.value = previousOverrides
    toast.error(t('error-saving-channel-permissions'))
  }
  finally {
    const updatedSaving = { ...channelOverridesSaving.value }
    delete updatedSaving[key]
    channelOverridesSaving.value = updatedSaving
  }
}

async function showRoleModal(element: Element): Promise<string | undefined> {
  selectedRole.value = element.role_name

  dialogStore.openDialog({
    id: 'select-app-role',
    title: t('select-app-role'),
    description: t('select-role'),
    size: 'lg',
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('button-confirm'),
        role: 'primary',
        handler: () => {
          if (!selectedRole.value) {
            toast.error(t('please-select-permission'))
            return false
          }
          return true
        },
      },
    ],
  })

  const wasDismissed = await dialogStore.onDialogDismiss()
  if (wasDismissed) {
    return undefined
  }
  const roleSnapshot = selectedRole.value
  return roleSnapshot
}

async function changeUserRole(element: Element) {
  if (!canUpdateUserRoles.value)
    return

  const newRoleName = await showRoleModal(element)

  if (!newRoleName || newRoleName === element.role_name) {
    return
  }

  const isValidRole = appRoleOptions.value.some(option => option.value === newRoleName)
  if (!isValidRole) {
    return
  }

  isLoading.value = true
  try {
    // Fetch the new role UUID from the roles table
    const { data: roleData, error: roleError } = await supabase
      .from('roles')
      .select('id')
      .eq('name', newRoleName)
      .single()

    if (roleError || !roleData) {
      console.error('Error fetching role UUID:', roleError)
      throw new Error('Role not found')
    }

    // Update the existing role_id
    const { error: updateError } = await supabase
      .from('role_bindings')
      .update({
        role_id: roleData.id,
      })
      .eq('id', element.id)

    if (updateError)
      throw updateError

    toast.success(t('permission-changed'))
    await refreshData()
  }
  catch (error: any) {
    console.error('Error changing role:', error)
    toast.error(t('error-assigning-role'))
  }
  finally {
    isLoading.value = false
  }
}

async function deleteElement(element: Element) {
  dialogStore.openDialog({
    title: t('remove-role'),
    description: t('remove-role-confirm'),
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('remove'),
        role: 'danger',
      },
    ],
  })

  const wasCanceled = await dialogStore.onDialogDismiss()
  if (wasCanceled || dialogStore.lastButtonRole !== 'danger')
    return

  isLoading.value = true
  try {
    // Delete directly via RLS
    const { error } = await supabase
      .from('role_bindings')
      .delete()
      .eq('id', element.id)

    if (error)
      throw error

    toast.success(t('role-removed'))
    await refreshData()
  }
  catch (error: any) {
    console.error('Error removing role:', error)
    toast.error(t('error-removing-role'))
  }
  finally {
    isLoading.value = false
  }
}

async function reload() {
  await refreshData()
}

async function refreshData() {
  isLoading.value = true
  try {
    await loadAppInfo()
    if (app.value?.owner_org)
      await fetchData()
  }
  catch (error) {
    console.error('Error in refreshData:', error)
  }
  finally {
    isLoading.value = false
  }
}

watch(() => props.appId, async () => {
  await refreshData()
}, { immediate: true })

// Filter items based on the search query
const filteredElements = computed(() => {
  if (!search.value)
    return elements.value

  const searchLower = search.value.toLowerCase()
  return elements.value.filter((element) => {
    return element.principal_name?.toLowerCase().includes(searchLower)
      || element.user_email?.toLowerCase().includes(searchLower)
      || element.role_name?.toLowerCase().includes(searchLower)
      || getRoleDisplayName(element.role_name)?.toLowerCase().includes(searchLower)
  })
})

// Map role names to translated display names
function getRoleDisplayName(roleName: string): string {
  const roleMap: Record<string, string> = {
    app_developer: t('role-app-developer'),
    app_uploader: t('role-app-uploader'),
    app_reader: t('role-app-reader'),
    org_super_admin: t('role-org-super-admin'),
    org_admin: t('role-org-admin'),
    org_billing_admin: t('role-org-billing-admin'),
    org_member: t('role-org-member'),
  }
  return roleMap[roleName] || roleName
}

// Define columns
const dynamicColumns = computed<TableColumn[]>(() => {
  const baseColumns: TableColumn[] = [
    {
      key: 'principal_name',
      label: t('email'),
      sortable: true,
    },
    {
      key: 'role_name',
      label: t('role'),
      sortable: true,
      displayFunction: (row: Element) => getRoleDisplayName(row.role_name),
    },
    {
      key: 'granted_at',
      label: t('granted-at'),
      sortable: true,
      displayFunction: (row: Element) => formatDate(row.granted_at),
    },
  ]

  // Add action columns only if the user has permission
  if (canUpdateUserRoles.value) {
    baseColumns.push({
      key: 'actions',
      label: t('actions'),
      actions: [
        {
          icon: IconShield,
          onClick: (row: Element) => openChannelPermissions(row),
        },
        {
          icon: IconWrench,
          onClick: (row: Element) => changeUserRole(row),
        },
        {
          icon: IconTrash,
          onClick: (row: Element) => deleteElement(row),
        },
      ],
    })
  }

  return baseColumns
})

// Sync dynamic columns with the columns ref
watch(dynamicColumns, (newCols) => {
  columns.value = newCols
}, { immediate: true })
</script>

<template>
  <div class="flex flex-col overflow-hidden overflow-y-auto bg-white border shadow-lg md:rounded-lg dark:bg-gray-800 border-slate-300 dark:border-slate-900">
    <DataTable
      v-model:columns="columns"
      v-model:current-page="currentPage"
      v-model:search="search"
      :total="filteredElements.length"
      :show-add="false"
      :element-list="filteredElements"
      :is-loading="isLoading"
      :search-placeholder="t('search-role-bindings')"
      :auto-reload="false"
      @reload="reload()"
      @reset="refreshData()"
    />
  </div>

  <!-- Teleport for the role selection modal -->
  <Teleport
    v-if="dialogStore.showDialog && dialogStore.dialogOptions?.id === 'select-app-role'"
    defer
    to="#dialog-v2-content"
  >
    <div class="w-full">
      <div class="p-4 border rounded-lg dark:border-gray-600">
        <div class="space-y-3">
          <div v-for="option in appRoleOptions" :key="option.value" class="form-control">
            <label class="justify-start gap-3 p-3 rounded-lg cursor-pointer hover:bg-gray-50 label dark:hover:bg-gray-800">
              <input
                v-model="selectedRole"
                type="radio"
                name="app-role"
                :value="option.value"
                class="mr-2 radio radio-primary"
              >
              <span class="text-base label-text">{{ option.label }}</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport
    v-if="dialogStore.showDialog && dialogStore.dialogOptions?.id === 'channel-permissions'"
    defer
    to="#dialog-v2-content"
  >
    <div class="space-y-4">
      <div class="space-y-1">
        <div class="text-xs font-semibold tracking-wide text-gray-400 uppercase">
          {{ t('channel-permissions-principal') }}
        </div>
        <div class="text-base text-gray-900 dark:text-gray-100">
          {{ selectedPrincipal?.principal_name || '-' }}
        </div>
        <div class="text-xs text-gray-500">
          {{ t('channel-permissions-role') }}: {{ selectedPrincipal ? getRoleDisplayName(selectedPrincipal.role_name) : '-' }}
        </div>
      </div>

      <div>
        <input
          v-model="channelOverridesSearch"
          type="text"
          class="w-full d-input d-input-bordered"
          :placeholder="t('search-channels')"
        >
      </div>

      <div v-if="channelOverridesLoading" class="py-6 text-sm text-gray-500">
        {{ t('loading') }}...
      </div>

      <div v-else-if="filteredChannels.length === 0" class="py-6 text-sm text-gray-500">
        {{ t('channel-permissions-empty') }}
      </div>

      <div v-else class="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
        <table class="min-w-full text-sm">
          <thead class="bg-slate-50 dark:bg-slate-900/40">
            <tr>
              <th class="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-200">
                {{ t('channels') }}
              </th>
              <th
                v-for="perm in channelPermissionOptions"
                :key="perm.key"
                class="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-200"
              >
                {{ perm.label }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="channel in filteredChannels"
              :key="channel.id"
              class="border-t border-slate-200 dark:border-slate-700"
            >
              <td class="px-3 py-2 text-gray-900 dark:text-gray-100">
                {{ channel.name }}
              </td>
              <td
                v-for="perm in channelPermissionOptions"
                :key="perm.key"
                class="px-3 py-2"
              >
                <select
                  class="w-full d-select d-select-sm d-select-bordered"
                  :value="getSelectValue(channel.id, perm.key)"
                  :disabled="isSavingOverride(channel.id, perm.key)"
                  @change="updateChannelPermission(channel.id, perm.key, ($event.target as HTMLSelectElement).value as 'default' | 'allow' | 'deny')"
                >
                  <option value="default">
                    {{ getDefaultLabel(selectedPrincipal?.role_name || 'app_reader', perm.key) }}
                  </option>
                  <option value="allow">
                    {{ t('channel-permissions-allow') }}
                  </option>
                  <option value="deny">
                    {{ t('channel-permissions-deny') }}
                  </option>
                </select>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </Teleport>
</template>
