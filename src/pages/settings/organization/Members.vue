<script setup lang="ts">
import type { TableColumn } from '~/components/comp_def'
import type { ExtendedOrganizationMember, ExtendedOrganizationMembers } from '~/stores/organization'
import type { Database } from '~/types/supabase.types'

import { computedAsync } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, h, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import VueTurnstile from 'vue-turnstile'
import IconInformation from '~icons/heroicons/information-circle'
import IconSearch from '~icons/heroicons/magnifying-glass'
import IconTrash from '~icons/heroicons/trash'
import IconWrench from '~icons/heroicons/wrench'
import Table from '~/components/Table.vue'
import { checkPermissions } from '~/services/permissions'
import { useSupabase } from '~/services/supabase'
import { useDialogV2Store } from '~/stores/dialogv2'
import { useMainStore } from '~/stores/main'
import { getRbacRoleI18nKey, useOrganizationStore } from '~/stores/organization'
import DeleteOrgDialog from './DeleteOrgDialog.vue'

const { t } = useI18n()
const router = useRouter()
const organizationStore = useOrganizationStore()
const { currentOrganization } = storeToRefs(organizationStore)
const supabase = useSupabase()
const main = useMainStore()
const search = ref('')
const columns: Ref<TableColumn[]> = ref<TableColumn[]>([])
const isLoading = ref(false)
const currentPage = ref(1)
const rbacSystemEnabled = import.meta.env.VITE_FEATURE_RBAC_SYSTEM === 'true'
const dialogStore = useDialogV2Store()
const emailInput = ref('')
const displayStore = useDisplayStore()
displayStore.NavTitle = t('members')
const useNewRbac = ref(false)

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

const canInviteUser = computedAsync(async () => {
  if (!currentOrganization.value)
    return false
  return await checkPermissions('org.invite_user', { orgId: currentOrganization.value.gid })
}, false)

const canUpdateUserRoles = computedAsync(async () => {
  if (!currentOrganization.value)
    return false
  return await checkPermissions('org.update_user_roles', { orgId: currentOrganization.value.gid })
}, false)
const captchaElement = ref<InstanceType<typeof VueTurnstile> | null>(null)
const isSubmittingInvite = ref(false)
const captchaKey = ref(import.meta.env.VITE_CAPTCHA_KEY)
const dialogRef = ref()

// Super Admin Delegation modal
const selectedUserToDelegateAdmin = ref()
const searchUserForAdminDelegation = ref('')

const members = ref([] as ExtendedOrganizationMembers)

const isInviteFormValid = computed(() => {
  return inviteUserFirstName.value.trim() !== ''
    && inviteUserLastName.value.trim() !== ''
    && captchaToken.value !== ''
})

async function checkRbacEnabled() {
  useNewRbac.value = false
  if (!currentOrganization.value)
    return

  try {
    const { data, error } = await supabase
      .from('orgs')
      .select('use_new_rbac')
      .eq('id', currentOrganization.value.gid)
      .single()

    if (error)
      throw error

    useNewRbac.value = (data as any)?.use_new_rbac || false
  }
  catch (error: any) {
    useNewRbac.value = false
    console.error('Error checking RBAC status:', error)
  }
}

const isInviteNewUserDialogOpen = ref(false)

function updateInviteNewUserButton() {
  const buttons = dialogStore.dialogOptions?.buttons
  if (!buttons)
    return
  const submitButton = buttons.find(b => b.id === 'invite-new-user-send')
  if (!submitButton)
    return
  submitButton.disabled = isSubmittingInvite.value || !isInviteFormValid.value
  submitButton.text = isSubmittingInvite.value
    ? t('sending-invitation', 'Sending invitation...')
    : t('send-invitation', 'Send Invitation')
}

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
  if (useNewRbac.value) {
    // Options RBAC
    const options = [
      { label: t('role-org-member'), value: 'org_member' },
      { label: t('role-org-billing-admin'), value: 'org_billing_admin' },
      { label: t('role-org-admin'), value: 'org_admin' },
    ]

    if (canUpdateUserRoles.value) {
      options.push({ label: t('role-org-super-admin'), value: 'org_super_admin' })
    }

    return options
  }
  else {
    // Options legacy
    const options = [
      { label: t('key-read'), value: 'read' },
      { label: t('key-upload'), value: 'upload' },
      { label: t('key-write'), value: 'write' },
      { label: t('key-admin'), value: 'admin' },
    ]

    if (canUpdateUserRoles.value) {
      options.push({ label: t('key-super-admin'), value: 'super_admin' })
    }

    return options
  }
})

