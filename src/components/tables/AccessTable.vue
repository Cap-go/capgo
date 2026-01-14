<script setup lang="ts">
import type { Ref } from 'vue'
import type { TableColumn } from '../comp_def'
import type { Database } from '~/types/supabase.types'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import IconTrash from '~icons/heroicons/trash'
import IconWrench from '~icons/heroicons/wrench'
import DataTable from '~/components/Table.vue'
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

// Définir les options de rôles d'application
const appRoleOptions = computed(() => [
  { label: t('role-app-developer'), value: 'app_developer' },
  { label: t('role-app-uploader'), value: 'app_uploader' },
  { label: t('role-app-reader'), value: 'app_reader' },
])

async function loadAppInfo() {
  try {
    const { data: dataApp } = await supabase
      .from('apps')
      .select()
      .eq('app_id', props.appId)
      .single()
    app.value = dataApp ?? undefined
    canUpdateUserRoles.value = false

    // Vérifier la permission app.update_user_roles
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
    // Utilise la RPC sécurisée pour récupérer les accès
    const { data, error } = await supabase
      .rpc('get_app_access_rbac', {
        p_app_id: app.value.id,
      })

    if (error)
      throw error

    // Les données sont déjà enrichies par la RPC
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

  const roleSnapshot = selectedRole.value
  if (await dialogStore.onDialogDismiss()) {
    return undefined
  }
  return roleSnapshot
}

async function changeUserRole(element: Element) {
  if (!canUpdateUserRoles.value)
    return

  const newRoleName = await showRoleModal(element)

  if (!newRoleName || newRoleName === element.role_name) {
    return
  }

  const isValidRole = appRoleOptions.value.some((option) => option.value === newRoleName)
  if (!isValidRole) {
    return
  }

  isLoading.value = true
  try {
    // Récupérer l'UUID du nouveau rôle depuis la table roles
    const { data: roleData, error: roleError } = await supabase
      .from('roles')
      .select('id')
      .eq('name', newRoleName)
      .single()

    if (roleError || !roleData) {
      console.error('Error fetching role UUID:', roleError)
      throw new Error('Role not found')
    }

    // Mettre à jour le role_id existant
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
    // Suppression directe via RLS
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

// Filtrer les éléments en fonction de la recherche
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

  // Ajouter les colonnes actions seulement si l'utilisateur a la permission
  if (canUpdateUserRoles.value) {
    baseColumns.push({
      key: 'actions',
      label: t('actions'),
      actions: [
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

// Synchroniser les colonnes dynamiques avec la ref columns
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
      @reload="reload()"
      @reset="refreshData()"
    />
  </div>

  <!-- Teleport pour la modale de sélection du rôle -->
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
</template>
