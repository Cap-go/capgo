<script setup lang="ts">
import type VueTurnstile from 'vue-turnstile'
import type { TableColumn } from '~/components/comp_def'
import type { ExtendedOrganizationMember, ExtendedOrganizationMembers } from '~/stores/organization'
import type { Database } from '~/types/supabase.types'
import { FormKit } from '@formkit/vue'
import { useI18n } from 'petite-vue-i18n'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
// Import actual components instead of raw svg
import IconInformation from '~icons/heroicons/information-circle'
import IconTrash from '~icons/heroicons/trash'
import IconWrench from '~icons/heroicons/wrench'

import Table from '~/components/Table.vue'
import { useSupabase } from '~/services/supabase'
import { useDialogV2Store } from '~/stores/dialogv2'

import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'

const { t } = useI18n()
const organizationStore = useOrganizationStore()
const { currentOrganization } = storeToRefs(organizationStore)
const supabase = useSupabase()
const main = useMainStore()
const search = ref('')
const columns: Ref<TableColumn[]> = ref<TableColumn[]>([])
const isLoading = ref(false)
const currentPage = ref(1)
const dialogStore = useDialogV2Store()
const emailInput = ref('')

// Permission modal state
const selectedPermission = ref<Database['public']['Enums']['user_min_right'] | undefined>()
const selectedPermissionForm = ref('')
const isInvitePermissionModal = ref(false)

// Invite new user form state
const inviteUserEmail = ref('')
const inviteUserRole = ref('')
const inviteUserFirstName = ref('')
const inviteUserLastName = ref('')
const inviteUserOrgId = ref('')
const captchaToken = ref('')
const captchaElement = ref<InstanceType<typeof VueTurnstile> | null>(null)
const isSubmittingInvite = ref(false)
const captchaKey = ref(import.meta.env.VITE_CAPTCHA_KEY)

const members = ref([] as ExtendedOrganizationMembers)

const isInviteFormValid = computed(() => {
  return inviteUserFirstName.value.trim() !== ''
    && inviteUserLastName.value.trim() !== ''
    && captchaToken.value !== ''
})

const filteredMembers = computed(() => {
  if (!search.value)
    return members.value

  const searchLower = search.value.toLowerCase()
  return members.value.filter((member) => {
    const emailMatch = member.email.toLowerCase().includes(searchLower)
    return emailMatch
  })
})

const permissionOptions = computed(() => {
  const options = [
    { label: t('key-read'), value: 'read' },
    { label: t('key-upload'), value: 'upload' },
    { label: t('key-write'), value: 'write' },
    { label: t('key-admin'), value: 'admin' },
  ]

  if (isSuperAdmin()) {
    options.push({ label: t('key-super-admin'), value: 'super_admin' })
  }

  return options
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
      /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/,
    )
}

async function showPermModal(invite: boolean): Promise<Database['public']['Enums']['user_min_right'] | undefined> {
  selectedPermission.value = undefined
  selectedPermissionForm.value = ''
  isInvitePermissionModal.value = invite

  dialogStore.openDialog({
    title: t('select-user-perms'),
    description: t('select-user-perms-expanded'),
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
          if (!selectedPermission.value) {
            toast.error(t('please-select-permission'))
            return false
          }
          return true
        },
      },
    ],
  })
  await dialogStore.onDialogDismiss()
  return selectedPermission.value
}

async function showInviteModal() {
  if (!currentOrganization.value || (!organizationStore.hasPermisisonsInRole(organizationStore.currentRole, ['admin', 'super_admin']))) {
    toast.error(t('no-permission'))
    return
  }

  let permisionPromise: Promise<Database['public']['Enums']['user_min_right'] | undefined> | undefined
  let email: string | undefined

  emailInput.value = ''

  dialogStore.openDialog({
    title: t('insert-invite-email'),
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('button-invite'),
        id: 'confirm-button',
        role: 'primary',
        handler: async () => {
          email = emailInput.value

          if (!email) {
            toast.error(t('missing-email'))
            return false
          }

          if (!validateEmail(email)) {
            toast.error(t('invalid-email'))
            return false
          }

          permisionPromise = showPermModal(true)
        },
      },
    ],
  })
  await dialogStore.onDialogDismiss()
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

    await handleSendInvitationOutput(data, email, type)
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

