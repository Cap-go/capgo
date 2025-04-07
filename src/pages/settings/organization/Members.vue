<script setup lang="ts">
import type { TableColumn } from '~/components/comp_def'
import type { ExtendedOrganizationMember, ExtendedOrganizationMembers } from '~/stores/organization'
import type { Database } from '~/types/supabase.types'
import { useI18n } from 'petite-vue-i18n'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import Trash from '~icons/heroicons/trash?raw'

import Wrench from '~icons/heroicons/wrench?raw'
import Table from '~/components/Table.vue'
import { useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'

const { t } = useI18n()
const displayStore = useDisplayStore()
const organizationStore = useOrganizationStore()
const { currentOrganization } = storeToRefs(organizationStore)
const supabase = useSupabase()
const main = useMainStore()
const search = ref('')
const columns: Ref<TableColumn[]> = ref<TableColumn[]>([])
const isLoading = ref(false)
const currentPage = ref(1)

const members = ref([] as ExtendedOrganizationMembers)

const filteredMembers = computed(() => {
  if (!search.value)
    return members.value

  const searchLower = search.value.toLowerCase()
  return members.value.filter((member) => {
    const emailMatch = member.email.toLowerCase().includes(searchLower)
    return emailMatch
  })
})

columns.value = [
  {
    label: t('member'),
    key: 'email',
    mobile: true,
    sortable: true,
    head: true,
    displayFunction: (member: ExtendedOrganizationMember) => `
      <div class="flex items-center">
        ${member.image_url
            ? `<img src="${member.image_url}" alt="Profile picture for ${member.email}" class="mr-2 rounded-sm shrink-0 sm:mr-3 mask mask-squircle" width="42" height="42">`
            : `<div class="flex items-center justify-center w-10 h-10 mr-2 text-xl bg-gray-700 mask mask-squircle"><span class="font-medium text-gray-300">${acronym(member.email)}</span></div>`
        }
        <span>${member.email}</span>
      </div>`,
    allowHtml: true,
    sanitizeHtml: true,
  },
  {
    label: t('role'),
    key: 'role',
    mobile: true,
    sortable: 'desc',
    displayFunction: (member: ExtendedOrganizationMember) => member.role.replaceAll('_', ' '),
  },
  {
    label: '',
    key: 'edit_action',
    mobile: true,
    class: 'text-center',
    displayFunction: (member: ExtendedOrganizationMember) => {
      return canEdit(member) ? Wrench : ''
    },
    allowHtml: true,
    onClick: (member: ExtendedOrganizationMember) => {
      if (canEdit(member)) {
        changeMemberPermission(member)
      }
    },
  },
  {
    label: '',
    key: 'delete_action',
    mobile: true,
    class: 'text-center text-red-500',
    displayFunction: (member: ExtendedOrganizationMember) => {
      return canDelete(member) ? Trash : ''
    },
    allowHtml: true,
    onClick: (member: ExtendedOrganizationMember) => {
      if (canDelete(member)) {
        deleteMember(member)
      }
    },
  },
]

async function reloadData() {
  isLoading.value = true
  try {
    members.value = await organizationStore.getMembers()
  }
  catch (error) {
    console.error('Error reloading members:', error)
    toast.error(t('error-fetching-members'))
  }
  finally {
    isLoading.value = false
  }
}

watch(currentOrganization, reloadData)

onMounted(reloadData)

function validateEmail(email: string) {
  return String(email)
    .toLowerCase()
    .match(
      /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\])|(([a-z\-0-9]+\.)+[a-z]{2,}))$/i,
    )
}

