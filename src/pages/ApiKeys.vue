<script setup lang="ts">
import type { TableColumn } from '~/components/comp_def'
import type { Database } from '~/types/supabase.types'
import { FormKit } from '@formkit/vue'
import { VueDatePicker } from '@vuepic/vue-datepicker'
import { useDark } from '@vueuse/core'
import dayjs from 'dayjs'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import IconArrowPath from '~icons/heroicons/arrow-path'
import IconCalendar from '~icons/heroicons/calendar'
import IconClipboard from '~icons/heroicons/clipboard-document'
import IconPencil from '~icons/heroicons/pencil'
import IconTrash from '~icons/heroicons/trash'
import {
  confirmApiKeyDeletion,
  confirmApiKeyRegeneration,
  formatApiKeyScope,
  isApiKeyExpired,
  showApiKeySecretModal,
  sortApiKeyRows,
} from '~/services/apikeys'
import { formatLocalDate } from '~/services/date'
import { checkPermissions } from '~/services/permissions'
import { useSupabase } from '~/services/supabase'
import { useDialogV2Store } from '~/stores/dialogv2'
import { useDisplayStore } from '~/stores/display'
import { useMainStore } from '~/stores/main'
import { getRbacRoleI18nKey, useOrganizationStore } from '~/stores/organization'
import '@vuepic/vue-datepicker/dist/main.css'

interface Role {
  id: string
  name: string
  scope_type: string
  description: string | null
  priority_rank: number
}

interface RoleBindingRow {
  id: string
  principal_type: string
  principal_id: string
  scope_type: string
  org_id: string | null
  app_id: string | null
  role_name: string
}

const { t } = useI18n()
const isDark = useDark()
const dialogStore = useDialogV2Store()
const displayStore = useDisplayStore()
const main = useMainStore()
const currentPage = ref(1)
const isLoading = ref(false)
const supabase = useSupabase()
const keys = ref<Database['public']['Tables']['apikeys']['Row'][]>([])
const organizationStore = useOrganizationStore()
const columns: Ref<TableColumn[]> = ref<TableColumn[]>([])

// RBAC data
const roles = ref<Role[]>([])
const allBindings = ref<RoleBindingRow[]>([])

// State for change name dialog
const newApiKeyName = ref('')

// State for hashed key creation
const createAsHashed = ref(false)

// State for expiration date
const setExpirationCheckbox = ref(false)
const expirationDate = ref<Date | null>(null)

// RBAC creation state
const selectedOrgRole = ref('org_member')
const selectedOrgsForCreation = ref<string[]>([])
const manageableOrgIds = ref(new Set<string>())
const pendingAppBindings = ref<Record<string, string>>({})
const showOrgDropdown = ref(false)
const showAppDropdown = ref(false)

// Available apps for selection (populated when showing app dialog)
const availableApps = ref<{ id: string, app_id: string, name: string | null, owner_org: string }[]>([])

// Computed properties for expiration date limits
const minExpirationDate = computed(() => {
  return dayjs().add(1, 'day').toDate()
})

// Cache for organization and app names
const orgCache = ref(new Map<string, string>())
const appCache = ref(new Map<string, string>())

// Function to truncate strings (show first 5 and last 5 characters)
function hideString(str: string | null) {
  if (!str)
    return ''
  const first = str.slice(0, 5)
  const last = str.slice(-5)
  return `${first}...${last}`
}

// Check if a key is a hashed (secure) key
function isHashedKey(key: Database['public']['Tables']['apikeys']['Row']) {
  return key.key === null && key.key_hash !== null
}

function getRoleDisplayName(roleName: string): string {
  const normalized = roleName.replace(/^invite_/, '')
  const i18nKey = getRbacRoleI18nKey(normalized)
  return i18nKey ? t(i18nKey) : normalized.replaceAll('_', ' ')
}

// Get bindings for a specific key
function getBindingsForKey(key: Database['public']['Tables']['apikeys']['Row']): RoleBindingRow[] {
  return allBindings.value.filter(b => b.principal_id === key.rbac_id)
}

// Get the highest role for a key (by priority_rank)
function getHighestRole(key: Database['public']['Tables']['apikeys']['Row']): string | null {
  const keyBindings = getBindingsForKey(key)
    .filter(binding => binding.scope_type === 'org')
  if (keyBindings.length === 0)
    return null

  let highest: RoleBindingRow | null = null
  let highestRank = -1
  for (const binding of keyBindings) {
    const role = roles.value.find(r => r.name === binding.role_name)
    const rank = role?.priority_rank ?? 0
    if (rank > highestRank) {
      highestRank = rank
      highest = binding
    }
  }
  return highest?.role_name ?? null
}

function getRbacAppBindingIds(key: Database['public']['Tables']['apikeys']['Row']): string[] {
  return getBindingsForKey(key)
    .filter(b => b.scope_type === 'app' && !!b.app_id)
    .map(b => b.app_id!)
}

function getDisplayOrgIds(key: Database['public']['Tables']['apikeys']['Row']): string[] {
  const orgIds = new Set<string>()
  getBindingsForKey(key).forEach((binding) => {
    if (binding.org_id)
      orgIds.add(binding.org_id)
  })
  return Array.from(orgIds)
}

