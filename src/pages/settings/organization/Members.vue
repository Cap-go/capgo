<script setup lang="ts">
import type { TableColumn } from '~/components/comp_def'
import type { ExtendedOrganizationMember, ExtendedOrganizationMembers } from '~/stores/organization'
import type { Database } from '~/types/supabase.types'
import { useI18n } from 'petite-vue-i18n'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
// Import actual components instead of raw svg
import IconTrash from '~icons/heroicons/trash'
import IconWrench from '~icons/heroicons/wrench'

import Table from '~/components/Table.vue'
import { useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'
import { hasExactlyOneMatch } from '~/utils/arrayUtils.ts'

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
            ? `<img src="${member.image_url}" alt="Profile picture for ${member.email}" class="rounded-sm shrink-0 mask mask-squircle" width="42" height="42">`
            : `<div class="flex items-center justify-center w-10 h-10 text-xl bg-gray-700 mask mask-squircle shrink-0"><span class="font-medium text-gray-300">${acronym(member.email)}</span></div>`
        }
        <span class="ml-2 hidden sm:inline truncate">${member.email}</span>
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
    key: 'actions',
    label: t('actions'),
    mobile: true,
    actions: computed(() => [
      {
        icon: IconWrench,
        visible: (member: ExtendedOrganizationMember) => canEdit(member),
        onClick: (member: ExtendedOrganizationMember) => {
          changeMemberPermission(member)
        },
      },
      {
        icon: IconTrash,
        visible: (member: ExtendedOrganizationMember) => canDelete(member),
        onClick: (member: ExtendedOrganizationMember) => {
          deleteMember(member)
        },
      },
    ]).value,
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

    handleSendInvitationOutput(data, email, type)
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

function handleSendInvitationOutput(output: string, email: string, type: Database['public']['Enums']['user_min_right']) {
  console.log('Output: ', output)
  if (!output)
    return
  switch (output) {
    case 'OK': {
      toast.success(t('org-invited-user'))
      break
    }
    case 'TOO_RECENT_INVITATION_CANCELATION': {
      displayStore.dialogOption = {
        header: t('error'),
        message: t('too-recent-invitation-cancelation'),
        buttons: [
          {
            text: t('ok'),
            role: 'ok',
          },
        ],
      }
      displayStore.showDialog = true
      break
    }
    case 'NO_EMAIL': {
      const captchaKey = import.meta.env.VITE_CAPTCHA_KEY
      if (captchaKey) {
        displayStore.showInviteNewUserWithoutAccountDialog = {
          email,
          role: type,
          orgId: currentOrganization.value?.gid ?? '',
          refreshFunction: reloadData,
        }
      }
      else {
        toast.error(t('cannot_invite_user_without_account'))
      }
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

async function rescindInvitation(email: string) {
  const { data, error } = await supabase.rpc('rescind_invitation', {
    email,
    org_id: currentOrganization.value?.gid ?? '',
  })

  if (error) {
    console.error('Error rescinding invitation: ', error)
    toast.error(`${t('cannot-rescind-invitation')}`)
    return
  }

  if (!error && data) {
    // Handle different response codes from the rescind_invitation function
    switch (data) {
      case 'OK':
        // Success is handled in the calling function
        toast.success(t('invitation-rescinded'))
        await reloadData()
        break
      default:
        toast.warning(`${t('unexpected-rescind-response')}: ${data}`)
    }
  }

  return error
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

async function cannotDeleteOwner() {
  displayStore.dialogOption = {
    header: t('alert-cannot-delete-owner-title'),
    message: `${t('alert-cannot-delete-owner-body')}`,
    buttons: [
      {
        text: t('ok'),
        role: 'ok',
        id: 'confirm-button',
      },
    ],
  }
  displayStore.showDialog = true
  const didCancel = await displayStore.onDialogDismiss()
  return didCancel
}

async function deleteMember(member: ExtendedOrganizationMember) {
  if (hasExactlyOneMatch(members.value, 'role', m => m.role === 'super_admin' && m.uid === member.uid)) {
    await cannotDeleteOwner()
    return
  }

  else if (await didCancel()) {
    console.log('Member deletion cancelled.')
    return
  }

  else if (member.aid === 0) {
    toast.error(t('cannot-delete-owner'))
    return
  }

  isLoading.value = true
  try {
    if (member.is_tmp) {
      // Handle invitation rescinding for temporary users
      await rescindInvitation(member.email)
    }
    else {
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
    if (member.is_tmp) {
      // Handle modifying permissions for temporary users
      const { data, error } = await supabase.rpc('modify_permissions_tmp', {
        email: member.email,
        org_id: currentOrganization.value?.gid ?? '',
        new_role: perm,
      })

      if (error) {
        console.error('Error changing permission for invitation: ', error)
        toast.error(`${t('cannot-change-permission')}: ${error.message}`)
        return
      }

      // Handle response codes
      switch (data) {
        case 'OK':
          toast.success(t('permission-changed'))
          break
        default:
          toast.warning(`${t('unexpected-response')}: ${data}`)
      }

      await reloadData()
    }
    else {
      // Handle regular users as before
      const { error } = await supabase.from('org_users').update({ user_right: perm }).eq('id', member.aid)
      if (error) {
        console.error('Error changing permission: ', error)
        toast.error(`${t('cannot-change-permission')}: ${error.message}`)
        return
      }

      toast.success(t('permission-changed'))
      await reloadData()
    }
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
  if (!role || !currentUserId)
    return false

  const isSelf = member.uid === currentUserId

  if (isSelf)
    return true

  const currentUserIsAdmin = role === 'admin' || role === 'super_admin'

  return currentUserIsAdmin
}
</script>

<template>
  <div>
    <div class="h-full md:p-8 overflow-hidden max-h-fit grow md:pb-0">
      <div class="flex justify-between w-full ml-2 md:ml-0 mb-5">
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