const membersOptions = computed(() => {
  if (!searchUserForAdminDelegation.value) {
    return
  }

  const searchLower = searchUserForAdminDelegation.value.toLowerCase()
  const options = members.value
    .filter(m => m.role !== 'super_admin')
    .filter(m => m.email.toLowerCase().includes(searchLower))
    .map((m) => {
      return { label: m.email, value: m.id }
    })

  return options
})

columns.value = [
  {
    label: t('member'),
    key: 'email',
    mobile: true,
    sortable: true,
    head: true,
    renderFunction: (member: ExtendedOrganizationMember) => {
      const avatar = member.image_url
        ? h('img', {
            src: member.image_url,
            alt: `Profile picture for ${member.email}`,
            class: 'rounded-sm shrink-0 d-mask d-mask-squircle',
            width: 42,
            height: 42,
          })
        : h('div', { class: 'flex items-center justify-center w-10 h-10 text-xl bg-gray-700 d-mask d-mask-squircle shrink-0' }, [
            h('span', { class: 'font-medium text-gray-300' }, acronym(member.email)),
          ])

      return h('div', { class: 'flex items-center' }, [
        avatar,
        h('span', { class: 'ml-2 hidden sm:inline truncate' }, member.email),
      ])
    },
  },
  {
    label: t('role'),
    key: 'role',
    mobile: true,
    sortable: 'desc',
    displayFunction: (member: ExtendedOrganizationMember) => {
      if (useNewRbac.value) {
        const i18nKey = getRbacRoleI18nKey(member.role)
        return i18nKey ? t(i18nKey) : member.role.replaceAll('_', ' ')
      }
      return member.role.replaceAll('_', ' ')
    },
  },
  {
    key: 'actions',
    label: t('actions'),
    mobile: true,
    actions: computed(() => [
      {
        icon: IconWrench,
        title: rbacSystemEnabled ? t('edit-role', 'Edit role') : t('actions'),
        visible: (member: ExtendedOrganizationMember) => canUpdateUserRoles.value && member.uid !== currentOrganization?.value?.created_by,
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
    await checkRbacEnabled()

    if (useNewRbac.value && currentOrganization.value) {
      // Utiliser la RPC RBAC pour récupérer les membres
      const { data: rbacMembers, error: rbError } = await supabase
        .rpc('get_org_members_rbac', {
          p_org_id: currentOrganization.value.gid,
        })

      if (rbError) {
        console.error('Error fetching RBAC members:', rbError)
        toast.error(t('error-fetching-members'))
        return
      }

      // Mapper les données RBAC vers le format attendu par la table
      members.value = (rbacMembers || []).map((member: any) => ({
        id: member.user_id,
        aid: -1, // RBAC-only member (no legacy org_users id)
        uid: member.user_id,
        email: member.email,
        image_url: member.image_url,
        role: member.role_name,
        is_tmp: false, // Les invitations RBAC seront gérées différemment
      }))
    }
    else {
      // Utiliser l'ancienne méthode pour les orgs sans RBAC
      members.value = await organizationStore.getMembers()
    }
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

watch([isInviteFormValid, isSubmittingInvite, isInviteNewUserDialogOpen], ([_valid, _submitting, open]) => {
  if (!open)
    return
  updateInviteNewUserButton()
}, { immediate: true })

onMounted(reloadData)

function validateEmail(email: string) {
  return String(email)
    .toLowerCase()
    .match(
      /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/,
    )
}

async function showPermModal(invite: boolean, onConfirm?: (permission: Database['public']['Enums']['user_min_right']) => Promise<boolean>): Promise<Database['public']['Enums']['user_min_right'] | undefined> {
  selectedPermission.value = undefined
  selectedPermissionForm.value = ''
  isInvitePermissionModal.value = invite

  const confirmButtonId = 'perm-confirm-button'

  function updateConfirmButton(loading: boolean) {
    const buttons = dialogStore.dialogOptions?.buttons
    if (!buttons)
      return
    const confirmButton = buttons.find(b => b.id === confirmButtonId)
    if (confirmButton) {
      confirmButton.disabled = loading
      confirmButton.text = loading ? t('sending-invitation') : t('button-confirm')
    }
  }

  dialogStore.openDialog({
    title: useNewRbac.value ? t('select-user-role', 'Select a role') : t('select-user-perms'),
    description: useNewRbac.value
      ? t('select-user-role-expanded', 'Choose the RBAC role to assign. Legacy roles remain visible during migration.')
      : t('select-user-perms-expanded'),
    size: 'lg',
    preventAccidentalClose: !!onConfirm,
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
        disabled: false,
      },
      {
        text: t('button-confirm'),
        id: confirmButtonId,
        role: 'primary',
        preventClose: !!onConfirm,
        handler: async () => {
          if (!selectedPermission.value) {
            toast.error(t('please-select-permission'))
            return false
          }
          if (onConfirm) {
            updateConfirmButton(true)
            try {
              const success = await onConfirm(selectedPermission.value)
              if (success) {
                dialogStore.closeDialog()
              }
              return false
            }
            finally {
              updateConfirmButton(false)
            }
          }
          return true
        },
      },
    ],
  })
  if (await dialogStore.onDialogDismiss()) {
    return undefined
  }
  return selectedPermission.value
}

async function showInviteModal() {
  if (!currentOrganization.value || !canInviteUser.value) {
    toast.error(t('no-permission'))
    return
  }

  let email: string | undefined
  let emailValid = false

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
        handler: () => {
          email = emailInput.value

          if (!email) {
            toast.error(t('missing-email'))
            return false
          }

          if (!validateEmail(email)) {
            toast.error(t('invalid-email'))
            return false
          }

          emailValid = true
          return true
        },
      },
    ],
  })

  const wasCancelled = await dialogStore.onDialogDismiss()

  if (wasCancelled || !emailValid || !email)
    return

  const emailToInvite = email
  await showPermModal(true, async (permission) => {
    return await sendInvitation(emailToInvite, permission)
  })
}