async function handleSendInvitationOutput(output: string, email: string, type: Database['public']['Enums']['user_min_right']) {
  console.log('Output: ', output)
  if (!output)
    return
  if (output === 'OK') {
    toast.success(t('org-invited-user'))
  }
  else if (output === 'TOO_RECENT_INVITATION_CANCELATION') {
    dialogStore.openDialog({
      title: t('error'),
      description: t('too-recent-invitation-cancelation'),
      buttons: [
        {
          text: t('ok'),
          role: 'primary',
        },
      ],
    })
  }
  else if (output === 'NO_EMAIL') {
    const captchaKey = import.meta.env.VITE_CAPTCHA_KEY
    if (captchaKey.value) {
      await showInviteNewUserDialog(email, type)
    }
    else {
      toast.error(t('cannot_invite_user_without_account'))
    }
  }
  else if (output === 'ALREADY_INVITED') {
    toast.error(t('user-already-invited'))
  }
  else if (output === 'CAN_NOT_INVITE_OWNER') {
    toast.error(t('cannot-invite-owner'))
  }
  else {
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
    if (data === 'OK') {
      toast.success(t('invitation-rescinded'))
      await reloadData()
    }
    else {
      toast.warning(`${t('unexpected-rescind-response')}: ${data}`)
    }
  }

  return error
}

async function didCancel() {
  dialogStore.openDialog({
    title: t('alert-confirm-delete'),
    description: `${t('alert-not-reverse-message')} ${t('alert-delete-message')}?`,
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
  })
  const didCancel = await dialogStore.onDialogDismiss()
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
      if (data === 'OK') {
        toast.success(t('permission-changed'))
      }
      else {
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

function handlePermissionSelection(permission: Database['public']['Enums']['user_min_right'], invite: boolean) {
  if (invite) {
    switch (permission) {
      case 'read':
        selectedPermission.value = 'invite_read'
        break
      case 'upload':
        selectedPermission.value = 'invite_upload'
        break
      case 'write':
        selectedPermission.value = 'invite_write'
        break
      case 'admin':
        selectedPermission.value = 'invite_admin'
        break
      case 'super_admin':
        selectedPermission.value = 'invite_super_admin'
        break
    }
  }
  else {
    selectedPermission.value = permission
  }
}

function handleFormKitPermissionSelection(value: string | undefined) {
  if (!value)
    return
  const permission = value as Database['public']['Enums']['user_min_right']
  handlePermissionSelection(permission, isInvitePermissionModal.value)
}

async function showInviteNewUserDialog(email: string, roleType: Database['public']['Enums']['user_min_right']) {
  // Reset form state
  inviteUserEmail.value = email
  inviteUserRole.value = roleType.replace(/_/g, ' ')
  inviteUserOrgId.value = currentOrganization.value?.gid ?? ''
  inviteUserFirstName.value = ''
  inviteUserLastName.value = ''
  captchaToken.value = ''
  isSubmittingInvite.value = false

  // Reset captcha if available
  if (captchaElement.value) {
    captchaElement.value.reset()
  }

  dialogStore.openDialog({
    title: t('invite-new-user-dialog-header', 'Invite New User'),
    size: 'lg',
    preventAccidentalClose: true,
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('send-invitation', 'Send Invitation'),
        role: 'primary',
        handler: handleInviteNewUserSubmit,
      },
    ],
  })

  await dialogStore.onDialogDismiss()
}

