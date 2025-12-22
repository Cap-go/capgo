<script setup lang="ts">
import type { TableColumn } from '~/components/comp_def'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import IconInformation from '~icons/heroicons/information-circle'
import IconPencil from '~icons/heroicons/pencil'
import IconPlus from '~icons/heroicons/plus'
import IconTrash from '~icons/heroicons/trash'
import IconUsers from '~icons/heroicons/users'
import Table from '~/components/Table.vue'
import { useSupabase } from '~/services/supabase'
import { useDialogV2Store } from '~/stores/dialogv2'
import { useDisplayStore } from '~/stores/display'
import { useOrganizationStore } from '~/stores/organization'

const { t } = useI18n()
const organizationStore = useOrganizationStore()
const { currentOrganization } = storeToRefs(organizationStore)
const supabase = useSupabase()
const dialogStore = useDialogV2Store()
const displayStore = useDisplayStore()
displayStore.NavTitle = t('groups')

interface Group {
  id: string
  name: string
  description: string | null
  is_system: boolean
  created_at: string
  member_count?: number
}

interface GroupMember {
  user_id: string
  email: string
  added_at: string
}

const isLoading = ref(false)
const groups = ref<Group[]>([])
const search = ref('')
const currentPage = ref(1)

// Create/Edit group modal state
const isGroupModalOpen = ref(false)
const editingGroup = ref<Group | null>(null)
const groupForm = ref({
  name: '',
  description: '',
})

// Members modal state
const isMembersModalOpen = ref(false)
const selectedGroup = ref<Group | null>(null)
const groupMembers = ref<GroupMember[]>([])
const availableMembers = ref<{ user_id: string, email: string }[]>([])
const selectedMemberToAdd = ref('')
const isLoadingMembers = ref(false)

const columns: Ref<TableColumn[]> = ref<TableColumn[]>([
  {
    key: 'name',
    sortable: false,
    label: t('name'),
  },
  {
    key: 'description',
    sortable: false,
    label: t('description'),
  },
  {
    key: 'member_count',
    sortable: false,
    label: t('members'),
  },
  {
    key: 'actions',
    sortable: false,
    label: t('actions'),
  },
])

const filteredGroups = computed(() => {
  if (!search.value)
    return groups.value

  const searchLower = search.value.toLowerCase()
  return groups.value.filter((group: Group) => {
    return group.name.toLowerCase().includes(searchLower)
      || group.description?.toLowerCase().includes(searchLower)
  })
})

const isGroupFormValid = computed(() => {
  return groupForm.value.name.trim() !== ''
})

const isRbacEnabled = computed(() => {
  return !!(currentOrganization.value as any)?.use_new_rbac
})

async function fetchGroups() {
  if (!currentOrganization.value?.gid)
    return

  isLoading.value = true
  try {
    const { data, error } = await supabase.functions.invoke(`private/groups/${currentOrganization.value.gid}`, {
      method: 'GET',
    })

    if (error)
      throw error

    // Fetch member counts for each group
    const groupsWithCounts = await Promise.all(
      data.map(async (group: Group) => {
        const { data: membersData } = await supabase.functions.invoke(`private/groups/${group.id}/members`, {
          method: 'GET',
        })
        return {
          ...group,
          member_count: membersData?.length || 0,
        }
      }),
    )

    groups.value = groupsWithCounts
  }
  catch (error: any) {
    console.error('Error fetching groups:', error)
    toast.error(t('error-fetching-groups'))
  }
  finally {
    isLoading.value = false
  }
}

function openCreateModal() {
  editingGroup.value = null
  groupForm.value = {
    name: '',
    description: '',
  }
  isGroupModalOpen.value = true
}

function openEditModal(group: Group) {
  if (group.is_system) {
    toast.error(t('cannot-edit-system-group'))
    return
  }

  editingGroup.value = group
  groupForm.value = {
    name: group.name,
    description: group.description || '',
  }
  isGroupModalOpen.value = true
}