function coversAllOrganizations(orgIds: string[]): boolean {
  const allOrgIds = organizationStore.organizations.map(org => org.gid)
  return allOrgIds.length > 0 && allOrgIds.every(orgId => orgIds.includes(orgId))
}

function getDisplayAppIds(key: Database['public']['Tables']['apikeys']['Row']): string[] {
  return getRbacAppBindingIds(key)
}

function formatDisplayApps(key: Database['public']['Tables']['apikeys']['Row']) {
  return getDisplayAppIds(key).map(appId => appCache.value.get(appId) || 'Unknown').join(', ')
}

function cacheAppNames(apps: { id: string | null, app_id: string, name: string | null }[]) {
  apps.forEach((app) => {
    const displayName = app.name || app.app_id
    appCache.value.set(app.app_id, displayName)
    if (!app.id)
      return
    appCache.value.set(app.id, displayName)
  })
}

function getOrgNameById(orgId: string) {
  return orgCache.value.get(orgId) || orgId
}

const selectedOrgNamesForCreation = computed(() => {
  const orgById = new Map(organizationStore.organizations.map(org => [org.gid, org.name]))
  return selectedOrgsForCreation.value
    .map(orgId => orgById.get(orgId) || getOrgNameById(orgId))
    .join(', ')
})

// Computed property to get unique organization IDs from all API keys
const uniqueOrgIds = computed(() => {
  if (!keys.value)
    return new Set<string>()

  const orgIds = new Set<string>()
  allBindings.value.forEach((b) => {
    if (b.org_id)
      orgIds.add(b.org_id)
  })

  return orgIds
})

// Computed property to get unique app IDs from all API keys
const uniqueAppIds = computed(() => {
  if (!keys.value)
    return new Set<string>()

  const appIds = new Set<string>()
  allBindings.value.forEach((binding) => {
    if (binding.scope_type === 'app' && binding.app_id)
      appIds.add(binding.app_id)
  })

  return appIds
})

// Helper computed property to get organization name by ID
const getOrgName = computed(() => {
  return (orgId: string) => orgCache.value.get(orgId) || 'Unknown'
})

// Function to fetch organization and app names in parallel
async function fetchOrgAndAppNames() {
  if (!keys.value)
    return

  // Collect unique organization and app IDs that aren't already cached
  const uncachedOrgIds = Array.from(uniqueOrgIds.value).filter(id => !orgCache.value.has(id))
  const uncachedAppIds = Array.from(uniqueAppIds.value).filter(id => !appCache.value.has(id))

  // Fetch organization names in parallel
  if (uncachedOrgIds.length > 0) {
    const orgPromises = uncachedOrgIds.map(async (orgId) => {
      try {
        const { data, error } = await supabase
          .from('orgs')
          .select('id, name')
          .eq('id', orgId)
          .single()

        if (error)
          throw error
        if (data)
          orgCache.value.set(orgId, data.name)
        return { id: orgId, name: data?.name }
      }
      catch (err) {
        console.error(`Error fetching org name for ${orgId}:`, err)
        return { id: orgId, name: 'Unknown' }
      }
    })

    await Promise.all(orgPromises)
  }

  if (uncachedAppIds.length > 0) {
    try {
      const { data, error } = await supabase
        .from('apps')
        .select('id, app_id, name')
        .in('id', uncachedAppIds)

      if (error)
        throw error
      cacheAppNames(data || [])
    }
    catch (err) {
      console.error('Error fetching app names by RBAC app ids:', err)
    }
  }
}

const searchQuery = ref('')

const filteredAndSortedKeys = computed(() => {
  let result = keys.value ?? []

  // Filter first
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(key =>
      key.name?.toLowerCase().includes(query)
      || key.key?.toLowerCase().includes(query),
    )
  }

  // Then sort based on column state
  return columns.value.length ? sortApiKeyRows(result, columns.value) : result
})

// Org role options for creation modal
const unsupportedApiKeyOrgRoles = new Set(['org_billing_admin'])
const orgRoles = computed(() => roles.value.filter(r => r.scope_type === 'org' && !unsupportedApiKeyOrgRoles.has(r.name)))
const appRoles = computed(() => roles.value.filter(r => r.scope_type === 'app'))

const legacyOrgRoleAliases: Record<string, string> = {
  owner: 'org_super_admin',
  super_admin: 'org_super_admin',
  admin: 'org_admin',
  write: 'org_member',
  upload: 'org_member',
  read: 'org_member',
}

function normalizeOrgRoleName(roleName: string) {
  const normalized = roleName.replace(/^invite_/, '')
  return legacyOrgRoleAliases[normalized] ?? normalized
}

function getRolePriority(roleName?: string | null) {
  if (!roleName)
    return 0
  return roles.value.find(r => r.name === normalizeOrgRoleName(roleName))?.priority_rank ?? 0
}

const callerOrgPriorityByOrgId = computed(() => new Map(
  organizationStore.organizations.map(org => [org.gid, getRolePriority(org.role)]),
))

