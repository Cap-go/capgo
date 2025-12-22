<script setup lang="ts">
import type { TableColumn } from '~/components/comp_def'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import IconInformation from '~icons/heroicons/information-circle'
import IconPlus from '~icons/heroicons/plus'
import IconShield from '~icons/heroicons/shield-check'
import IconTrash from '~icons/heroicons/trash'
import Table from '~/components/Table.vue'
import { useSupabase } from '~/services/supabase'
import { useDialogV2Store } from '~/stores/dialogv2'
import { useDisplayStore } from '~/stores/display'
import { useOrganizationStore } from '~/stores/organization'

interface Role {
  id: string
  name: string
  scope_type: string
  description: string
  family_name: string
  priority_rank: number
}

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
  principal_email?: string
  group_name?: string
  app_name?: string
}

const { t } = useI18n()
const organizationStore = useOrganizationStore()
const { currentOrganization } = storeToRefs(organizationStore)
const supabase = useSupabase()
const dialogStore = useDialogV2Store()
const displayStore = useDisplayStore()
displayStore.NavTitle = t('role-assignments')

const useNewRbac = computed(() => (currentOrganization.value as any)?.use_new_rbac ?? false)

const isLoading = ref(false)
const roleBindings = ref<RoleBinding[]>([])
const availableRoles = ref<Role[]>([])
const search = ref('')
const currentPage = ref(1)
const filterScope = ref<string>('all')

// Assign role modal state
const isAssignRoleModalOpen = ref(false)
const assignRoleForm = ref({
  principal_type: 'user' as 'user' | 'group',
  principal_id: '',
  role_name: '',
  scope_type: 'org' as 'org' | 'app' | 'channel',
  app_id: '',
  channel_id: '',
  reason: '',
})

const availableMembers = ref<{ user_id: string, email: string }[]>([])
const availableGroups = ref<{ id: string, name: string }[]>([])
const availableApps = ref<{ id: string, name: string }[]>([])

const columns: Ref<TableColumn[]> = ref<TableColumn[]>([
  {
    key: 'principal',
    sortable: false,
    label: t('principal'),
  },
  {
    key: 'role',
    sortable: false,
    label: t('role'),
  },
  {
    key: 'scope',
    sortable: false,
    label: t('scope'),
  },
  {
    key: 'granted_at',
    sortable: false,
    label: t('granted-at'),
  },
  {
    key: 'actions',
    sortable: false,
    label: t('actions'),
  },
])

const scopeOptions = [
  { label: t('all'), value: 'all' },
  { label: t('org-scope'), value: 'org' },
  { label: t('app-scope'), value: 'app' },
  { label: t('channel-scope'), value: 'channel' },
]

const filteredBindings = computed(() => {
  let filtered = roleBindings.value

  if (filterScope.value !== 'all') {
    filtered = filtered.filter((b: RoleBinding) => b.scope_type === filterScope.value)
  }

  if (search.value) {
    const searchLower = search.value.toLowerCase()
    filtered = filtered.filter((binding: RoleBinding) => {
      return binding.principal_email?.toLowerCase().includes(searchLower)
        || binding.group_name?.toLowerCase().includes(searchLower)
        || binding.role_name.toLowerCase().includes(searchLower)
        || binding.app_name?.toLowerCase().includes(searchLower)
    })
  }

  return filtered
})

const filteredRoles = computed(() => {
  return availableRoles.value.filter((r: Role) => r.scope_type === assignRoleForm.value.scope_type)
})

const isAssignRoleFormValid = computed(() => {
  return assignRoleForm.value.principal_id !== ''
    && assignRoleForm.value.role_name !== ''
    && (assignRoleForm.value.scope_type === 'org'
      || (assignRoleForm.value.scope_type === 'app' && assignRoleForm.value.app_id !== '')
      || (assignRoleForm.value.scope_type === 'channel' && assignRoleForm.value.app_id !== '' && assignRoleForm.value.channel_id !== ''))
})