async function saveGroup() {
  if (!isGroupFormValid.value || !currentOrganization.value?.gid)
    return

  isLoading.value = true
  try {
    if (editingGroup.value) {
      // Update existing group
      const { error } = await supabase.functions.invoke(`private/groups/${editingGroup.value.id}`, {
        method: 'PUT',
        body: {
          name: groupForm.value.name,
          description: groupForm.value.description || null,
        },
      })

      if (error)
        throw error

      toast.success(t('group-updated'))
    }
    else {
      // Create new group
      const { error } = await supabase.functions.invoke(`private/groups/${currentOrganization.value.gid}`, {
        method: 'POST',
        body: {
          name: groupForm.value.name,
          description: groupForm.value.description || null,
        },
      })

      if (error)
        throw error

      toast.success(t('group-created'))
    }

    isGroupModalOpen.value = false
    await fetchGroups()
  }
  catch (error: any) {
    console.error('Error saving group:', error)
    toast.error(editingGroup.value ? t('error-updating-group') : t('error-creating-group'))
  }
  finally {
    isLoading.value = false
  }
}

async function deleteGroup(group: Group) {
  if (group.is_system) {
    toast.error(t('cannot-delete-system-group'))
    return
  }

  dialogStore.openDialog({
    title: t('delete-group'),
    description: t('delete-group-confirm', { name: group.name }),
    buttons: [
      { text: t('cancel'), role: 'cancel' },
      { text: t('delete'), role: 'danger' },
    ],
  })
  const wasCanceled = await dialogStore.onDialogDismiss()
  if (wasCanceled || dialogStore.lastButtonRole !== 'danger')
    return

  isLoading.value = true
  try {
    const { error } = await supabase.functions.invoke(`private/groups/${group.id}`, {
      method: 'DELETE',
    })

    if (error)
      throw error

    toast.success(t('group-deleted'))
    await fetchGroups()
  }
  catch (error: any) {
    console.error('Error deleting group:', error)
    toast.error(t('error-deleting-group'))
  }
  finally {
    isLoading.value = false
  }
}

async function openMembersModal(group: Group) {
  selectedGroup.value = group
  isMembersModalOpen.value = true
  await fetchGroupMembers(group.id)
  await fetchAvailableMembers()
}

async function fetchGroupMembers(groupId: string) {
  isLoadingMembers.value = true
  try {
    const { data, error } = await supabase.functions.invoke(`private/groups/${groupId}/members`, {
      method: 'GET',
    })

    if (error)
      throw error

    groupMembers.value = data || []
  }
  catch (error: any) {
    console.error('Error fetching group members:', error)
    toast.error(t('error-fetching-members'))
  }
  finally {
    isLoadingMembers.value = false
  }
}

async function fetchAvailableMembers() {
  if (!currentOrganization.value?.gid)
    return

  try {
    // Fetch all org members
    const members = await organizationStore.getMembers()

    // Filter out members already in the group
    const memberIds = new Set(groupMembers.value.map((m: any) => m.user_id))
    availableMembers.value = members
      .filter((m: any) => !memberIds.has(m.user_id))
      .map((m: any) => ({ user_id: m.user_id, email: m.email }))
  }
  catch (error: any) {
    console.error('Error fetching available members:', error)
  }
}

async function addMemberToGroup() {
  if (!selectedMemberToAdd.value || !selectedGroup.value)
    return

  isLoadingMembers.value = true
  try {
    const { error } = await supabase.functions.invoke(`private/groups/${selectedGroup.value.id}/members`, {
      method: 'POST',
      body: {
        user_id: selectedMemberToAdd.value,
      },
    })

    if (error)
      throw error

    toast.success(t('member-added-to-group'))
    selectedMemberToAdd.value = ''
    await fetchGroupMembers(selectedGroup.value.id)
    await fetchAvailableMembers()
    await fetchGroups() // Update member counts
  }
  catch (error: any) {
    console.error('Error adding member to group:', error)
    toast.error(t('error-adding-member'))
  }
  finally {
    isLoadingMembers.value = false
  }
}