const selectedOrgMinimumPriority = computed(() => {
  const selectedManageableOrgIds = selectedOrgsForCreation.value.filter(orgId => manageableOrgIds.value.has(orgId))
  if (selectedManageableOrgIds.length === 0)
    return 0
  return Math.min(...selectedManageableOrgIds.map(orgId => callerOrgPriorityByOrgId.value.get(orgId) ?? 0))
})

const orgRoleOptions = computed(() =>
  orgRoles.value
    .filter(r => r.name !== 'org_super_admin' && r.priority_rank <= selectedOrgMinimumPriority.value)
    .map(r => ({ id: r.id, name: r.name, description: getRoleDisplayName(r.name) })),
)

const appRoleOptions = computed(() =>
  appRoles.value.map(r => ({ id: r.id, name: r.name, description: getRoleDisplayName(r.name) })),
)

const rolesWithInheritedAppAccess = new Set(['org_admin', 'org_super_admin'])
const showAppAccessInModal = computed(() =>
  !!selectedOrgRole.value && !rolesWithInheritedAppAccess.has(selectedOrgRole.value),
)

// Filtered apps based on selected orgs for creation
const filteredAppsForSelectedOrgs = computed(() => {
  if (!availableApps.value || selectedOrgsForCreation.value.length === 0)
    return []
  return availableApps.value.filter(app =>
    selectedOrgsForCreation.value.includes(app.owner_org),
  )
})

// Prune app bindings when orgs change
function pruneAppBindings() {
  const allowedAppIds = new Set(
    filteredAppsForSelectedOrgs.value.map(app => app.id),
  )
  const updated = { ...pendingAppBindings.value }
  for (const appId of Object.keys(updated)) {
    if (!allowedAppIds.has(appId))
      delete updated[appId]
  }
  pendingAppBindings.value = updated
}

function ensureSelectedOrgRoleAllowed() {
  if (orgRoleOptions.value.some(role => role.name === selectedOrgRole.value))
    return

  selectedOrgRole.value = orgRoleOptions.value.find(role => role.name === 'org_member')?.name ?? orgRoleOptions.value[0]?.name ?? ''
}

const selectedAppIds = computed(() => Object.keys(pendingAppBindings.value))

columns.value = [
  {
    key: 'name',
    label: t('name'),
    head: true,
    mobile: true,
    sortable: true,
  },
  {
    key: 'key',
    label: t('api-key'),
    head: true,
    displayFunction: (row: Database['public']['Tables']['apikeys']['Row']) => {
      if (isHashedKey(row)) {
        return t('secure-key-hidden')
      }
      return hideString(row.key)
    },
  },
  {
    key: 'role',
    label: t('role'),
    displayFunction: (row: Database['public']['Tables']['apikeys']['Row']) => {
      const highest = getHighestRole(row)
      if (!highest)
        return '-'
      return getRoleDisplayName(highest)
    },
  },
  {
    key: 'org_scope',
    label: t('organizations'),
    displayFunction: (row: Database['public']['Tables']['apikeys']['Row']) => {
      const orgIds = getDisplayOrgIds(row)
      if (coversAllOrganizations(orgIds))
        return '*'
      return formatApiKeyScope(orgIds, orgId => getOrgName.value(orgId))
    },
  },
  {
    key: 'app_scope',
    label: t('apps'),
    displayFunction: (row: Database['public']['Tables']['apikeys']['Row']) => {
      return formatDisplayApps(row)
    },
  },
  {
    key: 'created_at',
    label: t('created'),
    sortable: true,
    displayFunction: (row: Database['public']['Tables']['apikeys']['Row']) => {
      return formatLocalDate(row.created_at)
    },
  },
  {
    key: 'expires_at',
    label: t('expires'),
    sortable: true,
    displayFunction: (row: Database['public']['Tables']['apikeys']['Row']) => {
      if (!row.expires_at)
        return t('never')

      const expired = isApiKeyExpired(row.expires_at)
      const dateStr = formatLocalDate(row.expires_at)
      return expired ? `${dateStr} (${t('expired')})` : dateStr
    },
  },
  {
    key: 'actions',
    label: t('actions'),
    mobile: true,
    actions: [
      {
        icon: IconClipboard,
        title: t('copy'),
        onClick: (key: Database['public']['Tables']['apikeys']['Row']) => copyKey(key),
      },
      {
        icon: IconPencil,
        title: t('edit'),
        onClick: (key: Database['public']['Tables']['apikeys']['Row']) => changeName(key),
      },
      {
        icon: IconArrowPath,
        title: t('button-regenerate'),
        onClick: (key: Database['public']['Tables']['apikeys']['Row']) => regenrateKey(key),
      },
      {
        icon: IconTrash,
        title: t('delete'),
        onClick: (key: Database['public']['Tables']['apikeys']['Row']) => deleteKey(key),
        testId: (key: Database['public']['Tables']['apikeys']['Row']) => `delete-key-${key.id}`,
      },
    ],
  },
]

async function refreshData() {
  try {
    currentPage.value = 1
    keys.value.length = 0
    await getKeys()
  }
  catch (error) {
    console.error(error)
  }
}