async function fetchRoleBindings() {
  if (!currentOrganization.value?.gid)
    return

  isLoading.value = true
  try {
    const { data, error } = await supabase.functions.invoke(`private/role_bindings/${currentOrganization.value.gid}`, {
      method: 'GET',
    })

    if (error)
      throw error

    // Enrich bindings with principal and app names
    const enrichedBindings = await Promise.all(
      data.map(async (binding: RoleBinding) => {
        let principal_email = ''
        let group_name = ''
        let app_name = ''

        if (binding.principal_type === 'user') {
          const { data: userData } = await supabase
            .from('users')
            .select('email')
            .eq('id', binding.principal_id)
            .single()
          principal_email = userData?.email || binding.principal_id
        }
        else if (binding.principal_type === 'group') {
          const { data: groupData } = await supabase.functions.invoke(`private/groups/${binding.principal_id}`, {
            method: 'GET',
          })
          group_name = groupData?.name || binding.principal_id
        }

        if (binding.app_id) {
          const { data: appData } = await supabase
            .from('apps')
            .select('name')
            .eq('id', binding.app_id)
            .single()
          app_name = appData?.name || binding.app_id
        }

        return {
          ...binding,
          principal_email,
          group_name,
          app_name,
        }
      }),
    )

    roleBindings.value = enrichedBindings
  }
  catch (error: any) {
    console.error('Error fetching role bindings:', error)
    toast.error(t('error-fetching-role-bindings'))
  }
  finally {
    isLoading.value = false
  }
}

async function fetchAvailableRoles() {
  try {
    const { data, error } = await supabase.functions.invoke('private/roles', {
      method: 'GET',
    })

    if (error)
      throw error

    availableRoles.value = data || []
  }
  catch (error: any) {
    console.error('Error fetching roles:', error)
  }
}

async function fetchAvailableMembers() {
  if (!currentOrganization.value?.gid)
    return

  try {
    const members = await organizationStore.getMembers()
    availableMembers.value = members.map((m: any) => ({ user_id: m.user_id, email: m.email }))
  }
  catch (error: any) {
    console.error('Error fetching members:', error)
  }
}

async function fetchAvailableGroups() {
  if (!currentOrganization.value?.gid)
    return

  try {
    const { data, error } = await supabase.functions.invoke(`private/groups/${currentOrganization.value.gid}`, {
      method: 'GET',
    })

    if (error)
      throw error

    availableGroups.value = data || []
  }
  catch (error: any) {
    console.error('Error fetching groups:', error)
  }
}

async function fetchAvailableApps() {
  if (!currentOrganization.value?.gid)
    return

  try {
    const { data, error } = await supabase
      .from('apps')
      .select('id, name')
      .eq('owner_org', currentOrganization.value.gid)

    if (error)
      throw error

    availableApps.value = (data || []).filter((app: any) => app.id && app.name) as { id: string, name: string }[]
  }
  catch (error: any) {
    console.error('Error fetching members:', error)
  }
}

function openAssignRoleModal() {
  assignRoleForm.value = {
    principal_type: 'user',
    principal_id: '',
    role_name: '',
    scope_type: 'org',
    app_id: '',
    channel_id: '',
    reason: '',
  }
  isAssignRoleModalOpen.value = true
}

async function assignRole() {
  if (!isAssignRoleFormValid.value || !currentOrganization.value?.gid)
    return

  isLoading.value = true
  try {
    const { error } = await supabase.functions.invoke('private/role_bindings', {
      method: 'POST',
      body: {
        principal_type: assignRoleForm.value.principal_type,
        principal_id: assignRoleForm.value.principal_id,
        role_name: assignRoleForm.value.role_name,
        scope_type: assignRoleForm.value.scope_type,
        org_id: currentOrganization.value.gid,
        app_id: assignRoleForm.value.app_id || null,
        channel_id: assignRoleForm.value.channel_id || null,
        reason: assignRoleForm.value.reason || null,
      },
    })

    if (error)
      throw error

    toast.success(t('role-assigned'))
    isAssignRoleModalOpen.value = false
    await fetchRoleBindings()
  }
  catch (error: any) {
    console.error('Error assigning role:', error)
    if (error?.message?.includes('already has a role')) {
      toast.error(t('error-role-already-assigned'))
    }
    else {
      toast.error(t('error-assigning-role'))
    }
  }
  finally {
    isLoading.value = false
  }
}