async function removeMemberFromGroup(userId: string) {
  if (!selectedGroup.value)
    return

  dialogStore.openDialog({
    title: t('remove-member'),
    description: t('remove-member-confirm'),
    buttons: [
      { text: t('cancel'), role: 'cancel' },
      { text: t('remove'), role: 'danger' },
    ],
  })
  const wasCanceled = await dialogStore.onDialogDismiss()
  if (wasCanceled || dialogStore.lastButtonRole !== 'danger')
    return

  isLoadingMembers.value = true
  try {
    const { error } = await supabase.functions.invoke(`private/groups/${selectedGroup.value.id}/members/${userId}`, {
      method: 'DELETE',
    })

    if (error)
      throw error

    toast.success(t('member-removed'))
    await fetchGroupMembers(selectedGroup.value.id)
    await fetchAvailableMembers()
    await fetchGroups() // Update member counts
  }
  catch (error: any) {
    console.error('Error removing member:', error)
    toast.error(t('error-removing-member'))
  }
  finally {
    isLoadingMembers.value = false
  }
}

watch(currentOrganization, async () => {
  await fetchGroups()
})

onMounted(async () => {
  await fetchGroups()
})
</script>

<template>
  <div>
    <div class="flex flex-col h-full pb-8 overflow-hidden overflow-y-auto bg-white border shadow-lg md:pb-0 max-h-fit grow md:rounded-lg dark:bg-gray-800 border-slate-300 dark:border-slate-900">
      <div class="p-6 space-y-6">
        <!-- RBAC not enabled message -->
        <div v-if="!isRbacEnabled" class="alert alert-info">
          <IconInformation class="size-5" />
          <span>{{ t('rbac-not-enabled-for-org') }}</span>
        </div>

        <template v-else>
          <!-- Header -->
          <div class="flex items-center justify-between">
            <div>
              <h2 class="mb-2 text-2xl font-bold dark:text-white text-slate-800">
                {{ t('groups') }}
              </h2>
              <p class="text-sm dark:text-gray-100 text-gray-600">
                {{ t('groups-description') }}
              </p>
            </div>
            <button
              class="d-btn d-btn-primary"
              @click="openCreateModal"
            >
              <IconPlus class="size-5" />
              {{ t('create-group') }}
            </button>
          </div>

          <!-- Search -->
          <div class="mb-4">
            <input
              v-model="search"
              type="text"
              :placeholder="t('search-groups')"
              class="d-input w-full max-w-md"
            >
          </div>

          <!-- Groups table -->
          <Table
            :columns="columns"
            :element-list="filteredGroups"
            :total="filteredGroups.length"
            :is-loading="isLoading"
            :current-page="currentPage"
            @update:current-page="currentPage = $event"
          >
            <template #name="{ row }">
              <div class="flex items-center gap-2">
                <IconUsers class="size-5 text-gray-500" />
                <span class="font-medium">{{ row.name }}</span>
                <span v-if="row.is_system" class="badge badge-sm badge-neutral">
                  {{ t('system') }}
                </span>
              </div>
            </template>

            <template #description="{ row }">
              <span class="text-sm text-gray-600">
                {{ row.description || t('no-description') }}
              </span>
            </template>

            <template #member_count="{ row }">
              <span class="badge badge-neutral">
                {{ row.member_count || 0 }}
              </span>
            </template>

            <template #actions="{ row }">
              <div class="flex gap-2">
                <button
                  class="d-btn d-btn-sm d-btn-ghost"
                  :title="t('manage-members')"
                  @click="openMembersModal(row)"
                >
                  <IconUsers class="size-4" />
                </button>
                <button
                  v-if="!row.is_system"
                  class="d-btn d-btn-sm d-btn-ghost"
                  :title="t('edit')"
                  @click="openEditModal(row)"
                >
                  <IconPencil class="size-4" />
                </button>
                <button
                  v-if="!row.is_system"
                  class="d-btn d-btn-sm d-btn-ghost text-error"
                  :title="t('delete')"
                  @click="deleteGroup(row)"
                >
                  <IconTrash class="size-4" />
                </button>
              </div>
            </template>
          </table>
        </template>

        <!-- Create/Edit Group Modal -->
        <dialog :open="isGroupModalOpen" class="modal" @close="isGroupModalOpen = false">
          <div class="modal-box">
            <h3 class="text-lg font-bold">
              {{ editingGroup ? t('edit-group') : t('create-group') }}
            </h3>

            <div class="form-control mt-4">
              <label class="label">
                <span class="label-text">{{ t('group-name') }}</span>
              </label>
              <input
                v-model="groupForm.name"
                type="text"
                :placeholder="t('group-name-placeholder')"
                class="d-input"
                required
              >
            </div>

            <div class="form-control mt-4">
              <label class="label">
                <span class="label-text">{{ t('description') }}</span>
              </label>
              <textarea
                v-model="groupForm.description"
                :placeholder="t('description-placeholder')"
                class="d-textarea"
                rows="3"
              />
            </div>

            <div class="modal-action">
              <button class="d-btn" @click="isGroupModalOpen = false">
                {{ t('cancel') }}
              </button>
              <button
                class="d-btn d-btn-primary"
                :disabled="!isGroupFormValid || isLoading"
                @click="saveGroup"
              >
                {{ editingGroup ? t('update') : t('create') }}
              </button>
            </div>
          </div>
          <div class="modal-backdrop" @click="isGroupModalOpen = false" />
        </dialog>

        <!-- Group Members Modal -->
        <dialog :open="isMembersModalOpen" class="modal" @close="isMembersModalOpen = false">
          <div class="modal-box max-w-2xl">
            <h3 class="text-lg font-bold">
              {{ t('group-members') }} - {{ selectedGroup?.name }}
            </h3>

            <!-- Add member section -->
            <div class="mt-4 rounded-lg bg-base-200 p-4">
              <h4 class="mb-2 font-semibold">
                {{ t('add-member') }}
              </h4>
              <div class="flex gap-2">
                <select
                  v-model="selectedMemberToAdd"
                  class="d-select flex-1"
                  :disabled="availableMembers.length === 0"
                >
                  <option value="">
                    {{ availableMembers.length === 0 ? t('no-available-members') : t('select-member') }}
                  </option>
                  <option v-for="member in availableMembers" :key="member.user_id" :value="member.user_id">
                    {{ member.email }}
                  </option>
                </select>
                <button
                  class="d-btn d-btn-primary"
                  :disabled="!selectedMemberToAdd || isLoadingMembers"
                  @click="addMemberToGroup"
                >
                  <IconPlus class="size-4" />
                  {{ t('add') }}
                </button>
              </div>
            </div>

            <!-- Members list -->
            <div class="mt-4">
              <h4 class="mb-2 font-semibold">
                {{ t('current-members') }} ({{ groupMembers.length }})
              </h4>

              <div v-if="isLoadingMembers" class="flex justify-center py-8">
                <span class="loading loading-spinner loading-lg" />
              </div>

              <div v-else-if="groupMembers.length === 0" class="py-8 text-center text-gray-500">
                {{ t('no-members-in-group') }}
              </div>

              <div v-else class="space-y-2">
                <div
                  v-for="member in groupMembers"
                  :key="member.user_id"
                  class="flex items-center justify-between rounded-lg bg-base-200 p-3"
                >
                  <div>
                    <div class="font-medium">
                      {{ member.email }}
                    </div>
                    <div class="text-xs text-gray-500">
                      {{ t('added') }}: {{ new Date(member.added_at).toLocaleDateString() }}
                    </div>
                  </div>
                  <button
                    class="d-btn d-btn-sm d-btn-ghost text-error"
                    @click="removeMemberFromGroup(member.user_id)"
                  >
                    <IconTrash class="size-4" />
                  </button>
                </div>
              </div>
            </div>

            <div class="modal-action">
              <button class="d-btn" @click="isMembersModalOpen = false">
                {{ t('close') }}
              </button>
            </div>
          </div>
          <div class="modal-backdrop" @click="isMembersModalOpen = false" />
        </dialog>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
</route>
