<script setup lang="ts">
import { VueDatePicker } from '@vuepic/vue-datepicker'
import { computedAsync, useDark } from '@vueuse/core'
import dayjs from 'dayjs'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import IconCalendar from '~icons/heroicons/calendar'
import IconClipboard from '~icons/heroicons/clipboard-document'
import IconTrash from '~icons/heroicons/trash'
import { checkPermissions } from '~/services/permissions'
import { useSupabase } from '~/services/supabase'
import { useDialogV2Store } from '~/stores/dialogv2'
import { useDisplayStore } from '~/stores/display'
import { getRbacRoleI18nKey, useOrganizationStore } from '~/stores/organization'
import '@vuepic/vue-datepicker/dist/main.css'

interface OrgApiKey {
  id: number
  rbac_id: string
  name: string
  mode: string
  limited_to_orgs: string[] | null
  limited_to_apps: string[] | null
  user_id: string
  owner_email: string
  created_at: string | null
  expires_at: string | null
}

interface Role {
  id: string
  name: string
  scope_type: string
  description: string | null
  priority_rank: number
}

interface RoleBinding {
  id: string
  principal_type: string
  principal_id: string
  role_name: string
  scope_type: string
  app_id: string | null
}

interface OrgApp {
  id: string
  app_id: string
  name: string | null
}

interface CreatedApiKeyResult {
  id: number | string | null
  key: string | null
  rbacId: string
}

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const isDark = useDark()
const supabase = useSupabase()
const dialogStore = useDialogV2Store()
const organizationStore = useOrganizationStore()
const { currentOrganization } = storeToRefs(organizationStore)
const displayStore = useDisplayStore()

const rbacId = computed(() => (route.params as { id: string }).id)
const isCreateMode = computed(() => rbacId.value === 'new')
const resolvedUseNewRbac = ref(false)

const canShow = computed(() =>
  resolvedUseNewRbac.value && !!currentOrganization.value?.gid,
)

const isPermissionLoading = ref(false)
const isOrgLoading = ref(true)
const canManage = computedAsync(async () => {
  if (!currentOrganization.value?.gid)
    return false
  return await checkPermissions('org.update_user_roles', { orgId: currentOrganization.value.gid })
}, false, { evaluating: isPermissionLoading })

const isLoading = ref(false)
const isSubmitting = ref(false)
const showAppDropdown = ref(false)
const createdPlainKey = ref('')
const createdKeyDialogMode = ref<'success' | 'partial-failure-plain' | 'partial-failure-hashed'>('success')

// Key data
const apiKey = ref<OrgApiKey | null>(null)
const editName = ref('')
const createAsHashed = ref(false)
const setExpiration = ref(false)
const expirationDate = ref<Date | null>(null)

// RBAC
const roles = ref<Role[]>([])
const roleBindings = ref<RoleBinding[]>([])
const apps = ref<OrgApp[]>([])
const selectedOrgRole = ref('')
const originalUnsupportedOrgRole = ref('')
const pendingAppBindings = ref<Record<string, string>>({})
const unsupportedApiKeyOrgRoles = new Set(['org_billing_admin'])

const minExpirationDate = computed(() => dayjs().add(1, 'day').toDate())
const callerOrgPriorityRank = computed(() => {
  const orgId = currentOrganization.value?.gid
  if (!orgId)
    return 0

  if (organizationStore.hasPermissionsInRole('super_admin', ['org_super_admin'], orgId))
    return Number.POSITIVE_INFINITY

  const currentRoleName = currentOrganization.value?.role
  const currentRole = roles.value.find(role => role.scope_type === 'org' && role.name === currentRoleName)
  return currentRole?.priority_rank ?? 0
})

const orgRoles = computed(() => roles.value.filter(r => r.scope_type === 'org' && !unsupportedApiKeyOrgRoles.has(r.name)))
const appRoles = computed(() => roles.value.filter(r => r.scope_type === 'app'))