async function showPermModal(invite: boolean): Promise<Database['public']['Enums']['user_min_right'] | undefined> {
  let permision: Database['public']['Enums']['user_min_right'] | undefined
  displayStore.dialogOption = {
    header: t('select-user-perms'),
    message: t('select-user-perms-expanded'),
    size: 'max-w-fit',
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('key-read'),
        role: 'read',
        handler: () => permision = invite ? 'invite_read' : 'read',
      },
      {
        text: t('key-upload'),
        role: 'upload',
        handler: () => permision = invite ? 'invite_upload' : 'upload',
      },
      {
        text: t('key-write'),
        role: 'write',
        handler: () => permision = invite ? 'invite_write' : 'write',
      },
      {
        text: t('key-admin'),
        role: 'admin',
        handler: () => permision = invite ? 'invite_admin' : 'admin',
      },
      ...(isSuperAdmin()
        ? [{
            text: t('key-super-admin'),
            role: 'super_admin',
            handler: () => permision = invite ? 'invite_super_admin' : 'super_admin',
          }]
        : []),
    ],
  }
  displayStore.showDialog = true
  await displayStore.onDialogDismiss()
  return permision
}

async function showInviteModal() {
  if (!currentOrganization.value || (!organizationStore.hasPermisisonsInRole(organizationStore.currentRole, ['admin', 'super_admin']))) {
    toast.error(t('no-permission'))
    return
  }

  let permisionPromise: Promise<Database['public']['Enums']['user_min_right'] | undefined> | undefined
  let email: string | undefined

  displayStore.dialogOption = {
    header: t('insert-invite-email'),
    input: true,
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('button-invite'),
        id: 'confirm-button',
        handler: async () => {
          email = displayStore.dialogInputText

          if (!email) {
            toast.error(t('missing-email'))
            return
          }

          if (!validateEmail(email)) {
            toast.error(t('invalid-email'))
            return
          }

          permisionPromise = showPermModal(true)
        },
      },
    ],
  }
  displayStore.showDialog = true
  await displayStore.onDialogDismiss()
  const permision = permisionPromise ? await permisionPromise : undefined

  if (!permision || !email)
    return

  await sendInvitation(email, permision)
}

async function sendInvitation(email: string, type: Database['public']['Enums']['user_min_right']) {
  console.log(`Invite ${email} with perm ${type}`)

  const orgId = currentOrganization.value?.gid
  if (!orgId) {
    toast.error('Organization ID not found.')
    return
  }

  isLoading.value = true
  try {
    const { data, error } = await supabase.rpc('invite_user_to_org', {
      email,
      org_id: orgId,
      invite_type: type,
    })

    if (error) {
      console.error('Error inviting user:', error)
      toast.error(`${t('error-inviting-user')}: ${error.message}`)
      return
    }

    handleSendInvitationOutput(data)
    await reloadData()
  }
  catch (error) {
    console.error('Invitation failed:', error)
    toast.error(t('invitation-failed'))
  }
  finally {
    isLoading.value = false
  }
}

function handleSendInvitationOutput(output: string | null | undefined) {
  console.log('Output: ', output)
  if (!output)
    return
  switch (output) {
    case 'OK': {
      toast.success(t('org-invited-user'))
      break
    }
    case 'NO_EMAIL': {
      toast.error(t('please-ask-the-user-to-create-account-first'))
      break
    }
    case 'ALREADY_INVITED': {
      toast.error(t('user-already-invited'))
      break
    }
    case 'CAN_NOT_INVITE_OWNER': {
      toast.error(t('cannot-invite-owner'))
      break
    }
    default:
      toast.warning(`${t('unexpected-invitation-response')}: ${output}`)
  }
}