async function handleInviteNewUserSubmit() {
  if (isSubmittingInvite.value)
    return false

  if (!inviteUserFirstName.value.trim()) {
    toast.error(t('first-name-required', 'First name is required'))
    return false
  }

  if (!inviteUserLastName.value.trim()) {
    toast.error(t('last-name-required', 'Last name is required'))
    return false
  }

  if (!captchaToken.value) {
    toast.error(t('captcha-required', 'Captcha verification is required'))
    return false
  }

  isSubmittingInvite.value = true

  try {
    // Extract the actual role without 'invite_' prefix
    const inviteType = inviteUserRole.value.replace(/\s+/g, '_').replace('invite_', '')

    const { error } = await supabase.functions.invoke('private/invite_new_user_to_org', {
      body: {
        email: inviteUserEmail.value,
        org_id: inviteUserOrgId.value,
        invite_type: inviteType,
        captcha_token: captchaToken.value,
        first_name: inviteUserFirstName.value,
        last_name: inviteUserLastName.value,
      },
    })

    if (error) {
      console.error('Invitation failed:', error)
      toast.error(t('invitation-failed', 'Invitation failed'))
      return false
    }

    toast.success(t('org-invited-user', 'User has been invited successfully'))

    // Refresh the members list
    await reloadData()

    return true // Success
  }
  catch (error) {
    console.error('Invitation failed:', error)
    toast.error(t('invitation-failed', 'Invitation failed'))
    return false
  }
  finally {
    isSubmittingInvite.value = false
  }
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

    <!-- Teleport for email input dialog -->
    <Teleport v-if="dialogStore.showDialog && dialogStore.dialogOptions?.title === t('insert-invite-email')" defer to="#dialog-v2-content">
      <div class="w-full">
        <input
          v-model="emailInput"
          type="email"
          :placeholder="t('email')"
          class="w-full p-3 border border-gray-300 rounded-lg dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          @keydown.enter="$event.preventDefault()"
        >
      </div>
    </Teleport>

    <!-- Teleport for invite new user dialog -->
    <Teleport v-if="dialogStore.showDialog && dialogStore.dialogOptions?.title === t('invite-new-user-dialog-header', 'Invite New User')" defer to="#dialog-v2-content">
      <div class="w-full">
        <form @submit.prevent="handleInviteNewUserSubmit">
          <!-- Email (not editable) -->
          <div class="mb-4">
            <label for="email" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {{ t('email', 'Email') }}
            </label>
            <input
              v-model="inviteUserEmail"
              type="email"
              disabled
              class="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 dark:bg-gray-700 dark:border-gray-600 cursor-not-allowed"
            >
          </div>

          <!-- Role (not editable) -->
          <div class="mb-4">
            <label for="role" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {{ t('role', 'Role') }}
            </label>
            <input
              v-model="inviteUserRole"
              type="text"
              disabled
              class="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 dark:bg-gray-700 dark:border-gray-600 cursor-not-allowed"
            >
          </div>

          <!-- First Name -->
          <div class="mb-4">
            <label for="first-name" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {{ t('first-name', 'First Name') }}
            </label>
            <input
              v-model="inviteUserFirstName"
              type="text"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg dark:bg-gray-800 dark:border-gray-600"
            >
          </div>

          <!-- Last Name -->
          <div class="mb-4">
            <label for="last-name" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {{ t('last-name', 'Last Name') }}
            </label>
            <input
              v-model="inviteUserLastName"
              type="text"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg dark:bg-gray-800 dark:border-gray-600"
            >
          </div>

          <!-- Captcha -->
          <div class="mb-4 mt-4">
            <label for="captcha" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {{ t('captcha', 'Captcha') }}
            </label>
            <VueTurnstile v-if="captchaKey" ref="captchaElement" v-model="captchaToken" size="flexible" :site-key="captchaKey" />
            <div v-else class="text-sm text-gray-600 dark:text-gray-400 text-center py-3 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
              {{ t('captcha-not-available', 'Captcha not available') }}
            </div>
          </div>

          <!-- Form Validation Info -->
          <div class="mt-6 flex flex-col items-center">
            <p v-if="!isInviteFormValid" class="text-xs text-gray-500 dark:text-gray-400 mb-2">
              {{ t('complete-all-fields', 'Please complete all required fields to continue') }}
            </p>

            <div class="flex items-center text-xs text-blue-600 dark:text-blue-400 cursor-pointer group relative" :class="{ 'mt-2': isInviteFormValid }">
              <IconInformation class="w-4 h-4 mr-1" />
              <span class="font-medium">Why do I need this?</span>

              <!-- Tooltip that appears on hover -->
              <div class="opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg shadow-lg w-60 text-center pointer-events-none">
                {{ t('captcha-new-user-org-tooltip') }}
                <!-- Tooltip arrow -->
                <div class="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800" />
              </div>
            </div>
          </div>
        </form>
      </div>
    </Teleport>

    <!-- Teleport for permission selection modal -->
    <Teleport v-if="dialogStore.showDialog && dialogStore.dialogOptions?.title === t('select-user-perms')" defer to="#dialog-v2-content">
      <div class="w-full">
        <div class="border rounded-lg p-4 dark:border-gray-600">
          <FormKit
            v-model="selectedPermissionForm"
            type="radio"
            name="permission"
            :options="permissionOptions"
            @input="handleFormKitPermissionSelection"
          />
        </div>
      </div>
    </Teleport>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
</route>