const appById = computed(() => new Map(apps.value.map(app => [app.id, app])))

const keyBindings = computed(() =>
  roleBindings.value.filter(b => b.principal_type === 'apikey' && b.principal_id === rbacId.value),
)

const keyOrgBinding = computed(() =>
  keyBindings.value.find(b => b.scope_type === 'org'),
)

const keyAppBindings = computed(() =>
  keyBindings.value.filter(b => b.scope_type === 'app' && !!b.app_id),
)

const orgRoleOptions = computed(() =>
  orgRoles.value
    .filter(r => r.name !== 'org_super_admin')
    .filter(r => r.priority_rank <= callerOrgPriorityRank.value)
    .map(r => ({ id: r.id, name: r.name, description: getRoleDisplayName(r.name) })),
)

const appRoleOptions = computed(() =>
  appRoles.value.map(r => ({ id: r.id, name: r.name, description: getRoleDisplayName(r.name) })),
)

const rolesWithInheritedAppAccess = new Set(['org_admin', 'org_super_admin'])
const showAppAccessForm = computed(() =>
  !!selectedOrgRole.value && !rolesWithInheritedAppAccess.has(selectedOrgRole.value),
)

const selectedAppIds = computed(() => Object.keys(pendingAppBindings.value))
const configuredAppIds = computed(() =>
  Object.entries(pendingAppBindings.value)
    .filter(([, roleName]) => !!roleName)
    .map(([appId]) => appId),
)
const configuredLimitedAppIds = computed(() =>
  configuredAppIds.value
    .map(appId => appById.value.get(appId)?.app_id)
    .filter((appId): appId is string => !!appId),
)

const UUID_REGEX = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i

async function refreshCurrentOrganizationState(forceFetchOrganizations = false) {
  isOrgLoading.value = true

  if (forceFetchOrganizations)
    await organizationStore.fetchOrganizations()

  await organizationStore.awaitInitialLoad()

  const orgId = currentOrganization.value?.gid
  if (!orgId) {
    resolvedUseNewRbac.value = false
    isOrgLoading.value = false
    return
  }

  const { data, error } = await supabase
    .from('orgs')
    .select('use_new_rbac')
    .eq('id', orgId)
    .single()

  resolvedUseNewRbac.value = error ? !!currentOrganization.value?.use_new_rbac : data?.use_new_rbac === true
  isOrgLoading.value = false
}

watch([rbacId, () => currentOrganization.value?.gid], async ([id, orgId]) => {
  if (!id || !orgId)
    return

  displayStore.defaultBack = '/settings/organization/api-keys'

  if (id === 'new') {
    apiKey.value = null
    editName.value = ''
    selectedOrgRole.value = ''
    originalUnsupportedOrgRole.value = ''
    pendingAppBindings.value = {}
    createAsHashed.value = false
    setExpiration.value = false
    expirationDate.value = null
    displayStore.NavTitle = t('create-api-key')
    await Promise.all([fetchRoles(), fetchApps(orgId)])
  }
  else if (UUID_REGEX.test(id)) {
    await loadAll()
  }
  else {
    toast.error(t('invalid-api-key-id'))
    router.replace('/settings/organization/api-keys')
  }
}, { immediate: true })

onMounted(async () => {
  await refreshCurrentOrganizationState(true)
})

watch(() => currentOrganization.value?.gid, async (orgId, previousOrgId) => {
  if (!orgId || orgId === previousOrgId)
    return
  await refreshCurrentOrganizationState()
})

async function loadAll() {
  isLoading.value = true
  try {
    await Promise.all([fetchApiKey(), fetchRoles(), fetchApps()])
    await fetchRoleBindings()
  }
  catch (error) {
    console.error('Error loading API key data:', error)
    toast.error(t('error-loading-data'))
  }
  finally {
    isLoading.value = false
  }
}

