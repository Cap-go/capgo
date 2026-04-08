<script setup lang="ts">
import type { Ref } from 'vue'
import type { TableColumn } from '~/components/comp_def'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import IconArrowPath from '~icons/heroicons/arrow-path'
import IconTrash from '~icons/heroicons/trash'
import IconWrench from '~icons/heroicons/wrench'
import DataTable from '~/components/DataTable.vue'
import {
  confirmApiKeyDeletion,
  confirmApiKeyRegeneration,
  formatApiKeyScope,
  isApiKeyExpired,
  showApiKeySecretModal,
  sortApiKeyRows,
} from '~/services/apikeys'
import { formatDate, formatLocalDate } from '~/services/date'
import { useSupabase } from '~/services/supabase'
import { useDialogV2Store } from '~/stores/dialogv2'
import { getRbacRoleI18nKey } from '~/stores/organization'

interface OrgApiKey {
  id: number
  rbac_id: string
  name: string
  mode: string
  limited_to_orgs: string[] | null
  limited_to_apps: string[] | null
  user_id: string
  created_at: string | null
  expires_at: string | null
}

interface ApiKeyRow extends OrgApiKey {
  key_type: 'v2' | 'legacy'
  org_role: string | null
}

interface OrgApp {
  app_id: string
  name: string | null
}

interface RoleBinding {
  id: string
  principal_id: string
  role_name: string
  scope_type: string
}

type ApiKeyAction = NonNullable<TableColumn['actions']>[number]

const props = defineProps<{
  orgId: string
  orgName: string
  canManage: boolean
}>()

const { t } = useI18n()
const router = useRouter()
const supabase = useSupabase()
const dialogStore = useDialogV2Store()

const isLoading = ref(false)
const isSubmitting = ref(false)
const apiKeys = ref<OrgApiKey[]>([])
const roleBindings = ref<RoleBinding[]>([])
const apps = ref<OrgApp[]>([])
const searchV2 = ref('')
const searchLegacy = ref('')
const currentPageV2 = ref(1)
const currentPageLegacy = ref(1)
const v2Columns: Ref<TableColumn[]> = ref<TableColumn[]>([])
const legacyColumns: Ref<TableColumn[]> = ref<TableColumn[]>([])
const unsupportedApiKeyOrgRoles = new Set(['org_billing_admin'])

const bindingsByPrincipal = computed<Map<string, RoleBinding[]>>(() => {
  const map = new Map<string, RoleBinding[]>()
  roleBindings.value.forEach((binding) => {
    const existing = map.get(binding.principal_id)
    if (existing)
      existing.push(binding)
    else
      map.set(binding.principal_id, [binding])
  })
  return map
})

const orgBindingsByPrincipal = computed<Map<string, RoleBinding>>(() =>
  new Map(
    roleBindings.value
      .filter(binding => binding.scope_type === 'org')
      .map(binding => [binding.principal_id, binding]),
  ),
)

const appNamesByAppId = computed<Map<string, string>>(() =>
  new Map(
    apps.value.map(app => [app.app_id, app.name || app.app_id]),
  ),
)

const apiKeyRows = computed<ApiKeyRow[]>(() =>
  apiKeys.value.map(apiKey => ({
    ...apiKey,
    key_type: (bindingsByPrincipal.value.get(apiKey.rbac_id)?.length ?? 0) > 0 ? 'v2' : 'legacy',
    org_role: (() => {
      const roleName = orgBindingsByPrincipal.value.get(apiKey.rbac_id)?.role_name ?? null
      return roleName && !unsupportedApiKeyOrgRoles.has(roleName) ? roleName : null
    })(),
  })),
)

function filterApiKeys(keyType: ApiKeyRow['key_type'], query: string) {
  const scopedKeys = apiKeyRows.value.filter(apiKey => apiKey.key_type === keyType)
  if (!query)
    return scopedKeys

  const q = query.toLowerCase()
  return scopedKeys.filter((apiKey) => {
    const roleName = apiKey.org_role ? getRoleDisplayName(apiKey.org_role).toLowerCase() : ''
    return apiKey.name.toLowerCase().includes(q)
      || apiKey.mode.toLowerCase().includes(q)
      || roleName.includes(q)
      || getOrgScopeDisplay(apiKey).toLowerCase().includes(q)
      || getAppScopeDisplay(apiKey).toLowerCase().includes(q)
  })
}

const v2Keys = computed(() => filterApiKeys('v2', searchV2.value))
const legacyKeys = computed(() => filterApiKeys('legacy', searchLegacy.value))

const sortedV2Keys = computed(() => sortApiKeyRows(v2Keys.value, v2Columns.value))
const sortedLegacyKeys = computed(() => sortApiKeyRows(legacyKeys.value, legacyColumns.value))