async function getKeys(retry = true): Promise<void> {
  isLoading.value = true
  const { data } = await supabase
    .from('apikeys')
    .select()
    .eq('user_id', main.user?.id ?? '')
    .order('created_at', { ascending: false })
  if (data) {
    keys.value = data
    if (data.length > 0) {
      await Promise.all([fetchAllBindings(), fetchRoles()])
      await fetchOrgAndAppNames()
    }
    else {
      allBindings.value = []
    }
  }
  else if (retry && main.user?.id) {
    return getKeys(false)
  }

  isLoading.value = false
}

async function fetchRoles() {
  const { data, error } = await supabase
    .from('roles')
    .select('id, name, scope_type, description, priority_rank')
    .eq('is_assignable', true)
    .in('scope_type', ['org', 'app'])
    .order('priority_rank', { ascending: false })
  if (error) {
    console.error('Error fetching roles:', error)
    return
  }
  roles.value = (data || []) as Role[]
}

async function fetchAllBindings() {
  if (!keys.value || keys.value.length === 0) {
    allBindings.value = []
    return
  }

  const rbacIds = keys.value.map(k => k.rbac_id).filter(Boolean)
  if (rbacIds.length === 0) {
    allBindings.value = []
    return
  }

  const { data, error } = await supabase
    .from('role_bindings')
    .select('id, principal_type, principal_id, scope_type, org_id, app_id, role_id, roles(name)')
    .eq('principal_type', 'apikey')
    .in('principal_id', rbacIds)

  if (error) {
    console.error('Error fetching role bindings:', error)
    allBindings.value = []
    return
  }

  allBindings.value = ((data || []) as any[]).map(row => ({
    id: row.id,
    principal_type: row.principal_type,
    principal_id: row.principal_id,
    scope_type: row.scope_type,
    org_id: row.org_id,
    app_id: row.app_id,
    role_name: row.roles?.name || '',
  }))
}

async function loadAllApps() {
  try {
    const orgIds = organizationStore.organizations.map(org => org.gid)
    if (orgIds.length === 0) {
      availableApps.value = []
      return
    }
    const { data: apps, error } = await supabase
      .from('apps')
      .select('id, app_id, name, owner_org')
      .in('owner_org', orgIds)
      .order('name', { ascending: true })
    if (error) {
      console.error('Cannot load apps:', error)
      return
    }
    availableApps.value = (apps || []).filter((app): app is { id: string, app_id: string, name: string | null, owner_org: string } =>
      !!app.id && !!app.app_id,
    )
    cacheAppNames(availableApps.value)
  }
  catch (err) {
    console.error('Error loading apps:', err)
  }
}

async function loadManageableOrganizations() {
  const checks = await Promise.all(organizationStore.organizations.map(async (org) => {
    const canManage = await checkPermissions('org.update_user_roles', { orgId: org.gid })
    return canManage ? org.gid : null
  }))
  manageableOrgIds.value = new Set(checks.filter((orgId): orgId is string => !!orgId))
}

async function createApiKey() {
  const isHashed = createAsHashed.value

  if (selectedOrgsForCreation.value.length === 0) {
    toast.error(t('alert-no-org-selected'))
    return false
  }

  if (!selectedOrgRole.value) {
    toast.error(t('select-at-least-one-role'))
    return false
  }

  if (hasIncompleteAppBindings()) {
    toast.error(t('select-role-for-each-app'))
    return false
  }

  // Get expiration date if set
  let expiresAt: string | null = null
  if (setExpirationCheckbox.value && expirationDate.value) {
    expiresAt = dayjs(expirationDate.value).toISOString()
  }

  try {
    const { data: claimsData } = await supabase.auth.getClaims()
    const userId = claimsData?.claims?.sub

    if (!userId) {
      console.log('Not logged in, cannot create API key')
      toast.error('Not logged in')
      return false
    }

    // Build bindings array for all selected orgs
    const bindings: Array<{
      role_name: string
      scope_type: 'org' | 'app'
      org_id: string
      app_id?: string
    }> = []

    for (const orgId of selectedOrgsForCreation.value) {
      bindings.push({
        role_name: selectedOrgRole.value,
        scope_type: 'org',
        org_id: orgId,
      })
    }

    // Add app-level bindings
    for (const [appId, roleName] of Object.entries(pendingAppBindings.value)) {
      if (!roleName)
        continue
      // Find the app to get its owner_org
      const app = availableApps.value.find(a => a.id === appId)
      if (!app)
        continue
      bindings.push({
        role_name: roleName,
        scope_type: 'app',
        org_id: app.owner_org,
        app_id: appId,
      })
    }

    let plainKeyForDisplay: string | null = null

    const { data, error } = await supabase.functions.invoke('apikey', {
      method: 'POST',
      body: {
        name: newApiKeyName.value.trim(),
        expires_at: expiresAt,
        hashed: isHashed,
        bindings,
      },
    })

    if (error || !data) {
      console.error('Error creating API key:', error)
      toast.error(await getUserFacingErrorMessage(error, t('failed-to-create-api-key')))
      return false
    }

    const createdKey = data
    if (isHashed)
      plainKeyForDisplay = typeof data.key === 'string' ? data.key : null

    // For hashed keys, clear the key field before adding to the list
    if (isHashed) {
      createdKey.key = null as any
    }
    keys.value?.unshift(createdKey)
    await fetchAllBindings()
    await fetchOrgAndAppNames()

    // For hashed keys, show the key one time in a modal
    if (isHashed && plainKeyForDisplay) {
      await showOneTimeKeyModal(plainKeyForDisplay)
    }

    toast.success(t('add-api-key'))
    return true
  }
  catch (error) {
    console.error('Error creating API key:', error)
    toast.error(await getUserFacingErrorMessage(error, t('failed-to-create-api-key')))
    return false
  }
}