async function fetchApiKey() {
  const orgId = currentOrganization.value?.gid
  if (!orgId)
    return
  const { data, error } = await supabase.rpc('get_org_apikeys' as any, { p_org_id: orgId } as any)
  if (error)
    throw error
  const keys = (Array.isArray(data) ? data : []) as OrgApiKey[]
  const found = keys.find(k => k.rbac_id === rbacId.value)
  if (!found) {
    toast.error(t('api-key-not-found'))
    router.replace('/settings/organization/api-keys')
    return
  }
  apiKey.value = found
  editName.value = found.name
  displayStore.NavTitle = found.name
  if (found.expires_at) {
    setExpiration.value = true
    expirationDate.value = new Date(found.expires_at)
  }
}

async function fetchRoles() {
  const { data, error } = await supabase
    .from('roles')
    .select('id, name, scope_type, description, priority_rank')
    .eq('is_assignable', true)
    .in('scope_type', ['org', 'app'])
    .order('priority_rank', { ascending: false })
  if (error)
    throw error
  roles.value = (data || []) as Role[]
}

async function fetchRoleBindings() {
  const orgId = currentOrganization.value?.gid
  if (!orgId)
    return
  const { data, error } = await supabase
    .from('role_bindings')
    .select('id, principal_type, principal_id, scope_type, app_id, role_id, roles(name)')
    .eq('org_id', orgId)
    .eq('principal_type', 'apikey')
    .eq('principal_id', rbacId.value)
  if (error)
    throw error
  roleBindings.value = ((data || []) as any[]).map(row => ({
    id: row.id,
    principal_type: row.principal_type,
    principal_id: row.principal_id,
    scope_type: row.scope_type,
    app_id: row.app_id,
    role_name: row.roles?.name || '',
  }))
  const currentOrgRoleName = keyOrgBinding.value?.role_name ?? ''
  originalUnsupportedOrgRole.value = unsupportedApiKeyOrgRoles.has(currentOrgRoleName)
    ? currentOrgRoleName
    : ''
  selectedOrgRole.value = originalUnsupportedOrgRole.value
    ? ''
    : currentOrgRoleName
  const map: Record<string, string> = {}
  keyAppBindings.value.forEach((b) => {
    if (b.app_id)
      map[b.app_id] = b.role_name
  })
  pendingAppBindings.value = map
}

async function fetchApps(orgId = currentOrganization.value?.gid) {
  if (!orgId)
    return
  const { data, error } = await supabase
    .from('apps')
    .select('id, app_id, name')
    .eq('owner_org', orgId)
    .order('name', { ascending: true })
  if (error)
    throw error

  const visibleApps = (data || []).filter((app): app is OrgApp => !!app.id && !!app.app_id)
  const appAccessChecks = await Promise.all(visibleApps.map(async (app) => {
    const canManageAppRoles = await checkPermissions('app.update_user_roles', {
      orgId,
      appId: app.app_id,
    })

    return canManageAppRoles ? app : null
  }))

  apps.value = appAccessChecks.filter((app): app is OrgApp => !!app)
}

function getRoleDisplayName(roleName: string): string {
  const normalized = roleName.replace(/^invite_/, '')
  const i18nKey = getRbacRoleI18nKey(normalized)
  return i18nKey ? t(i18nKey) : normalized.replaceAll('_', ' ')
}

