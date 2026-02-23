<script setup lang="ts">
import type { Ref } from 'vue'
import type { TableColumn } from '~/components/comp_def'
import { computedAsync } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import IconTrash from '~icons/heroicons/trash'
import IconWrench from '~icons/heroicons/wrench'
import DataTable from '~/components/DataTable.vue'
import { formatDate } from '~/services/date'
import { checkPermissions } from '~/services/permissions'
import { useSupabase } from '~/services/supabase'
import { useDialogV2Store } from '~/stores/dialogv2'
import { useDisplayStore } from '~/stores/display'
import { getRbacRoleI18nKey, useOrganizationStore } from '~/stores/organization'

interface Group {
  id: string
  org_id: string
  name: string
  description: string | null
  created_at: string
}

interface GroupRow extends Group {
  org_role: string | null
}

interface RoleBinding {
  id: string
  principal_type: string
  principal_id: string
  role_name: string
  scope_type: string
  app_id: string | null
}

const { t } = useI18n()
const router = useRouter()
const supabase = useSupabase()
const dialogStore = useDialogV2Store()
const organizationStore = useOrganizationStore()
const { currentOrganization } = storeToRefs(organizationStore)
const displayStore = useDisplayStore()
displayStore.NavTitle = t('groups')

const canManage = computedAsync(async () => {
  if (!currentOrganization.value?.gid)
    return false
  return await checkPermissions('org.update_user_roles', { orgId: currentOrganization.value.gid })
}, false)

const canShow = computed(() =>
  !!currentOrganization.value?.use_new_rbac && !!currentOrganization.value?.gid,
)

const isLoading = ref(false)
const isSubmitting = ref(false)
const groups = ref<Group[]>([])
const roleBindings = ref<RoleBinding[]>([])

const search = ref('')
const currentPage = ref(1)
const columns: Ref<TableColumn[]> = ref<TableColumn[]>([])

const groupRows = computed<GroupRow[]>(() =>
  groups.value.map((group: Group) => ({
    ...group,
    org_role: getGroupOrgRoleName(group.id),
  })),
)

const filteredGroups = computed(() => {
  if (!search.value)
    return groupRows.value
  const searchLower = search.value.toLowerCase()
  return groupRows.value.filter((group: GroupRow) =>
    group.name.toLowerCase().includes(searchLower)
    || (group.description || '').toLowerCase().includes(searchLower)
    || getRoleDisplayName(group.org_role || '').toLowerCase().includes(searchLower),
  )
})

const dynamicColumns = computed<TableColumn[]>(() => {
  const tableColumns: TableColumn[] = [
    {
      label: t('name'),
      key: 'name',
      mobile: true,
      sortable: true,
      head: true,
    },
    {
      label: t('description'),
      key: 'description',
      mobile: true,
      displayFunction: (group: GroupRow) => group.description || t('none'),
    },
    {
      label: t('role'),
      key: 'org_role',
      mobile: true,
      displayFunction: (group: GroupRow) => group.org_role ? getRoleDisplayName(group.org_role) : t('none'),
    },
    {
      label: t('granted-at'),
      key: 'created_at',
      mobile: true,
      displayFunction: (group: GroupRow) => formatDate(group.created_at),
    },
  ]

  if (canManage.value) {
    tableColumns.push({
      key: 'actions',
      label: t('actions'),
      mobile: true,
      actions: [
        {
          icon: IconWrench,
          title: t('manage', 'Manage'),
          onClick: (group: GroupRow) => router.push(`/settings/organization/groups/${group.id}`),
        },
        {
          icon: IconTrash,
          title: t('remove', 'Remove'),
          onClick: (group: GroupRow) => deleteGroup(group),
        },
      ],
    })
  }

  return tableColumns
})

watch(dynamicColumns, (newColumns: TableColumn[]) => {
  columns.value = newColumns
}, { immediate: true })

watch(() => currentOrganization.value?.gid, async (orgId: string | undefined) => {
  if (!orgId) {
    groups.value = []
    return
  }
  search.value = ''
  currentPage.value = 1
  await refreshData()
}, { immediate: true })