async function showOneTimeKeyModal(plainKey: string) {
  return showApiKeySecretModal(dialogStore, t, plainKey, () => {
    toast.success(t('key-copied'))
  })
}

async function addNewApiKey() {
  // Clear state
  newApiKeyName.value = ''
  createAsHashed.value = false
  setExpirationCheckbox.value = false
  expirationDate.value = null
  selectedOrgRole.value = 'org_member'
  pendingAppBindings.value = {}
  showOrgDropdown.value = false
  showAppDropdown.value = false

  await Promise.all([loadAllApps(), fetchRoles(), loadManageableOrganizations()])

  // Select all organizations that can receive RBAC bindings from this caller.
  selectedOrgsForCreation.value = organizationStore.organizations
    .map(org => org.gid)
    .filter(orgId => manageableOrgIds.value.has(orgId))
  ensureSelectedOrgRoleAllowed()

  // Show creation modal
  await showAddNewKeyModal()
}

async function regenrateKey(apikey: Database['public']['Tables']['apikeys']['Row']) {
  if (!await confirmApiKeyRegeneration(dialogStore, t))
    return

  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub

  if (!userId) {
    console.log('Not logged in, cannot regenerate API key')
    return
  }

  const wasHashed = isHashedKey(apikey)

  const { data, error } = await supabase.functions.invoke('apikey', {
    method: 'PUT',
    body: {
      id: apikey.id,
      regenerate: true,
    },
  })

  if (error || !data) {
    console.error('Error regenerating API key:', error)
    toast.error(t('failed-to-regenerate-api-key'))
    return
  }

  const plainKeyForDisplay = typeof data.key === 'string' ? data.key : undefined

  if (wasHashed)
    data.key = null as any

  const idx = keys.value.findIndex(k => k.id === apikey.id)
  if (idx !== -1)
    keys.value[idx] = data

  if (plainKeyForDisplay)
    await showOneTimeKeyModal(plainKeyForDisplay)

  toast.success(t('generated-new-apikey'))
}

async function deleteKey(key: Database['public']['Tables']['apikeys']['Row']) {
  if (!await confirmApiKeyDeletion(dialogStore, t))
    return

  const { error } = await supabase
    .from('apikeys')
    .delete()
    .eq('id', key.id)

  if (error)
    throw error

  toast.success(t('removed-apikey'))
  keys.value = keys.value?.filter(filterKey => filterKey.id !== key.id)
}

async function changeName(key: Database['public']['Tables']['apikeys']['Row']) {
  const currentName = key.name || ''
  newApiKeyName.value = currentName

  dialogStore.openDialog({
    title: t('change-api-key-name'),
    description: t('type-new-name'),
    size: 'lg',
    buttons: [
      {
        text: t('cancel'),
        role: 'cancel',
      },
      {
        text: t('button-confirm'),
        role: 'primary',
        handler: async () => {
          const newName = newApiKeyName.value.trim()
          if (currentName === newName) {
            toast.error(t('new-name-not-changed'))
            return false
          }

          if (newName.length > 32) {
            toast.error(t('new-name-to-long'))
            return false
          }

          if (newName.length < 4) {
            toast.error(t('new-name-to-short'))
            return false
          }

          const { error } = await supabase.from('apikeys')
            .update({ name: newName })
            .eq('id', key.id)

          if (error) {
            toast.error(t('cannot-change-name'))
            console.error(error)
            return false
          }

          toast.success(t('changed-name'))
          keys.value = keys.value?.map((k) => {
            if (key.id === k.id)
              k.name = newName
            return k
          })
        },
      },
    ],
  })
  return dialogStore.onDialogDismiss()
}

async function showAddNewKeyModal() {
  dialogStore.openDialog({
    title: t('alert-add-new-key'),
    description: t('alert-generate-new-key'),
    size: '3xl',
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('create'),
        role: 'primary',
        handler: () => {
          return createApiKey()
        },
      },
    ],
  })
  return dialogStore.onDialogDismiss()
}

function toggleOrgSelection(orgId: string) {
  if (!manageableOrgIds.value.has(orgId))
    return

  if (selectedOrgsForCreation.value.includes(orgId)) {
    selectedOrgsForCreation.value = selectedOrgsForCreation.value.filter(id => id !== orgId)
    return
  }

  selectedOrgsForCreation.value = [...selectedOrgsForCreation.value, orgId]
}