function createSharedScopeColumns(): TableColumn[] {
  return [
    {
      key: 'expires_at',
      label: t('expires'),
      mobile: true,
      displayFunction: (apiKey: ApiKeyRow) => {
        if (!apiKey.expires_at)
          return t('never')

        return isApiKeyExpired(apiKey.expires_at)
          ? `${formatDate(apiKey.expires_at)} (${t('expired')})`
          : formatDate(apiKey.expires_at)
      },
    },
    {
      key: 'created_at',
      label: t('created'),
      sortable: true,
      mobile: true,
      displayFunction: (apiKey: ApiKeyRow) => apiKey.created_at ? formatLocalDate(apiKey.created_at) : t('none'),
    },
    {
      key: 'limited_to_orgs',
      label: t('organizations'),
      mobile: true,
      displayFunction: (apiKey: ApiKeyRow) => getOrgScopeDisplay(apiKey),
    },
    {
      key: 'limited_to_apps',
      label: t('apps'),
      mobile: true,
      displayFunction: (apiKey: ApiKeyRow) => getAppScopeDisplay(apiKey),
    },
  ]
}

function createActionsColumn(actions: ApiKeyAction[]): TableColumn {
  return {
    key: 'actions',
    label: t('actions'),
    mobile: true,
    actions,
  }
}

const computedV2Columns = computed<TableColumn[]>(() => {
  const tableColumns: TableColumn[] = [
    {
      key: 'name',
      label: t('name'),
      sortable: true,
      mobile: true,
      head: true,
    },
    {
      key: 'org_role',
      label: t('role'),
      mobile: true,
      displayFunction: (apiKey: ApiKeyRow) => apiKey.org_role ? getRoleDisplayName(apiKey.org_role) : t('none'),
    },
    ...createSharedScopeColumns(),
  ]

  if (props.canManage) {
    tableColumns.push(createActionsColumn([
      {
        icon: IconWrench,
        title: t('manage'),
        onClick: (apiKey: ApiKeyRow) => router.push(`/settings/organization/api-keys/${apiKey.rbac_id}`),
      },
      {
        icon: IconArrowPath,
        title: t('button-regenerate'),
        onClick: (apiKey: ApiKeyRow) => regenerateKey(apiKey),
      },
      {
        icon: IconTrash,
        title: t('delete'),
        onClick: (apiKey: ApiKeyRow) => deleteKey(apiKey),
      },
    ]))
  }

  return tableColumns
})

const computedLegacyColumns = computed<TableColumn[]>(() => {
  const tableColumns: TableColumn[] = [
    {
      key: 'name',
      label: t('name'),
      sortable: true,
      mobile: true,
      head: true,
    },
    {
      key: 'mode',
      label: t('mode'),
      mobile: true,
    },
    ...createSharedScopeColumns(),
  ]

  if (props.canManage) {
    tableColumns.push(createActionsColumn([
      {
        icon: IconArrowPath,
        title: t('button-regenerate'),
        onClick: (apiKey: ApiKeyRow) => regenerateKey(apiKey),
      },
      {
        icon: IconTrash,
        title: t('delete'),
        onClick: (apiKey: ApiKeyRow) => deleteKey(apiKey),
      },
    ]))
  }

  return tableColumns
})

watch(computedV2Columns, (newColumns: TableColumn[]) => {
  v2Columns.value = newColumns
}, { immediate: true })

watch(computedLegacyColumns, (newColumns: TableColumn[]) => {
  legacyColumns.value = newColumns
}, { immediate: true })

watch(() => props.orgId, async (orgId) => {
  if (!orgId) {
    apiKeys.value = []
    roleBindings.value = []
    apps.value = []
    return
  }

  searchV2.value = ''
  searchLegacy.value = ''
  currentPageV2.value = 1
  currentPageLegacy.value = 1
  await refreshData()
}, { immediate: true })

function getRoleDisplayName(roleName: string): string {
  const normalized = roleName.replace(/^invite_/, '')
  const i18nKey = getRbacRoleI18nKey(normalized)
  return i18nKey ? t(i18nKey) : normalized.replaceAll('_', ' ')
}

function getOrgScopeDisplay(apiKey: OrgApiKey) {
  return formatApiKeyScope(apiKey.limited_to_orgs, orgId => orgId === props.orgId ? props.orgName : orgId, '*')
}

function getAppScopeDisplay(apiKey: OrgApiKey) {
  return formatApiKeyScope(apiKey.limited_to_apps, appId => appNamesByAppId.value.get(appId) || appId, '*')
}

async function refreshData() {
  if (!props.orgId)
    return

  isLoading.value = true
  try {
    await Promise.all([fetchApiKeys(), fetchRoleBindings(), fetchApps()])
  }
  catch (error) {
    console.error('Error loading API keys:', error)
    toast.error(t('error-fetching-role-bindings'))
  }
  finally {
    isLoading.value = false
  }
}