function getAppName(appId: string) {
  const app = appById.value.get(appId)
  return app ? (app.name || app.app_id) : appId
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

async function showOneTimeKeyModal(plainKey: string) {
  createdKeyDialogMode.value = 'success'
  createdPlainKey.value = plainKey
  dialogStore.openDialog({
    id: 'org-apikey-created',
    title: t('secure-key-created'),
    size: 'lg',
    preventAccidentalClose: true,
    buttons: [
      {
        text: t('ok'),
        role: 'primary',
      },
    ],
  })

  await dialogStore.onDialogDismiss()
  createdPlainKey.value = ''
  createdKeyDialogMode.value = 'success'
}

async function copyCreatedKey() {
  if (!createdPlainKey.value)
    return

  try {
    await navigator.clipboard.writeText(createdPlainKey.value)
    toast.success(t('key-copied'))
  }
  catch (error) {
    console.error('Failed to copy created API key:', error)
    toast.error(t('cannot-copy-key'))
  }
}

async function showPartialFailureKeyModal(plainKey: string, isHashed: boolean) {
  createdKeyDialogMode.value = isHashed ? 'partial-failure-hashed' : 'partial-failure-plain'
  createdPlainKey.value = plainKey
  dialogStore.openDialog({
    id: 'org-apikey-created',
    title: t('api-key-create-partial-failure-title'),
    size: 'lg',
    preventAccidentalClose: true,
    buttons: [
      {
        text: t('ok'),
        role: 'primary',
      },
    ],
  })

  await dialogStore.onDialogDismiss()
  createdPlainKey.value = ''
  createdKeyDialogMode.value = 'success'
}

async function rollbackCreatedApiKey(apikeyId: number | string | null) {
  if (!apikeyId)
    return null

  const { error } = await supabase.functions.invoke(`apikey/${apikeyId}`, {
    method: 'DELETE',
  })

  return error ?? null
}

function validateApiKeyForm() {
  if (!editName.value.trim()) {
    toast.error(t('please-enter-api-key-name'))
    return false
  }

  if (hasIncompleteAppBindings()) {
    toast.error(t('select-role-for-each-app'))
    return false
  }

  return true
}

function getApiKeyExpirationValue() {
  return setExpiration.value && expirationDate.value
    ? dayjs(expirationDate.value).toISOString()
    : null
}

function parseCreatedApiKeyResult(data: unknown): CreatedApiKeyResult | null {
  if (!data || typeof data !== 'object')
    return null

  const createdApiKey = data as { id?: number | string, key?: string, rbac_id?: string }
  if (typeof createdApiKey.rbac_id !== 'string' || !createdApiKey.rbac_id)
    return null

  return {
    id: typeof createdApiKey.id === 'number' || typeof createdApiKey.id === 'string'
      ? createdApiKey.id
      : null,
    key: typeof createdApiKey.key === 'string' && createdApiKey.key.length > 0
      ? createdApiKey.key
      : null,
    rbacId: createdApiKey.rbac_id,
  }
}

async function deleteRoleBinding(bindingId: string) {
  const { error } = await supabase.functions.invoke(`private/role_bindings/${bindingId}`, { method: 'DELETE' })
  if (error)
    throw error
}

async function updateRoleBindingRole(bindingId: string, roleName: string) {
  const { error } = await supabase.functions.invoke(`private/role_bindings/${bindingId}`, {
    method: 'PATCH',
    body: { role_name: roleName },
  })
  if (error)
    throw error
}

async function createRoleBinding(roleBinding: Record<string, unknown>) {
  const { error } = await supabase.functions.invoke('private/role_bindings', {
    method: 'POST',
    body: roleBinding,
  })
  if (error)
    throw error
}

async function createOrgRoleBinding(principalId: string, orgId: string, roleName: string) {
  await createRoleBinding({
    principal_type: 'apikey',
    principal_id: principalId,
    role_name: roleName,
    scope_type: 'org',
    org_id: orgId,
  })
}

async function createAppRoleBinding(principalId: string, orgId: string, appId: string, roleName: string) {
  await createRoleBinding({
    principal_type: 'apikey',
    principal_id: principalId,
    role_name: roleName,
    scope_type: 'app',
    org_id: orgId,
    app_id: appId,
  })
}

async function createApiKeyRecord(orgId: string) {
  const { data, error } = await supabase.functions.invoke('apikey', {
    method: 'POST',
    body: {
      mode: 'all',
      name: editName.value.trim(),
      limited_to_orgs: [orgId],
      limited_to_apps: configuredLimitedAppIds.value,
      expires_at: getApiKeyExpirationValue(),
      hashed: createAsHashed.value,
    },
  })

  if (error)
    throw error

  const createdApiKey = parseCreatedApiKeyResult(data)
  if (!createdApiKey)
    throw new Error(t('failed-to-create-api-key'))

  return createdApiKey
}

async function assignBindingsForNewApiKey(orgId: string, principalId: string) {
  if (selectedOrgRole.value)
    await createOrgRoleBinding(principalId, orgId, selectedOrgRole.value)

  for (const [appId, roleName] of Object.entries(pendingAppBindings.value)) {
    if (!roleName)
      continue
    await createAppRoleBinding(principalId, orgId, appId, roleName)
  }
}

async function rollbackCreatedApiKeyAfterBindingFailure(
  bindingError: unknown,
  createdApiKey: CreatedApiKeyResult,
) {
  const rollbackError = await rollbackCreatedApiKey(createdApiKey.id)
  if (rollbackError) {
    console.error('Failed to rollback API key after binding error:', rollbackError)
    if (createdApiKey.key)
      await showPartialFailureKeyModal(createdApiKey.key, createAsHashed.value)
  }
  throw bindingError
}

async function finalizeCreatedApiKey(createdPlainKey: string | null) {
  if (createdPlainKey)
    await showOneTimeKeyModal(createdPlainKey)
  else
    toast.success(t('add-api-key'))

  await router.replace('/settings/organization/api-keys')
}

function shouldKeepUnsupportedOrgRole(existingRoleName: string | undefined, targetRoleName: string) {
  return !targetRoleName
    && !!originalUnsupportedOrgRole.value
    && existingRoleName === originalUnsupportedOrgRole.value
}

async function persistOrgRoleBinding(existingBinding: RoleBinding | undefined, orgId: string, targetRoleName: string) {
  if (existingBinding)
    await updateRoleBindingRole(existingBinding.id, targetRoleName)
  else
    await createOrgRoleBinding(rbacId.value, orgId, targetRoleName)
}

async function deleteRemovedAppBindings(existingBindings: RoleBinding[], pendingBindings: Record<string, string>) {
  for (const binding of existingBindings) {
    if (!binding.app_id || !(binding.app_id in pendingBindings))
      await deleteRoleBinding(binding.id)
  }
}

async function upsertPendingAppBindings(existingBindings: RoleBinding[], pendingBindings: Record<string, string>, orgId: string) {
  for (const [appId, roleName] of Object.entries(pendingBindings)) {
    if (!roleName)
      continue

    const existingBinding = existingBindings.find(binding => binding.app_id === appId)
    if (existingBinding) {
      if (existingBinding.role_name !== roleName)
        await updateRoleBindingRole(existingBinding.id, roleName)
      continue
    }

    await createAppRoleBinding(rbacId.value, orgId, appId, roleName)
  }
}

async function getUserFacingErrorMessage(error: unknown, fallbackMessage: string) {
  if (error && typeof error === 'object' && 'context' in error && error.context instanceof Response) {
    try {
      const payload = await error.context.clone().json() as { message?: string, error_description?: string }
      if (typeof payload.message === 'string' && payload.message)
        return payload.message
      if (typeof payload.error_description === 'string' && payload.error_description)
        return payload.error_description
    }
    catch {
    }
  }

  if (error instanceof Error && error.message)
    return error.message

  return fallbackMessage
}

async function createKey() {
  if (!validateApiKeyForm())
    return

  const orgId = currentOrganization.value?.gid
  if (!orgId)
    return

  isSubmitting.value = true
  try {
    const createdApiKey = await createApiKeyRecord(orgId)

    try {
      await assignBindingsForNewApiKey(orgId, createdApiKey.rbacId)
    }
    catch (bindingError) {
      await rollbackCreatedApiKeyAfterBindingFailure(bindingError, createdApiKey)
    }

    await finalizeCreatedApiKey(createdApiKey.key)
  }
  catch (err) {
    console.error('Error creating API key:', err)
    toast.error(await getUserFacingErrorMessage(err, t('failed-to-create-api-key')))
  }
  finally {
    isSubmitting.value = false
  }
}

async function saveKey() {
  if (!apiKey.value || !validateApiKeyForm())
    return

  isSubmitting.value = true
  try {
    const { error } = await supabase
      .from('apikeys')
      .update({
        name: editName.value.trim(),
        limited_to_orgs: [currentOrganization.value!.gid],
        limited_to_apps: configuredLimitedAppIds.value,
      })
      .eq('id', apiKey.value.id)
    if (error)
      throw error

    apiKey.value.name = editName.value.trim()
    apiKey.value.limited_to_orgs = [currentOrganization.value!.gid]
    apiKey.value.limited_to_apps = configuredLimitedAppIds.value
    displayStore.NavTitle = editName.value.trim()

    await saveOrgRole()
    await syncAppBindings()

    toast.success(t('api-key-updated'))
  }
  catch (err) {
    console.error('Error saving API key:', err)
    toast.error(t('error-updating-api-key'))
  }
  finally {
    isSubmitting.value = false
  }
}

async function saveOrgRole() {
  const existing = keyOrgBinding.value
  const target = selectedOrgRole.value
  const orgId = currentOrganization.value?.gid

  if (shouldKeepUnsupportedOrgRole(existing?.role_name, target))
    return

  if (!target) {
    if (existing)
      await deleteRoleBinding(existing.id)
    return
  }

  if (!orgId || existing?.role_name === target)
    return

  await persistOrgRoleBinding(existing, orgId, target)
  await fetchRoleBindings()
}

async function syncAppBindings() {
  const existing = keyAppBindings.value
  const pending = pendingAppBindings.value
  const orgId = currentOrganization.value?.gid

  if (!orgId)
    return

  await deleteRemovedAppBindings(existing, pending)
  await upsertPendingAppBindings(existing, pending, orgId)

  await fetchRoleBindings()
}
</script>

<template>
  <div>
    <div v-if="isOrgLoading || isPermissionLoading" class="flex items-center justify-center py-12">
      <span class="d-loading d-loading-spinner d-loading-lg" />
    </div>

    <div
      v-else-if="!canShow || !canManage"
      class="flex flex-col bg-white border shadow-lg md:p-6 md:rounded-lg dark:bg-gray-800 border-slate-300 dark:border-slate-900"
    >
      <h2 class="text-2xl font-bold dark:text-white text-slate-800">
        {{ t('api-keys') }}
      </h2>
      <p class="mt-2 text-sm text-slate-500">
        {{ t('api-keys-unavailable') }}
      </p>
    </div>

    <div v-else>
      <div class="flex flex-col bg-white border shadow-lg md:p-8 md:rounded-lg dark:bg-gray-800 border-slate-300 dark:border-slate-900">
        <!-- Back -->
        <div class="mb-6">
          <RouterLink
            to="/settings/organization/api-keys"
            class="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            <span>←</span>
            <span>{{ t('api-keys') }}</span>
          </RouterLink>
        </div>

        <div v-if="isLoading" class="flex items-center justify-center py-12">
          <span class="d-loading d-loading-spinner d-loading-lg" />
        </div>

        <template v-else-if="isCreateMode || apiKey">
          <h1 class="mb-6 text-2xl font-bold dark:text-white text-slate-800">
            {{ isCreateMode ? t('create-api-key') : apiKey!.name }}
          </h1>

          <!-- Key info -->
          <section class="mb-8">
            <h2 class="mb-4 text-sm font-semibold uppercase text-slate-500">
              {{ t('key-information') }}
            </h2>
            <div class="space-y-4 max-w-lg">
              <div>
                <label for="apikey-name" class="block mb-1 text-sm font-medium dark:text-white text-slate-800">
                  {{ t('name') }} *
                </label>
                <input
                  id="apikey-name"
                  v-model="editName"
                  type="text"
                  class="w-full d-input d-input-bordered"
                  :placeholder="t('type-new-name')"
                  :disabled="isSubmitting"
                >
              </div>

              <template v-if="isCreateMode">
                <!-- Secure key -->
                <div class="p-4 border border-blue-200 rounded-lg bg-blue-50 dark:bg-blue-900/20 dark:border-blue-700">
                  <div class="flex items-start gap-3">
                    <input
                      id="apikey-hashed"
                      v-model="createAsHashed"
                      type="checkbox"
                      class="mt-1 checkbox checkbox-primary"
                    >
                    <div>
                      <label for="apikey-hashed" class="font-medium text-blue-800 cursor-pointer dark:text-blue-200">
                        {{ t('create-secure-key') }}
                      </label>
                      <p class="mt-1 text-sm text-blue-600 dark:text-blue-300">
                        {{ t('create-secure-key-description') }}
                      </p>
                    </div>
                  </div>
                </div>

                <!-- Expiration -->
                <div>
                  <div class="flex items-center gap-2 mb-2">
                    <input
                      id="apikey-expiration"
                      v-model="setExpiration"
                      type="checkbox"
                      class="checkbox"
                    >
                    <label for="apikey-expiration" class="text-sm">{{ t('set-expiration-date') }}</label>
                  </div>
                  <div v-if="setExpiration">
                    <VueDatePicker
                      v-model="expirationDate"
                      :min-date="minExpirationDate"
                      :enable-time-picker="false"
                      :dark="isDark"
                      teleport="body"
                      :auto-apply="true"
                      hide-input-icon
                      :action-row="{ showCancel: false, showSelect: false, showNow: false, showPreview: false }"
                      :placeholder="t('select-expiration-date')"
                    >
                      <template #trigger>
                        <button
                          type="button"
                          class="flex items-center gap-2 px-3 py-2 text-sm text-left bg-white border border-gray-300 rounded-md dark:text-white dark:bg-gray-800 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          <IconCalendar class="w-4 h-4 text-gray-500" />
                          <span :class="expirationDate ? 'text-gray-900 dark:text-white' : 'text-gray-500'">
                            {{ expirationDate ? dayjs(expirationDate).format('YYYY-MM-DD') : t('select-expiration-date') }}
                          </span>
                        </button>
                      </template>
                    </VueDatePicker>
                  </div>
                </div>
              </template>

              <template v-else-if="apiKey">
                <div class="text-sm text-slate-500 space-y-1">
                  <div>{{ t('email') }}: <span class="text-slate-700 dark:text-slate-300">{{ apiKey.owner_email }}</span></div>
                  <div v-if="apiKey.expires_at">
                    {{ t('expires') }}: <span class="text-slate-700 dark:text-slate-300">{{ dayjs(apiKey.expires_at).format('YYYY-MM-DD') }}</span>
                  </div>
                </div>
              </template>
            </div>
          </section>

          <!-- Org role -->
          <section class="mb-8">
            <h2 class="mb-2 text-sm font-semibold uppercase text-slate-500">
              {{ t('organization') }}
            </h2>
            <p class="mb-3 text-sm text-slate-500">
              {{ t('select-user-role') }}
            </p>
            <div class="space-y-2">
              <label class="flex items-center gap-3 cursor-pointer">
                <input
                  v-model="selectedOrgRole"
                  type="radio"
                  class="d-radio d-radio-primary d-radio-sm"
                  name="apikey-org-role"
                  value=""
                  :disabled="isSubmitting"
                >
                <span class="text-sm text-slate-600 dark:text-slate-400">{{ t('none') }}</span>
              </label>
              <label
                v-for="role in orgRoleOptions"
                :key="role.id"
                class="flex items-center gap-3 cursor-pointer"
              >
                <input
                  v-model="selectedOrgRole"
                  type="radio"
                  class="d-radio d-radio-primary d-radio-sm"
                  name="apikey-org-role"
                  :value="role.name"
                  :disabled="isSubmitting"
                >
                <span class="text-sm font-medium dark:text-white text-slate-800">{{ role.description }}</span>
              </label>
            </div>
          </section>

          <!-- App access -->
          <section class="mb-8">
            <h2 class="mb-4 text-sm font-semibold uppercase text-slate-500">
              {{ t('app-access-control') }}
            </h2>

            <div v-if="!showAppAccessForm" class="py-4 text-sm text-slate-500">
              {{ t('app-access-member-only') }}
            </div>

            <template v-else>
              <div class="flex justify-end mb-4">
                <div class="relative">
                  <button
                    class="d-btn d-btn-sm d-btn-outline gap-2"
                    :disabled="isSubmitting"
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
                    <div v-if="apps.length === 0" class="px-4 py-3 text-sm text-slate-500">
                      {{ t('no-apps') }}
                    </div>
                    <label
                      v-for="app in apps"
                      :key="app.id"
                      class="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      <input
                        type="checkbox"
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
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              <div v-if="selectedAppIds.length === 0" class="py-4 text-sm text-slate-500">
                {{ t('app-access-none') }}
              </div>
              <div v-else class="border rounded-lg border-slate-200 dark:border-slate-700 overflow-hidden">
                <div
                  v-for="appId in selectedAppIds"
                  :key="appId"
                  class="flex items-center gap-4 px-4 py-2.5 border-b last:border-0 border-slate-100 dark:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-700/20"
                >
                  <span class="flex-1 text-sm font-medium dark:text-white text-slate-800 truncate">
                    {{ getAppName(appId) }}
                  </span>
                  <select
                    class="d-select d-select-sm d-select-bordered"
                    :value="pendingAppBindings[appId] || ''"
                    :disabled="isSubmitting"
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
                    class="d-btn d-btn-xs d-btn-ghost text-red-500 shrink-0"
                    :disabled="isSubmitting"
                    @click="toggleApp(appId)"
                  >
                    <IconTrash class="w-4 h-4" />
                  </button>
                </div>
              </div>
            </template>
          </section>

          <!-- Save -->
          <div class="flex justify-end pt-4 border-t border-slate-200 dark:border-slate-700">
            <button
              class="d-btn d-btn-primary"
              :disabled="isSubmitting || !editName.trim()"
              @click="isCreateMode ? createKey() : saveKey()"
            >
              <span v-if="isSubmitting" class="d-loading d-loading-spinner d-loading-xs" />
              {{ isCreateMode ? t('create') : t('save') }}
            </button>
          </div>
        </template>

        <div v-else class="py-12 text-center text-slate-500">
          {{ t('api-key-not-found') }}
        </div>
      </div>
    </div>

    <Teleport
      v-if="dialogStore.showDialog && dialogStore.dialogOptions?.id === 'org-apikey-created'"
      to="#dialog-v2-content"
      defer
    >
      <div class="space-y-4">
        <p class="text-sm text-slate-600">
          {{
            createdKeyDialogMode === 'partial-failure-hashed'
              ? t('api-key-create-partial-failure-warning-hashed')
              : createdKeyDialogMode === 'partial-failure-plain'
                ? t('api-key-create-partial-failure-warning-plain')
                : t('secure-key-warning')
          }}
        </p>

        <div class="p-4 border rounded-lg border-blue-200 bg-blue-50">
          <p class="mb-2 text-sm font-semibold text-blue-800">
            {{ t('your-api-key') }}
          </p>

          <div class="flex flex-col gap-3 p-3 border rounded-lg border-blue-200 bg-white sm:flex-row sm:items-start sm:justify-between">
            <code class="flex-1 text-sm break-all whitespace-pre-wrap text-slate-800">{{ createdPlainKey }}</code>

            <button
              type="button"
              class="d-btn d-btn-sm d-btn-outline border-blue-300 text-blue-700 hover:bg-blue-100"
              @click="copyCreatedKey"
            >
              <IconClipboard class="w-4 h-4" />
              {{ t('copy') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<route lang="yaml">
path: /settings/organization/api-keys/:id
meta:
  layout: settings
</route>