async function sendInvitation(email: string, type: Database['public']['Enums']['user_min_right']): Promise<boolean> {
  console.log(`Invite ${email} with perm ${type}`)

  const orgId = currentOrganization.value?.gid
  if (!orgId) {
    toast.error('Organization ID not found.')
    return false
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
      return false
    }

    const success = await handleSendInvitationOutput(data, email, type)
    if (success) {
      await reloadData()
    }
    return success
  }
  catch (error) {
    console.error('Invitation failed:', error)
    toast.error(t('invitation-failed'))
    return false
  }
  finally {
    isLoading.value = false
  }
}

async function handleSendInvitationOutput(output: string, email: string, type: Database['public']['Enums']['user_min_right']): Promise<boolean> {
  console.log('Output: ', output)
  if (!output)
    return false
  if (output === 'OK') {
    toast.success(t('org-invited-user'))
    return true
  }
  else if (output === 'TOO_RECENT_INVITATION_CANCELATION') {
    toast.error(t('too-recent-invitation-cancelation'))
    return false
  }
  else if (output === 'NO_EMAIL') {
    if (captchaKey.value) {
      await showInviteNewUserDialog(email, type)
      return true
    }
    else {
      toast.error(t('cannot_invite_user_without_account'))
      return false
    }
  }
  else if (output === 'ALREADY_INVITED') {
    toast.error(t('user-already-invited'))
    return false
  }
  else if (output === 'CAN_NOT_INVITE_OWNER') {
    toast.error(t('cannot-invite-owner'))
    return false
  }
  else {
    toast.warning(`${t('unexpected-invitation-response')}: ${output}`)
    return false
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

async function cannotDeleteOwner() {
  dialogStore.openDialog({
    title: t('alert-cannot-delete-owner-title'),
    description: `${t('alert-cannot-delete-owner-body')}`,
    size: 'xl',
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('delete-org'),
        role: 'danger',
        handler: () => {
          dialogRef.value?.open()
        },
      },
      {
        text: t('delegate-super-admin-title'),
        role: 'secondary',
        handler: () => {
          dialogStore.openDialog({
            title: t('delegate-super-admin-title'),
            description: t('select-user-delegate-admin'),
            size: 'xl',
            buttons: [
              {
                text: t('button-cancel'),
                role: 'cancel',
              },
              {
                text: t('delegate'),
                role: 'primary',
                id: 'confirm-button',
                handler: () => {
                  if (!selectedUserToDelegateAdmin.value) {
                    toast.error(t('please-select-user'))
                    return false
                  }

                  // get member from id
                  const selectedUser = members.value.filter(m => m.id === selectedUserToDelegateAdmin.value)[0]
                  // set user to super admin
                  _changeMemberPermission(selectedUser, 'super_admin')
                  selectedUserToDelegateAdmin.value = null
                  // get current member
                  const currentMember = members.value.filter(m => m.uid === main.user?.id)[0]
                  // delete current member from org
                  _deleteMember(currentMember)
                  // redirect to /app
                  router.push('/app')

                  return true
                },
              },
            ],
          })
        },
      },
    ],
  })
}