async function fetchApiKeys() {
  const { data, error } = await supabase.rpc('get_org_apikeys' as any, { p_org_id: props.orgId } as any)
  if (error)
    throw error
  apiKeys.value = (Array.isArray(data) ? data : []) as OrgApiKey[]
}

async function fetchRoleBindings() {
  const { data, error } = await supabase
    .from('role_bindings')
    .select('id, principal_id, scope_type, roles(name)')
    .eq('org_id', props.orgId)
    .eq('principal_type', 'apikey')

  if (error)
    throw error

  roleBindings.value = ((data || []) as any[]).map(row => ({
    id: row.id,
    principal_id: row.principal_id,
    role_name: row.roles?.name || '',
    scope_type: row.scope_type,
  }))
}

async function fetchApps() {
  const { data, error } = await supabase
    .from('apps')
    .select('app_id, name')
    .eq('owner_org', props.orgId)
    .order('name', { ascending: true })

  if (error)
    throw error

  apps.value = ((data || []) as OrgApp[]).filter(app => !!app.app_id)
}

function navigateToCreate() {
  if (!props.canManage)
    return
  router.push('/settings/organization/api-keys/new')
}

async function deleteKey(apiKey: OrgApiKey) {
  if (!await confirmApiKeyDeletion(dialogStore, t))
    return

  isSubmitting.value = true
  try {
    const { error } = await supabase.from('apikeys').delete().eq('id', apiKey.id)
    if (error)
      throw error
    toast.success(t('removed-apikey'))
    await refreshData()
  }
  catch (error) {
    console.error('Error deleting API key:', error)
    toast.error(t('error-removing-apikey'))
  }
  finally {
    isSubmitting.value = false
  }
}

async function regenerateKey(apiKey: OrgApiKey) {
  if (!await confirmApiKeyRegeneration(dialogStore, t))
    return

  const { data, error } = await supabase.functions.invoke('apikey', {
    method: 'PUT',
    body: { id: apiKey.id, regenerate: true },
  })
  if (error || !data) {
    toast.error(t('failed-to-regenerate-api-key'))
    return
  }

  if (typeof data.key === 'string') {
    await showApiKeySecretModal(dialogStore, t, data.key, () => {
      toast.success(t('key-copied'))
    })
  }

  toast.success(t('generated-new-apikey'))
  await refreshData()
}

async function reload() {
  await refreshData()
}
</script>

<template>
  <div>
    <div class="flex flex-col h-full pb-8 overflow-hidden overflow-y-auto bg-white border shadow-lg md:p-8 md:pb-0 max-h-fit grow md:rounded-lg dark:bg-gray-800 border-slate-300 dark:border-slate-900">
      <div class="flex justify-between w-full mb-5 ml-2 md:ml-0">
        <h2 class="text-2xl font-bold dark:text-white text-slate-800">
          {{ t('api-keys') }}
        </h2>
      </div>

      <section class="mb-8">
        <div class="mb-4">
          <div class="flex items-center gap-2">
            <h3 class="text-lg font-semibold dark:text-white text-slate-800">
              {{ t('api-keys-v2-title') }}
            </h3>
            <span class="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200">
              {{ v2Keys.length }}
            </span>
          </div>
          <p class="mt-2 text-sm text-slate-500">
            {{ t('api-keys-v2-description') }}
          </p>
        </div>

        <DataTable
          v-model:columns="v2Columns"
          v-model:current-page="currentPageV2"
          v-model:search="searchV2"
          :show-add="props.canManage"
          :total="sortedV2Keys.length"
          :element-list="sortedV2Keys"
          :search-placeholder="t('search-api-keys')"
          :is-loading="isLoading"
          :auto-reload="false"
          :mobile-fixed-pagination="false"
          @reload="reload"
          @reset="refreshData"
          @add="navigateToCreate"
        />
      </section>

      <section class="pt-8 border-t border-slate-200 dark:border-slate-700">
        <div class="mb-4">
          <div class="flex items-center gap-2">
            <h3 class="text-lg font-semibold dark:text-white text-slate-800">
              {{ t('api-keys-legacy-title') }}
            </h3>
            <span class="px-2 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300">
              {{ legacyKeys.length }}
            </span>
          </div>
          <p class="mt-2 text-sm text-slate-500">
            {{ t('api-keys-legacy-description') }}
          </p>
        </div>

        <DataTable
          v-model:columns="legacyColumns"
          v-model:current-page="currentPageLegacy"
          v-model:search="searchLegacy"
          :show-add="false"
          :total="sortedLegacyKeys.length"
          :element-list="sortedLegacyKeys"
          :search-placeholder="t('search-api-keys')"
          :is-loading="isLoading"
          :auto-reload="false"
          :mobile-fixed-pagination="false"
          @reload="reload"
          @reset="refreshData"
        />
      </section>
    </div>
  </div>
</template>