async function didCancel() {
  displayStore.dialogOption = {
    header: t('alert-confirm-delete'),
    message: `${t('alert-not-reverse-message')} ${t('alert-delete-message')}?`,
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
  const didCancel = await displayStore.onDialogDismiss()
  return didCancel
}

async function deleteMember(member: ExtendedOrganizationMember) {
  if (await didCancel()) {
    console.log('Member deletion cancelled.')
    return
  }

  if (member.aid === 0) {
    toast.error(t('cannot-delete-owner'))
    return
  }

  isLoading.value = true
  try {
    const { error } = await supabase.from('org_users').delete().eq('id', member.aid)
    if (error) {
      console.error('Error deleting member: ', error)
      toast.error(`${t('cannot-delete-member')}: ${error.message}`)
      return
    }

    toast.success(t('member-deleted'))

    if (member.uid === main.user?.id) {
      console.log('Current user deleted themselves from the org.')
      await organizationStore.fetchOrganizations()
      organizationStore.setCurrentOrganizationToMain()
    }
    else {
      await reloadData()
    }
  }
  catch (error) {
    console.error('Deletion failed:', error)
    toast.error(t('deletion-failed'))
  }
  finally {
    isLoading.value = false
  }
}

async function changeMemberPermission(member: ExtendedOrganizationMember) {
  const perm = await showPermModal(member.role.includes('invite'))

  if (!perm) {
    console.log('Permission change cancelled.')
    return
  }

  isLoading.value = true
  try {
    const { error } = await supabase.from('org_users').update({ user_right: perm }).eq('id', member.aid)
    if (error) {
      console.error('Error changing permission: ', error)
      toast.error(`${t('cannot-change-permission')}: ${error.message}`)
      return
    }

    toast.success(t('permission-changed'))
    await reloadData()
  }
  catch (error) {
    console.error('Permission change failed:', error)
    toast.error(t('permission-change-failed'))
  }
  finally {
    isLoading.value = false
  }
}

function acronym(email: string) {
  let res = 'NA'
  const prefix = email?.split('@')[0]
  if (!prefix)
    return res

  if (prefix.length > 2 && prefix.includes('.')) {
    const parts = prefix.split('.')
    const firstName = parts[0]
    const lastName = parts[1]
    if (firstName && lastName) {
      res = (firstName[0] + lastName[0]).toUpperCase()
    }
  }
  else if (prefix.length >= 2) {
    res = (prefix[0] + prefix[1]).toUpperCase()
  }
  else if (prefix.length === 1) {
    res = (`${prefix[0]}X`).toUpperCase()
  }
  return res
}

function canEdit(member: ExtendedOrganizationMember) {
  const role = organizationStore.currentRole
  if (!role)
    return false
  return (organizationStore.hasPermisisonsInRole(role, ['admin', 'super_admin'])) && (member.uid !== currentOrganization?.value?.created_by)
}
function isSuperAdmin() {
  const role = organizationStore.currentRole
  if (!role)
    return false
  return organizationStore.hasPermisisonsInRole(role, ['super_admin'])
}
function canDelete(member: ExtendedOrganizationMember) {
  const role = organizationStore.currentRole
  const currentUserId = main.user?.id
  const ownerId = currentOrganization?.value?.created_by
  if (!role || !currentUserId || !ownerId)
    return false

  const isSelf = member.uid === currentUserId
  const isOwner = member.uid === ownerId

  if (isOwner)
    return false

  if (isSelf)
    return true

  const currentUserIsOwner = currentUserId === ownerId
  const currentUserIsAdmin = role === 'admin' || role === 'super_admin'

  return currentUserIsOwner || currentUserIsAdmin
}
</script>

<template>
  <div>
    <div class="h-full p-8 overflow-hidden max-h-fit grow md:pb-0">
      <div class="flex justify-between w-full mb-5">
        <h2 class="text-2xl font-bold text-slate-800 dark:text-white">
          {{ t('members') }}
        </h2>
      </div>
      <Table
        v-model:columns="columns"
        v-model:current-page="currentPage"
        v-model:search="search"
        show-add
        :total="filteredMembers.length"
        :element-list="filteredMembers"
        :search-placeholder="t('search-by-name-or-email')"
        :is-loading="isLoading"
        @reload="reloadData"
        @add="showInviteModal"
        @update:search="search = $event"
        @update:current-page="currentPage = $event"
        @update:columns="columns = $event"
      />
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
</route>