async function removeRoleBinding(bindingId: string) {
  dialogStore.openDialog({
    title: t('remove-role'),
    description: t('remove-role-confirm'),
    buttons: [
      { text: t('cancel'), role: 'cancel' },
      { text: t('remove'), role: 'danger' },
    ],
  })
  const wasCanceled = await dialogStore.onDialogDismiss()
  if (wasCanceled || dialogStore.lastButtonRole !== 'danger')
    return

  isLoading.value = true
  try {
    const { error } = await supabase.functions.invoke(`private/role_bindings/${bindingId}`, {
      method: 'DELETE',
    })

    if (error)
      throw error

    toast.success(t('role-removed'))
    await fetchRoleBindings()
  }
  catch (error: any) {
    console.error('Error removing role:', error)
    toast.error(t('error-removing-role'))
  }
  finally {
    isLoading.value = false
  }
}

watch(currentOrganization, async () => {
  await Promise.all([
    fetchRoleBindings(),
    fetchAvailableRoles(),
    fetchAvailableMembers(),
    fetchAvailableGroups(),
    fetchAvailableApps(),
  ])
})

watch(() => assignRoleForm.value.scope_type, () => {
  assignRoleForm.value.app_id = ''
  assignRoleForm.value.channel_id = ''
})

onMounted(async () => {
  await Promise.all([
    fetchRoleBindings(),
    fetchAvailableRoles(),
    fetchAvailableMembers(),
    fetchAvailableGroups(),
    fetchAvailableApps(),
  ])
})
</script>