function toggleApp(appId: string) {
  if (appId in pendingAppBindings.value) {
    const updated = { ...pendingAppBindings.value }
    delete updated[appId]
    pendingAppBindings.value = updated
  }
  else {
    pendingAppBindings.value = { ...pendingAppBindings.value, [appId]: '' }
  }
}

function onAppRoleChange(appId: string, event: Event) {
  pendingAppBindings.value = { ...pendingAppBindings.value, [appId]: (event.target as HTMLSelectElement).value }
}

function hasIncompleteAppBindings() {
  return Object.values(pendingAppBindings.value).some(roleName => !roleName)
}

function getAppNameById(appId: string) {
  const app = availableApps.value.find(a => a.id === appId)
  return app ? (app.name || app.app_id) : appId
}

function getAppOrgNameById(appId: string) {
  const app = availableApps.value.find(a => a.id === appId)
  return app?.owner_org ? getOrgNameById(app.owner_org) : ''
}

async function getUserFacingErrorMessage(error: unknown, fallbackMessage: string) {
  if (error && typeof error === 'object' && 'context' in error && error.context instanceof Response) {
    try {
      const payload = await error.context.clone().json() as { message?: string, error?: string, error_description?: string }
      if (typeof payload.message === 'string' && payload.message)
        return payload.message
      if (typeof payload.error_description === 'string' && payload.error_description)
        return payload.error_description
      if (typeof payload.error === 'string' && payload.error)
        return payload.error
    }
    catch {
    }
  }

  if (error instanceof Error && error.message)
    return error.message

  return fallbackMessage
}