async function _deleteMember(member: ExtendedOrganizationMember) {
  isLoading.value = true

  try {
    if (member.is_tmp) {
      // Handle invitation rescinding for temporary users
      await rescindInvitation(member.email)
    }
    else {
      if (member.aid === -1) {
        const orgId = currentOrganization.value?.gid
        if (!orgId) {
          toast.error(t('cannot-delete-member'))
          return
        }

        const { data, error } = await supabase.rpc('delete_org_member_role', {
          p_org_id: orgId,
          p_user_id: member.uid,
        })

        if (error) {
          console.error('Error deleting RBAC member: ', error)
          if (error.message.includes('CANNOT_REMOVE_LAST_SUPER_ADMIN')) {
            toast.error(t('cannot-remove-last-super-admin'))
          }
          else if (error.message.includes('CANNOT_CHANGE_OWNER_ROLE')) {
            toast.error(t('cannot-change-owner-role'))
          }
          else if (error.message.includes('NO_PERMISSION_TO_UPDATE_ROLES')) {
            toast.error(t('no-permission'))
          }
          else {
            toast.error(`${t('cannot-delete-member')}: ${error.message}`)
          }
          return
        }

        if (data !== 'OK') {
          console.error('Unexpected RPC response:', data)
          toast.error(t('cannot-delete-member'))
          return
        }
      }
      else {
        const { error } = await supabase
          .from('org_users')
          .delete()
          .eq('id', member.aid)

        if (error) {
          console.error('Error deleting member: ', error)
          toast.error(`${t('cannot-delete-member')}: ${error.message}`)
          return
        }
      }

      toast.success(t('member-deleted'))

      if (member.uid === main.user?.id) {
        console.log('Current user deleted themselves from the org.')
        await organizationStore.fetchOrganizations()
        try {
          organizationStore.setCurrentOrganizationToMain()
        }
        catch {
          organizationStore.setCurrentOrganizationToFirst()
        }
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

async function deleteMember(member: ExtendedOrganizationMember) {
  const numberOfSuperAdmins = members.value.filter(m => m.role === 'super_admin').length
  if (numberOfSuperAdmins === 1 && member.role === 'super_admin') {
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

  _deleteMember(member)
}

function handleRbacRoleUpdateError(error: { message?: string }) {
  if (error.message?.includes('CANNOT_REMOVE_LAST_SUPER_ADMIN')) {
    toast.error(t('cannot-remove-last-super-admin'))
  }
  else if (error.message?.includes('CANNOT_CHANGE_OWNER_ROLE')) {
    toast.error(t('cannot-change-owner-role'))
  }
  else if (error.message?.includes('NO_PERMISSION_TO_UPDATE_ROLES')) {
    toast.error(t('no-permission'))
  }
  else {
    toast.error(`${t('cannot-change-permission')}: ${error.message ?? t('unexpected-response')}`)
  }
}

async function updateRbacMemberRole(member: ExtendedOrganizationMember, perm: string) {
  const { data, error } = await supabase.rpc('update_org_member_role', {
    p_org_id: currentOrganization.value?.gid ?? '',
    p_user_id: member.uid,
    p_new_role_name: perm,
  })

  if (error) {
    console.error('Error updating RBAC role:', error)
    handleRbacRoleUpdateError(error)
    return
  }

  if (data === 'OK') {
    toast.success(t('permission-changed'))
    await reloadData()
  }
}

async function updateTmpMemberRole(member: ExtendedOrganizationMember, perm: Database['public']['Enums']['user_min_right']) {
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

  if (data === 'OK') {
    toast.success(t('permission-changed'))
  }
  else {
    toast.warning(`${t('unexpected-response')}: ${data}`)
  }

  await reloadData()
}

async function updateLegacyMemberRole(member: ExtendedOrganizationMember, perm: Database['public']['Enums']['user_min_right']) {
  const { error } = await supabase
    .from('org_users')
    .update({ user_right: perm })
    .eq('id', member.aid)

  if (error) {
    console.error('Error changing permission: ', error)
    toast.error(`${t('cannot-change-permission')}: ${error.message}`)
    return
  }

  toast.success(t('permission-changed'))
  await reloadData()
}

async function _changeMemberPermission(member: ExtendedOrganizationMember, perm: Database['public']['Enums']['user_min_right'] | string) {
  isLoading.value = true
  try {
    if (useNewRbac.value && currentOrganization.value) {
      await updateRbacMemberRole(member, perm as string)
      return
    }

    if (member.is_tmp) {
      await updateTmpMemberRole(member, perm as Database['public']['Enums']['user_min_right'])
      return
    }

    await updateLegacyMemberRole(member, perm as Database['public']['Enums']['user_min_right'])
  }
  catch (error) {
    console.error('Permission change failed:', error)
    toast.error(t('permission-change-failed'))
  }
  finally {
    isLoading.value = false
  }
}

async function changeMemberPermission(member: ExtendedOrganizationMember) {
  const isInvite = member.role.includes('invite')
  const perm = await showPermModal(isInvite)

  if (!perm) {
    console.log('Permission change cancelled.')
    return
  }

  _changeMemberPermission(member, perm)
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

function handlePermissionSelection(permission: Database['public']['Enums']['user_min_right'] | string, invite: boolean) {
  if (useNewRbac.value) {
    // Pour RBAC, on utilise directement le nom du rôle (org_super_admin, org_admin, etc.)
    // Les invitations RBAC ne nécessitent pas de préfixe 'invite_'
    selectedPermission.value = permission as any
  }
  else if (invite) {
    // Legacy: ajouter le préfixe invite_ pour les invitations
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
    selectedPermission.value = permission as any
  }
}

function handleFormKitPermissionSelection(value: string | undefined) {
  if (!value)
    return
  const permission = value as Database['public']['Enums']['user_min_right']
  handlePermissionSelection(permission, isInvitePermissionModal.value)
}

function delegateSuperAdmin(value: unknown) {
  if (!value)
    return
  selectedUserToDelegateAdmin.value = value
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
  isInviteNewUserDialogOpen.value = true

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
        id: 'invite-new-user-send',
        text: t('send-invitation', 'Send Invitation'),
        role: 'primary',
        preventClose: true,
        handler: handleInviteNewUserSubmit,
      },
    ],
  })

  // Disable button initially since captcha won't be ready
  updateInviteNewUserButton()

  await dialogStore.onDialogDismiss()
  isInviteNewUserDialogOpen.value = false
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

    // Close the dialog on success
    dialogStore.closeDialog()
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
    <div class="flex flex-col h-full pb-8 overflow-hidden overflow-y-auto bg-white border shadow-lg md:p-8 md:pb-0 max-h-fit grow md:rounded-lg dark:bg-gray-800 border-slate-300 dark:border-slate-900">
      <div class="flex justify-between w-full mb-5 ml-2 md:ml-0">
        <h2 class="text-2xl font-bold dark:text-white text-slate-800">
          {{ t('members') }}
        </h2>
      </div>
      <div v-if="rbacSystemEnabled && useNewRbac" class="mb-4 d-alert d-alert-info gap-3 items-start">
        <IconInformation class="w-6 h-6 text-sky-400 shrink-0" />
        <div class="text-sm text-slate-100">
          <p class="font-semibold">
            {{ t('rbac-system-enabled', 'RBAC role management preview') }}
          </p>
          <p class="text-slate-200">
            {{ t('rbac-system-enabled-body', 'Editing roles here will use the RBAC system. Legacy roles stay visible during migration.') }}
          </p>
        </div>
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
          class="w-full p-3 border border-gray-300 rounded-lg dark:text-white dark:bg-gray-800 dark:border-gray-600"
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
            <label for="email" class="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
              {{ t('email', 'Email') }}
            </label>
            <input
              v-model="inviteUserEmail"
              type="email"
              disabled
              class="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg cursor-not-allowed dark:bg-gray-700 dark:border-gray-600"
            >
          </div>

          <!-- Role (not editable) -->
          <div class="mb-4">
            <label for="role" class="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
              {{ t('role', 'Role') }}
            </label>
            <input
              v-model="inviteUserRole"
              type="text"
              disabled
              class="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg cursor-not-allowed dark:bg-gray-700 dark:border-gray-600"
            >
          </div>

          <!-- First Name -->
          <div class="mb-4">
            <label for="first-name" class="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
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
            <label for="last-name" class="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
              {{ t('last-name', 'Last Name') }}
            </label>
            <input
              v-model="inviteUserLastName"
              type="text"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg dark:bg-gray-800 dark:border-gray-600"
            >
          </div>

          <!-- Captcha -->
          <div class="mt-4 mb-4">
            <label for="captcha" class="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
              {{ t('captcha', 'Captcha') }}
            </label>
            <VueTurnstile v-if="captchaKey" ref="captchaElement" v-model="captchaToken" size="flexible" :site-key="captchaKey" />
            <div v-else class="py-3 text-sm text-center text-gray-600 border border-gray-300 border-dashed rounded-lg dark:text-gray-400 dark:border-gray-600">
              {{ t('captcha-not-available', 'Captcha not available') }}
            </div>
          </div>

          <!-- Form Validation Info -->
          <div class="flex flex-col items-center mt-6">
            <p v-if="!isInviteFormValid" class="mb-2 text-xs text-gray-500 dark:text-gray-400">
              {{ t('complete-all-fields', 'Please complete all required fields to continue') }}
            </p>

            <div class="relative flex items-center text-xs text-blue-600 cursor-pointer dark:text-blue-400 group" :class="{ 'mt-2': isInviteFormValid }">
              <IconInformation class="w-4 h-4 mr-1" />
              <span class="font-medium">Why do I need this?</span>

              <!-- Tooltip that appears on hover -->
              <div class="absolute px-3 py-2 mb-2 text-xs text-center text-white transition-opacity transform -translate-x-1/2 bg-gray-800 rounded-lg shadow-lg opacity-0 pointer-events-none left-1/2 bottom-full w-60 group-hover:opacity-100">
                {{ t('captcha-new-user-org-d-tooltip') }}
                <!-- Tooltip arrow -->
                <div class="absolute w-0 h-0 transform -translate-x-1/2 border-t-4 border-l-4 border-r-4 border-transparent left-1/2 top-full border-t-gray-800" />
              </div>
            </div>
          </div>
        </form>
      </div>
    </Teleport>

    <!-- Teleport for permission selection modal -->
    <Teleport
      v-if="dialogStore.showDialog && (dialogStore.dialogOptions?.title === t('select-user-perms') || dialogStore.dialogOptions?.title === t('select-user-role', 'Select a role'))"
      defer
      to="#dialog-v2-content"
    >
      <div class="w-full">
        <div class="p-4 border rounded-lg dark:border-gray-600">
          <div class="space-y-3">
            <div v-for="option in permissionOptions" :key="option.value" class="form-control">
              <label class="justify-start gap-3 p-3 rounded-lg cursor-pointer hover:bg-gray-50 label dark:hover:bg-gray-800">
                <input
                  v-model="selectedPermissionForm"
                  type="radio"
                  name="permission"
                  :value="option.value"
                  class="mr-2 radio radio-primary"
                  @change="handleFormKitPermissionSelection(option.value)"
                >
                <span class="text-base label-text">{{ option.label }}</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Teleport for super admin delegation -->
    <Teleport v-if="dialogStore.showDialog && dialogStore.dialogOptions?.title === t('delegate-super-admin-title')" defer to="#dialog-v2-content">
      <div class="w-full">
        <div class="flex mb-5 overflow-hidden md:w-auto">
          <div class="relative w-full">
            <input
              v-model="searchUserForAdminDelegation"
              type="text"
              :placeholder="t('search-by-name-or-email')"
              :disabled="isLoading"
              class="w-full pl-10 rounded-full input input-bordered"
            >
            <IconSearch class="absolute w-4 h-4 text-gray-400 transform -translate-y-1/2 left-3 top-1/2" />
          </div>
        </div>
        <div class="p-4 border rounded-lg dark:border-gray-600">
          <div v-show="membersOptions?.length && membersOptions.length > 0" class="space-y-2">
            <div v-for="option in membersOptions" :key="option.value" class="form-control">
              <label class="justify-start gap-3 p-2 rounded-lg cursor-pointer hover:bg-gray-50 label dark:hover:bg-gray-800">
                <input
                  v-model="selectedUserToDelegateAdmin"
                  type="radio"
                  name="admin-delegation"
                  :value="option.value"
                  class="mr-2 radio radio-primary"
                  @change="delegateSuperAdmin(option.value)"
                >
                <span class="label-text">{{ option.label }}</span>
              </label>
            </div>
          </div>
          <div v-show="membersOptions?.length === 0">
            {{ t('no-results') }}
          </div>
        </div>
      </div>
    </Teleport>

    <!-- offer possibility to directly delete organization when the last super admin want to delete himself -->
    <DeleteOrgDialog
      ref="dialogRef"
      :org="currentOrganization"
    />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
</route>