<template>
  <div class="w-full px-3 py-2">
    <!-- RBAC not enabled message -->
    <div v-if="!useNewRbac" class="alert alert-info mb-4">
      <IconInformation class="size-5" />
      <span>{{ t('rbac-not-enabled-for-org') }}</span>
    </div>

    <!-- Header -->
    <div class="mb-4 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">
          {{ t('role-assignments') }}
        </h1>
        <p class="text-sm text-gray-600">
          {{ t('role-assignments-description') }}
        </p>
      </div>
      <button
        v-if="useNewRbac"
        class="d-btn d-btn-primary"
        @click="openAssignRoleModal"
      >
        <IconPlus class="size-5" />
        {{ t('assign-role') }}
      </button>
    </div>

    <!-- Filters -->
    <div v-if="useNewRbac" class="mb-4 flex gap-4">
      <input
        v-model="search"
        type="text"
        :placeholder="t('search-role-bindings')"
        class="d-input flex-1 max-w-md"
      >
      <select v-model="filterScope" class="d-select">
        <option v-for="option in scopeOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </div>

    <!-- Role bindings table -->
    <Table
      v-if="useNewRbac"
      :columns="columns"
      :element-list="filteredBindings"
      :total="filteredBindings.length"
      :is-loading="isLoading"
      :current-page="currentPage"
      @update:current-page="currentPage = $event"
    >
      <template #principal="{ row }">
        <div class="flex flex-col">
          <span class="font-medium">
            {{ row.principal_type === 'user' ? row.principal_email : row.group_name }}
          </span>
          <span class="text-xs text-gray-500">
            {{ row.principal_type }}
          </span>
        </div>
      </template>

      <template #role="{ row }">
        <div class="flex items-center gap-2">
          <IconShield class="size-5 text-primary" />
          <div class="flex flex-col">
            <span class="font-medium">{{ row.role_name }}</span>
            <span class="text-xs text-gray-500">{{ row.role_description }}</span>
          </div>
        </div>
      </template>

      <template #scope="{ row }">
        <div class="flex flex-col">
          <span
            class="badge badge-sm" :class="{
              'badge-primary': row.scope_type === 'org',
              'badge-secondary': row.scope_type === 'app',
              'badge-accent': row.scope_type === 'channel',
            }"
          >
            {{ row.scope_type }}
          </span>
          <span v-if="row.app_name" class="mt-1 text-xs text-gray-600">
            {{ row.app_name }}
          </span>
        </div>
      </template>

      <template #granted_at="{ row }">
        <span class="text-sm text-gray-600">
          {{ new Date(row.granted_at).toLocaleDateString() }}
        </span>
      </template>

      <template #actions="{ row }">
        <button
          class="d-btn d-btn-sm d-btn-ghost text-error"
          :title="t('remove')"
          @click="removeRoleBinding(row.id)"
        >
          <IconTrash class="size-4" />
        </button>
      </template>
    </Table>

    <!-- Assign Role Modal -->
    <dialog :open="isAssignRoleModalOpen" class="modal" @close="isAssignRoleModalOpen = false">
      <div class="modal-box max-w-2xl">
        <h3 class="text-lg font-bold">
          {{ t('assign-role') }}
        </h3>

        <!-- Principal Type -->
        <div class="form-control mt-4">
          <label class="label">
            <span class="label-text">{{ t('principal-type') }}</span>
          </label>
          <select v-model="assignRoleForm.principal_type" class="d-select">
            <option value="user">
              {{ t('user') }}
            </option>
            <option value="group">
              {{ t('group') }}
            </option>
          </select>
        </div>

        <!-- Principal Selection -->
        <div class="form-control mt-4">
          <label class="label">
            <span class="label-text">
              {{ assignRoleForm.principal_type === 'user' ? t('select-user') : t('select-group') }}
            </span>
          </label>
          <select v-model="assignRoleForm.principal_id" class="d-select" required>
            <option value="">
              {{ assignRoleForm.principal_type === 'user' ? t('select-user') : t('select-group') }}
            </option>
            <template v-if="assignRoleForm.principal_type === 'user'">
              <option
                v-for="member in availableMembers"
                :key="member.user_id"
                :value="member.user_id"
              >
                {{ member.email }}
              </option>
            </template>
            <template v-else>
              <option
                v-for="group in availableGroups"
                :key="group.id"
                :value="group.id"
              >
                {{ group.name }}
              </option>
            </template>
          </select>
        </div>

        <!-- Scope Type -->
        <div class="form-control mt-4">
          <label class="label">
            <span class="label-text">{{ t('scope-type') }}</span>
          </label>
          <select v-model="assignRoleForm.scope_type" class="d-select">
            <option value="org">
              {{ t('org-scope') }}
            </option>
            <option value="app">
              {{ t('app-scope') }}
            </option>
            <option value="channel">
              {{ t('channel-scope') }}
            </option>
          </select>
        </div>

        <!-- App Selection (if app or channel scope) -->
        <div v-if="assignRoleForm.scope_type === 'app' || assignRoleForm.scope_type === 'channel'" class="form-control mt-4">
          <label class="label">
            <span class="label-text">{{ t('select-app') }}</span>
          </label>
          <select v-model="assignRoleForm.app_id" class="d-select" required>
            <option value="">
              {{ t('select-app') }}
            </option>
            <option v-for="app in availableApps" :key="app.id" :value="app.id">
              {{ app.name }}
            </option>
          </select>
        </div>

        <!-- Role Selection -->
        <div class="form-control mt-4">
          <label class="label">
            <span class="label-text">{{ t('select-role') }}</span>
          </label>
          <select v-model="assignRoleForm.role_name" class="d-select" required>
            <option value="">
              {{ t('select-role') }}
            </option>
            <option v-for="role in filteredRoles" :key="role.id" :value="role.name">
              {{ role.name }} - {{ role.description }}
            </option>
          </select>
        </div>

        <!-- Reason (optional) -->
        <div class="form-control mt-4">
          <label class="label">
            <span class="label-text">{{ t('reason-optional') }}</span>
          </label>
          <textarea
            v-model="assignRoleForm.reason"
            :placeholder="t('reason-placeholder')"
            class="d-textarea"
            rows="2"
          />
        </div>

        <div class="modal-action">
          <button class="d-btn" @click="isAssignRoleModalOpen = false">
            {{ t('cancel') }}
          </button>
          <button
            class="d-btn d-btn-primary"
            :disabled="!isAssignRoleFormValid || isLoading"
            @click="assignRole"
          >
            {{ t('assign') }}
          </button>
        </div>
      </div>
      <div class="modal-backdrop" @click="isAssignRoleModalOpen = false" />
    </dialog>
  </div>
</template>