async function copyKey(apikey: Database['public']['Tables']['apikeys']['Row']) {
  // Cannot copy hashed keys - they are never stored in plain text
  if (isHashedKey(apikey)) {
    toast.error(t('cannot-copy-secure-key'))
    return
  }

  try {
    await navigator.clipboard.writeText(apikey.key!)
    toast.success(t('key-copied'))
  }
  catch (err) {
    console.error('Failed to copy: ', err)
    dialogStore.openDialog({
      title: t('cannot-copy-key'),
      description: apikey.key!,
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

// Watch for org selection changes to prune app bindings
watch(selectedOrgsForCreation, () => {
  pruneAppBindings()
  ensureSelectedOrgRoleAllowed()
}, { deep: true })

watch(orgRoleOptions, () => {
  ensureSelectedOrgRoleAllowed()
})

// Watch for org role changes - clear app bindings if role grants inherited access
watch(selectedOrgRole, (newRole) => {
  if (rolesWithInheritedAppAccess.has(newRole)) {
    pendingAppBindings.value = {}
  }
})

displayStore.NavTitle = t('api-keys')
displayStore.defaultBack = '/apps'
getKeys()
</script>

<template>
  <div>
    <div class="h-full pb-4 overflow-hidden">
      <div class="w-full h-full px-0 pt-0 mx-auto mb-8 overflow-y-auto sm:px-6 md:pt-8 lg:px-8 max-w-9xl max-h-fit">
        <div class="flex flex-col">
          <div class="flex flex-col overflow-hidden overflow-y-auto bg-white md:mt-5 md:rounded-lg md:border md:shadow-lg border-slate-300 dark:border-slate-900 dark:bg-slate-800">
            <DataTable
              v-model:current-page="currentPage"
              add-button-test-id="create-key"
              show-add
              :auto-reload="false"
              :columns="columns"
              :element-list="filteredAndSortedKeys"
              :is-loading="isLoading"
              :total="filteredAndSortedKeys.length"
              :search-placeholder="t('search-api-keys')"
              :search="searchQuery"
              @add="addNewApiKey"
              @update:search="searchQuery = $event"
              @reload="getKeys()"
              @reset="refreshData()"
            />
          </div>
          <p class="mt-6 ml-4">
            {{ t('api-keys-are-used-for-cli-and-public-api') }}
          </p>
          <div class="mb-2 ml-4">
            <a
              class="inline-flex items-center text-blue-500 underline rounded-sm focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:outline-none"
              href="https://capgo.app/docs/cli/reference/key/"
              target="_blank"
              rel="noopener noreferrer"
              :aria-label="`${t('cli-doc')} (opens in new tab)`"
            >
              {{ t('cli-doc') }}
              <svg class="w-3 h-3 ml-1" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path fill-rule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clip-rule="evenodd" />
                <path fill-rule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clip-rule="evenodd" />
              </svg>
            </a>
            <a
              class="inline-flex items-center ml-1 text-blue-500 underline rounded-sm focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:outline-none"
              href="https://capgo.app/docs/public-api/api-keys/"
              target="_blank"
              rel="noopener noreferrer"
              :aria-label="`${t('api-doc')} (opens in new tab)`"
            >
              {{ t('api-doc') }}
              <svg class="w-3 h-3 ml-1" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path fill-rule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clip-rule="evenodd" />
                <path fill-rule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clip-rule="evenodd" />
              </svg>
            </a>
          </div>
        </div>
      </div>

      <!-- Teleport Content for Add New Key Modal -->
      <Teleport v-if="dialogStore.showDialog && dialogStore.dialogOptions?.title === t('alert-add-new-key')" defer to="#dialog-v2-content">
        <div class="space-y-6">
          <!-- API Key Name -->
          <div>
            <FormKit
              v-model="newApiKeyName"
              type="text"
              :label="t('name')"
              :placeholder="t('type-new-name')"
              validation="required|length:1,32"
              :validation-messages="{
                length: t('name-length-error'),
              }"
            />
          </div>

          <!-- Create as Secure (Hashed) Key -->
          <div class="p-4 border border-blue-200 rounded-lg bg-blue-50 dark:bg-blue-900/20 dark:border-blue-700">
            <div class="flex items-start gap-3">
              <input
                id="create-as-hashed"
                v-model="createAsHashed"
                type="checkbox"
                class="mt-1 border-blue-500 dark:border-blue-400 checkbox checkbox-primary"
              >
              <div>
                <label for="create-as-hashed" class="font-medium text-blue-800 cursor-pointer dark:text-blue-200">
                  {{ t('create-secure-key') }}
                </label>
                <p class="mt-1 text-sm text-blue-600 dark:text-blue-300">
                  {{ t('create-secure-key-description') }}
                </p>
              </div>
            </div>
          </div>

          <!-- Organizations Selection (all checked by default) -->
          <div>
            <h3 class="mb-2 text-sm font-semibold uppercase text-slate-500">
              {{ t('organizations') }}
            </h3>
            <div class="relative">
              <button
                type="button"
                data-test="create-key-org-dropdown"
                class="flex items-center justify-between w-full gap-3 px-3 py-2 text-sm text-left bg-white border rounded-lg border-slate-300 dark:bg-gray-800 dark:border-slate-600 focus:ring-2 focus:ring-primary-500 focus:outline-none"
                :aria-expanded="showOrgDropdown"
                @click="showOrgDropdown = !showOrgDropdown"
              >
                <span class="flex-1 truncate" :class="selectedOrgsForCreation.length ? 'text-slate-800 dark:text-white' : 'text-slate-500'">
                  {{ selectedOrgNamesForCreation || t('select-organization') }}
                </span>
                <svg class="w-4 h-4 text-slate-500 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
                </svg>
              </button>
              <div v-if="showOrgDropdown" class="fixed inset-0 z-10" @click="showOrgDropdown = false" />
              <div
                v-if="showOrgDropdown"
                class="absolute z-20 w-full mt-1 overflow-y-auto bg-white border rounded-lg shadow-lg top-full dark:bg-gray-800 border-slate-200 dark:border-slate-700 max-h-64"
              >
                <label
                  v-for="org in organizationStore.organizations"
                  :key="org.gid"
                  class="flex items-center gap-3 px-4 py-2.5 transition-colors"
                  :class="manageableOrgIds.has(org.gid) ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700' : 'cursor-not-allowed text-slate-400'"
                >
                  <input
                    type="checkbox"
                    data-test="create-key-org-checkbox"
                    :data-org-id="org.gid"
                    class="d-checkbox d-checkbox-sm d-checkbox-primary"
                    :checked="selectedOrgsForCreation.includes(org.gid)"
                    :disabled="!manageableOrgIds.has(org.gid)"
                    @change="toggleOrgSelection(org.gid)"
                  >
                  <span class="flex-1 text-sm truncate">
                    {{ org.name }}
                    <span v-if="!manageableOrgIds.has(org.gid)" class="text-xs text-slate-400">
                      ({{ t('cannot-manage-org-api-keys') }})
                    </span>
                  </span>
                </label>
              </div>
            </div>
          </div>

          <!-- Organization Role -->
          <div>
            <h3 class="mb-2 text-sm font-semibold uppercase text-slate-500">
              {{ t('role') }}
            </h3>
            <p class="mb-3 text-sm text-slate-500">
              {{ t('select-user-role') }}
            </p>
            <div class="space-y-2">
              <label
                v-for="role in orgRoleOptions"
                :key="role.id"
                class="flex items-center gap-3 cursor-pointer"
              >
                <input
                  v-model="selectedOrgRole"
                  type="radio"
                  :data-test="`create-key-org-role-${role.name}`"
                  class="d-radio d-radio-primary d-radio-sm"
                  name="create-org-role"
                  :value="role.name"
                >
                <span class="text-sm font-medium dark:text-white text-slate-800">{{ role.description }}</span>
              </label>
            </div>
          </div>

          <!-- App Access Control (only when role is not admin) -->
          <div v-if="showAppAccessInModal && selectedOrgsForCreation.length > 0">
            <h3 class="mb-2 text-sm font-semibold uppercase text-slate-500">
              {{ t('app-access-control') }}
            </h3>
            <p class="mb-3 text-sm text-slate-500">
              {{ t('app-access-member-only') }}
            </p>

            <!-- Add app dropdown -->
            <div class="flex justify-end mb-4">
              <div class="relative">
                <button
                  data-test="create-key-add-app"
                  class="gap-2 d-btn d-btn-sm d-btn-outline"
                  type="button"
                  @click="showAppDropdown = !showAppDropdown"
                >
                  <svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                  </svg>
                  {{ t('add-app') }}
                </button>
                <div v-if="showAppDropdown" class="fixed inset-0 z-10" @click="showAppDropdown = false" />
                <div
                  v-if="showAppDropdown"
                  class="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-gray-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg min-w-[240px] max-h-60 overflow-y-auto"
                >
                  <div v-if="filteredAppsForSelectedOrgs.length === 0" class="px-4 py-3 text-sm text-slate-500">
                    {{ t('no-apps') }}
                  </div>
                  <label
                    v-for="app in filteredAppsForSelectedOrgs"
                    :key="app.id"
                    class="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                  >
                    <input
                      type="checkbox"
                      data-test="create-key-app-checkbox"
                      :data-app-id="app.id"
                      class="d-checkbox d-checkbox-sm d-checkbox-primary"
                      :checked="app.id in pendingAppBindings"
                      @change="toggleApp(app.id)"
                    >
                    <div>
                      <div class="text-sm font-medium dark:text-white text-slate-800">
                        {{ app.name || app.app_id }}
                      </div>
                      <div v-if="app.name" class="text-xs text-slate-500">
                        {{ app.app_id }}
                      </div>
                      <div class="text-xs text-slate-500">
                        {{ getOrgNameById(app.owner_org) }}
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            <!-- Selected apps with role selection -->
            <div v-if="selectedAppIds.length === 0" class="py-4 text-sm text-slate-500">
              {{ t('app-access-none') }}
            </div>
            <div v-else class="overflow-hidden border rounded-lg border-slate-200 dark:border-slate-700">
              <div
                v-for="appId in selectedAppIds"
                :key="appId"
                data-test="create-key-selected-app"
                class="flex items-center gap-4 px-4 py-2.5 border-b last:border-0 border-slate-100 dark:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-700/20"
              >
                <span class="flex-1 text-sm font-medium truncate dark:text-white text-slate-800">
                  {{ getAppNameById(appId) }}
                  <span v-if="getAppOrgNameById(appId)" class="block text-xs font-normal text-slate-500">
                    {{ getAppOrgNameById(appId) }}
                  </span>
                </span>
                <select
                  data-test="create-key-app-role-select"
                  class="d-select d-select-sm d-select-bordered"
                  :value="pendingAppBindings[appId] || ''"
                  @change="onAppRoleChange(appId, $event)"
                >
                  <option value="">
                    {{ t('select-role') }}
                  </option>
                  <option v-for="role in appRoleOptions" :key="role.id" :value="role.name">
                    {{ role.description }}
                  </option>
                </select>
                <button
                  class="text-red-500 d-btn d-btn-xs d-btn-ghost shrink-0"
                  type="button"
                  @click="toggleApp(appId)"
                >
                  <IconTrash class="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <!-- Set Expiration Date -->
          <div class="flex items-center gap-2">
            <input
              id="set-expiration"
              v-model="setExpirationCheckbox"
              type="checkbox"
              class="border-gray-500 dark:border-gray-700 checkbox"
            >
            <label for="set-expiration" class="text-sm">
              {{ t('set-expiration-date') }}
            </label>
          </div>
          <div v-if="setExpirationCheckbox" class="pl-6">
            <label class="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
              {{ t('expiration-date') }}
            </label>
            <VueDatePicker
              v-model="expirationDate"
              :min-date="minExpirationDate"
              :enable-time-picker="false"
              :time-picker-inline="false"
              :time-picker="false"
              :time-config="{ enableTimePicker: false }"
              :dark="isDark"
              teleport="body"
              :auto-apply="true"
              hide-input-icon
              :action-row="{ showCancel: false, showSelect: false, showNow: false, showPreview: false }"
              :placeholder="t('select-expiration-date')"
              :ui="{ menu: 'apikey-datepicker-menu' }"
            >
              <template #trigger>
                <button
                  type="button"
                  class="flex items-center w-full gap-2 px-3 py-2 text-sm text-left transition-colors bg-white border border-gray-300 rounded-md dark:text-white dark:bg-gray-800 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 focus:ring-2 focus:ring-primary-500 focus:outline-none"
                >
                  <IconCalendar class="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  <span :class="expirationDate ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'">
                    {{ expirationDate ? dayjs(expirationDate).format('YYYY-MM-DD') : t('select-expiration-date') }}
                  </span>
                </button>
              </template>
            </VueDatePicker>
          </div>
        </div>
      </Teleport>

      <!-- Teleport Content for Change Name Modal -->
      <Teleport v-if="dialogStore.showDialog && dialogStore.dialogOptions?.title === t('change-api-key-name')" defer to="#dialog-v2-content">
        <div class="space-y-4">
          <FormKit
            v-model="newApiKeyName"
            type="text"
            :label="t('name')"
            :placeholder="t('type-new-name')"
            validation="required|length:1,32"
            :validation-messages="{
              required: t('name-required'),
              length: t('name-length-error'),
            }"
          />
        </div>
      </Teleport>
    </div>
  </div>
</template>

<route lang="yaml">
path: /apikeys
</route>