async function refreshData() {
  if (!currentOrganization.value?.gid)
    return

  isLoading.value = true
  try {
    await Promise.all([fetchGroups(), fetchRoleBindings()])
  }
  catch (error) {
    console.error('Error loading groups:', error)
    toast.error(t('error-fetching-groups', 'Error fetching groups'))
  }
  finally {
    isLoading.value = false
  }
}

async function fetchGroups() {
  const { data, error } = await supabase
    .from('groups')
    .select('id, org_id, name, description, created_at')
    .eq('org_id', currentOrganization.value!.gid)
    .order('name', { ascending: true })

  if (error)
    throw error

  groups.value = (Array.isArray(data) ? data : []) as Group[]
}

async function fetchRoleBindings() {
  const { data, error } = await supabase
    .from('role_bindings')
    .select('id, principal_type, principal_id, scope_type, app_id, role_id, roles(name)')
    .eq('org_id', currentOrganization.value!.gid)
    .eq('principal_type', 'group')

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
}

function getRoleDisplayName(roleName: string): string {
  const normalized = roleName.replace(/^invite_/, '')
  const i18nKey = getRbacRoleI18nKey(normalized)
  return i18nKey ? t(i18nKey) : normalized.replaceAll('_', ' ')
}

function getGroupOrgRoleName(groupId: string): string | null {
  const binding = roleBindings.value.find((b: RoleBinding) =>
    b.principal_type === 'group'
    && b.principal_id === groupId
    && b.scope_type === 'org',
  )
  return binding?.role_name || null
}

async function deleteGroup(group: GroupRow) {
  if (!canManage.value)
    return

  dialogStore.openDialog({
    id: 'delete-group-confirmation',
    title: t('remove-group', 'Remove group'),
    description: t('remove-group-confirmation', 'This action removes the group and all linked role assignments.'),
    buttons: [
      { text: t('button-cancel'), role: 'cancel' },
      { text: t('remove', 'Remove'), role: 'danger' },
    ],
  })

  const wasCanceled = await dialogStore.onDialogDismiss()
  if (wasCanceled || dialogStore.lastButtonRole !== 'danger')
    return

  isSubmitting.value = true
  try {
    const { error: roleBindingsDeleteError } = await supabase
      .from('role_bindings')
      .delete()
      .eq('principal_type', 'group')
      .eq('principal_id', group.id)

    if (roleBindingsDeleteError)
      throw roleBindingsDeleteError

    const { error } = await supabase
      .from('groups')
      .delete()
      .eq('id', group.id)

    if (error)
      throw error

    toast.success(t('group-removed', 'Group removed'))
    await refreshData()
  }
  catch (error) {
    console.error('Error deleting group:', error)
    toast.error(t('error-removing-group', 'Error removing group'))
  }
  finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div>
    <div
      v-if="canShow && canManage"
      class="flex flex-col h-full pb-8 overflow-hidden overflow-y-auto bg-white border shadow-lg md:p-8 md:pb-0 max-h-fit grow md:rounded-lg dark:bg-gray-800 border-slate-300 dark:border-slate-900"
    >
      <div class="flex justify-between w-full mb-5 ml-2 md:ml-0">
        <h2 class="text-2xl font-bold dark:text-white text-slate-800">
          {{ t('groups') }}
        </h2>
      </div>
      <DataTable
        v-model:columns="columns"
        v-model:current-page="currentPage"
        v-model:search="search"
        :show-add="canManage"
        :total="filteredGroups.length"
        :element-list="filteredGroups"
        :search-placeholder="t('search-groups', 'Search groups')"
        :is-loading="isLoading"
        :auto-reload="false"
        @reload="refreshData"
        @reset="refreshData"
        @add="() => router.push('/settings/organization/groups/new')"
      />
    </div>

    <div
      v-else
      class="flex flex-col bg-white border shadow-lg md:p-6 md:rounded-lg dark:bg-gray-800 border-slate-300 dark:border-slate-900"
    >
      <h2 class="text-2xl font-bold dark:text-white text-slate-800">
        {{ t('groups') }}
      </h2>
      <p class="mt-2 text-sm text-slate-500">
        {{ t('groups-unavailable') }}
      </p>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
</route>
