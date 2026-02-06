<script setup lang="ts">
import type { TableColumn } from '~/components/comp_def'
import type { ExtendedOrganizationMember } from '~/stores/organization'
import type { Database } from '~/types/supabase.types'

import { computedAsync } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, h, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import VueTurnstile from 'vue-turnstile'
import IconInformation from '~icons/heroicons/information-circle'
import IconSearch from '~icons/heroicons/magnifying-glass'
import IconShield from '~icons/heroicons/shield-check'
import IconTrash from '~icons/heroicons/trash'
import IconWrench from '~icons/heroicons/wrench'
import RoleSelect from '~/components/forms/RoleSelect.vue'
import SearchInput from '~/components/forms/SearchInput.vue'
import { checkPermissions } from '~/services/permissions'
import { createSignedImageUrl } from '~/services/storage'
import { useSupabase } from '~/services/supabase'
import { useDialogV2Store } from '~/stores/dialogv2'
import { useMainStore } from '~/stores/main'
import { getRbacRoleI18nKey, useOrganizationStore } from '~/stores/organization'
import { resolveInviteNewUserErrorMessage } from '~/utils/invites'
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

type OrganizationMemberRow = ExtendedOrganizationMember & { is_invite?: boolean }
type OrganizationMemberRows = OrganizationMemberRow[]

interface Role {
  id: string
  name: string
  scope_type: string
  description: string
  priority_rank: number
}

interface OrgApp {
  id: string
  app_id: string
  name: string | null
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
}

// Permission modal state
const selectedPermission = ref<Database['public']['Enums']['user_min_right'] | string | undefined>()
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

const members = ref([] as OrganizationMemberRows)

const isInviteFormValid = computed(() => {
  return inviteUserFirstName.value.trim() !== ''
    && inviteUserLastName.value.trim() !== ''
    && captchaToken.value !== ''
})

const rbacSuperAdminRole = 'org_super_admin'
const appAccessMember = ref<OrganizationMemberRow | null>(null)
const appAccessSearch = ref('')
const appAccessSelectedAppIds = ref<string[]>([])
const appAccessSelectedRole = ref('')
const appAccessApps = ref<OrgApp[]>([])
const appAccessBindings = ref<RoleBinding[]>([])
const availableAppRoles = ref<Role[]>([])
const isAppAccessLoading = ref(false)
const isAppAccessSubmitting = ref(false)
const appAccessRoleTouched = ref(false)

function isSuperAdminRole(role: string | undefined) {
  if (!role)
    return false
  return role === 'super_admin' || role === rbacSuperAdminRole
}

function isInviteMember(member: OrganizationMemberRow) {
  if (member.is_invite || member.is_tmp)
    return true
  if (typeof member.role === 'string')
    return member.role.includes('invite')
  return false
}

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

function resetInviteCaptcha() {
  if (captchaElement.value) {
    captchaElement.value.reset()
  }
  captchaToken.value = ''
  updateInviteNewUserButton()
}

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

const filteredAppAccessApps = computed(() => {
  if (!appAccessSearch.value)
    return appAccessApps.value

  const searchLower = appAccessSearch.value.toLowerCase()
  return appAccessApps.value.filter((app) => {
    const name = app.name || ''
    return name.toLowerCase().includes(searchLower)
      || app.app_id.toLowerCase().includes(searchLower)
  })
})

const appAccessBindingByAppId = computed(() => {
  const map = new Map<string, RoleBinding>()
  for (const binding of appAccessBindings.value) {
    if (binding.scope_type === 'app' && binding.app_id) {
      map.set(binding.app_id, binding)
    }
  }
  return map
})

function getInheritedAppAccessLabel(roleName?: string): string | null {
  if (!roleName)
    return null
  const normalizedRole = roleName.replace(/^invite_/, '')
  if (normalizedRole === 'org_billing_admin')
    return t('app-access-none', 'No app access')
  if (normalizedRole === 'org_member')
    return t('app-access-none', 'No app access')
  if (normalizedRole === 'org_admin')
    return t('app-access-inherited', { role: getRoleDisplayName('app_admin') })
  if (normalizedRole === 'org_super_admin')
    return t('app-access-inherited', { role: getRoleDisplayName('app_admin') })
  return null
}

function getAppAccessLabel(appId: string): string | null {
  const binding = appAccessBindingByAppId.value.get(appId)
  if (binding) {
    return getRoleDisplayName(binding.role_name)
  }
  return getInheritedAppAccessLabel(appAccessMember.value?.role)
}

const selectedAppAccessBinding = computed(() => {
  if (appAccessSelectedAppIds.value.length !== 1)
    return undefined
  const selectedId = appAccessSelectedAppIds.value[0]
  return appAccessBindingByAppId.value.get(selectedId)
})

const selectedAppAccessApp = computed(() => {
  if (appAccessSelectedAppIds.value.length !== 1)
    return undefined
  const selectedId = appAccessSelectedAppIds.value[0]
  return appAccessApps.value.find(app => app.id === selectedId)
})

const isAppAccessSelectionValid = computed(() => {
  return appAccessSelectedAppIds.value.length > 0 && !!appAccessSelectedRole.value
})

const membersOptions = computed(() => {
  if (!searchUserForAdminDelegation.value) {
    return
  }

  const searchLower = searchUserForAdminDelegation.value.toLowerCase()
  const options = members.value
    .filter(m => !isSuperAdminRole(m.role))
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
    renderFunction: (member: OrganizationMemberRow) => {
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
    displayFunction: (member: OrganizationMemberRow) => {
      if (useNewRbac.value) {
        const normalizedRole = member.role.replace(/^invite_/, '')
        const i18nKey = getRbacRoleI18nKey(normalizedRole)
        return i18nKey ? t(i18nKey) : normalizedRole.replaceAll('_', ' ')
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
        visible: (member: OrganizationMemberRow) => canUpdateUserRoles.value && member.uid !== currentOrganization?.value?.created_by,
        onClick: (member: OrganizationMemberRow) => {
          changeMemberPermission(member)
        },
      },
      {
        icon: IconShield,
        title: t('app-access-control'),
        visible: (member: OrganizationMemberRow) => {
          if (!useNewRbac.value || !canUpdateUserRoles.value || isInviteMember(member))
            return false
          const normalizedRole = member.role.replace(/^invite_/, '')
          return !['org_super_admin', 'org_admin'].includes(normalizedRole)
        },
        onClick: (member: OrganizationMemberRow) => {
          openAppAccessModal(member)
        },
      },
      {
        icon: IconTrash,
        visible: (member: OrganizationMemberRow) => canDelete(member),
        onClick: (member: OrganizationMemberRow) => {
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
      members.value = await Promise.all((rbacMembers || []).map(async (member: any) => {
        const isInvite = member.is_invite === true
        const isTmp = member.is_tmp === true
        const orgUserId = member.org_user_id
        const hasOrgUserInvite = isInvite && !isTmp && orgUserId != null && orgUserId !== ''
        const signedImage = member.image_url ? await createSignedImageUrl(member.image_url) : ''

        return {
          id: member.user_id,
          aid: hasOrgUserInvite ? Number(orgUserId) : -1,
          uid: member.user_id,
          email: member.email,
          image_url: signedImage || '',
          role: member.role_name,
          is_tmp: isTmp,
          is_invite: isInvite,
        }
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

watch([isAppAccessSelectionValid, isAppAccessSubmitting], () => {
  updateAppAccessSaveButton()
})

watch(appAccessSelectedAppIds, () => {
  if (!appAccessRoleTouched.value) {
    if (appAccessSelectedAppIds.value.length === 1) {
      const existingBinding = selectedAppAccessBinding.value
      appAccessSelectedRole.value = existingBinding?.role_name ?? ''
    }
    else if (appAccessSelectedAppIds.value.length > 1) {
      const roles = appAccessSelectedAppIds.value
        .map(id => appAccessBindingByAppId.value.get(id)?.role_name)
        .filter(Boolean) as string[]
      const firstRole = roles[0]
      const allSame = roles.length === appAccessSelectedAppIds.value.length
        && roles.every(role => role === firstRole)
      appAccessSelectedRole.value = allSame ? firstRole : ''
    }
    else {
      appAccessSelectedRole.value = ''
    }
  }
  updateAppAccessSaveButton()
}, { deep: true })

onMounted(reloadData)

function validateEmail(email: string) {
  return String(email)
    .toLowerCase()
    .match(
      /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/,
    )
}

async function showPermModal(invite: boolean, onConfirm?: (permission: Database['public']['Enums']['user_min_right'] | string) => Promise<boolean>, currentRole?: string): Promise<Database['public']['Enums']['user_min_right'] | string | undefined> {
  const normalizedRole = currentRole?.replace(/^invite_/, '')
  const initialRole = useNewRbac.value
    ? (normalizedRole ? normalizedRole.trim().toLowerCase().replace(/\s+/g, '_') : '')
    : (currentRole ?? '')
  selectedPermission.value = initialRole
    ? initialRole as Database['public']['Enums']['user_min_right']
    : undefined
  selectedPermissionForm.value = initialRole
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

async function sendInvitation(email: string, type: Database['public']['Enums']['user_min_right'] | string): Promise<boolean> {
  console.log(`Invite ${email} with perm ${type}`)

  const orgId = currentOrganization.value?.gid
  if (!orgId) {
    toast.error('Organization ID not found.')
    return false
  }

  isLoading.value = true
  try {
    const { data, error } = useNewRbac.value
      ? await supabase.rpc('invite_user_to_org_rbac', {
          email,
          org_id: orgId,
          role_name: type,
        })
      : await supabase.rpc('invite_user_to_org', {
          email,
          org_id: orgId,
          invite_type: type as Database['public']['Enums']['user_min_right'],
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

async function handleSendInvitationOutput(output: string, email: string, type: Database['public']['Enums']['user_min_right'] | string): Promise<boolean> {
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
  else if (output === 'NO_RIGHTS' || output === 'NO_RIGHTS_FOR_SUPER_ADMIN') {
    toast.error(t('no-permission'))
    return false
  }
  else if (output === 'RBAC_NOT_ENABLED') {
    toast.error(t('invitation-failed'))
    return false
  }
  else if (output === 'ROLE_NOT_FOUND') {
    toast.error(t('invitation-failed'))
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
                  _changeMemberPermission(selectedUser, useNewRbac.value ? rbacSuperAdminRole : 'super_admin')
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

async function _deleteMember(member: OrganizationMemberRow) {
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

async function deleteMember(member: OrganizationMemberRow) {
  const numberOfSuperAdmins = members.value.filter(m => !isInviteMember(m) && isSuperAdminRole(m.role)).length
  if (numberOfSuperAdmins === 1 && !isInviteMember(member) && isSuperAdminRole(member.role)) {
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

function handleRbacInviteUpdateError(error: { message?: string }, options: { toast?: boolean } = {}) {
  const rawMessage = error.message ?? t('unexpected-response')
  let toastMessage = ''
  if (error.message?.includes('NO_PERMISSION_TO_UPDATE_ROLES')) {
    toastMessage = t('no-permission')
  }
  else if (error.message?.includes('NO_INVITATION')) {
    toastMessage = t('cannot-change-permission')
  }
  else if (error.message?.includes('ROLE_NOT_FOUND')) {
    toastMessage = t('cannot-change-permission')
  }
  else if (error.message?.includes('RBAC_NOT_ENABLED')) {
    toastMessage = t('cannot-change-permission')
  }
  else {
    toastMessage = `${t('cannot-change-permission')}: ${rawMessage}`
  }
  if (options.toast !== false) {
    toast.error(toastMessage)
  }
  return toastMessage
}

async function updateRbacMemberRole(member: OrganizationMemberRow, perm: string) {
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

async function updateRbacInviteRole(member: OrganizationMemberRow, perm: string) {
  const orgId = currentOrganization.value?.gid ?? ''
  if (!orgId) {
    toast.error(t('cannot-change-permission'))
    return
  }

  const { data, error } = member.is_tmp
    ? await supabase.rpc('update_tmp_invite_role_rbac', {
        p_org_id: orgId,
        p_email: member.email,
        p_new_role_name: perm,
      })
    : await supabase.rpc('update_org_invite_role_rbac', {
        p_org_id: orgId,
        p_user_id: member.uid,
        p_new_role_name: perm,
      })

  if (error) {
    console.error('Error updating RBAC invite role:', error)
    handleRbacInviteUpdateError(error)
    return
  }

  if (data === 'OK') {
    toast.success(t('permission-changed'))
    await reloadData()
    return
  }

  if (data) {
    const responseMessage = typeof data === 'string' ? data : JSON.stringify(data)
    console.warn('Unexpected RBAC invite update response:', responseMessage)
    const toastMessage = handleRbacInviteUpdateError({ message: responseMessage }, { toast: false })
    toast.error(toastMessage)
  }
}

async function updateTmpMemberRole(member: OrganizationMemberRow, perm: Database['public']['Enums']['user_min_right']) {
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

async function updateLegacyMemberRole(member: OrganizationMemberRow, perm: Database['public']['Enums']['user_min_right']) {
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

async function _changeMemberPermission(member: OrganizationMemberRow, perm: Database['public']['Enums']['user_min_right'] | string) {
  isLoading.value = true
  try {
    if (useNewRbac.value && currentOrganization.value) {
      if (isInviteMember(member)) {
        await updateRbacInviteRole(member, perm as string)
      }
      else {
        await updateRbacMemberRole(member, perm as string)
      }
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

async function changeMemberPermission(member: OrganizationMemberRow) {
  const isInvite = useNewRbac.value ? isInviteMember(member) : member.role.includes('invite')
  const perm = await showPermModal(isInvite, undefined, member.role)

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

function canDelete(member: OrganizationMemberRow) {
  const role = organizationStore.currentRole
  const currentUserId = main.user?.id
  if (!role || !currentUserId)
    return false

  const isSelf = member.uid === currentUserId

  if (isSelf)
    return true

  const currentUserIsAdmin = role === 'admin'
    || role === 'super_admin'
    || role === 'org_admin'
    || role === rbacSuperAdminRole

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
  handlePermissionSelection(value, isInvitePermissionModal.value)
}

function delegateSuperAdmin(value: unknown) {
  if (!value)
    return
  selectedUserToDelegateAdmin.value = value
}

async function showInviteNewUserDialog(email: string, roleType: Database['public']['Enums']['user_min_right'] | string) {
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
  resetInviteCaptcha()

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

function getRoleDisplayName(roleName?: string): string {
  if (!roleName)
    return t('none')
  const normalizedRole = roleName.replace(/^invite_/, '')
  const i18nKey = getRbacRoleI18nKey(normalizedRole)
  return i18nKey ? t(i18nKey) : normalizedRole.replaceAll('_', ' ')
}

async function fetchAppAccessApps() {
  if (!currentOrganization.value)
    return
  try {
    const { data, error } = await supabase
      .from('apps')
      .select('id, app_id, name')
      .eq('owner_org', currentOrganization.value.gid)

    if (error)
      throw error

    appAccessApps.value = (data || []).filter(app => !!app.id) as OrgApp[]
  }
  catch (error) {
    console.error('Error fetching apps:', error)
    appAccessApps.value = []
  }
}

async function fetchAvailableAppRoles() {
  try {
    const { data, error } = await supabase
      .from('roles')
      .select('id, name, scope_type, description, priority_rank')
      .eq('scope_type', 'app')
      .eq('is_assignable', true)
      .order('priority_rank')

    if (error)
      throw error

    availableAppRoles.value = (data || []) as Role[]
  }
  catch (error) {
    console.error('Error fetching app roles:', error)
    availableAppRoles.value = []
  }
}

async function fetchMemberAppBindings(member: OrganizationMemberRow) {
  if (!currentOrganization.value)
    return
  try {
    const { data, error } = await supabase.functions.invoke(`private/role_bindings/${currentOrganization.value.gid}`, {
      method: 'GET',
    })

    if (error)
      throw error

    appAccessBindings.value = (data || []).filter((binding: RoleBinding) => {
      return binding.scope_type === 'app'
        && binding.principal_type === 'user'
        && binding.principal_id === member.uid
    })

    if (appAccessSelectedAppIds.value.length === 1 && !appAccessSelectedRole.value && !appAccessRoleTouched.value) {
      const binding = appAccessBindings.value.find(b => b.app_id === appAccessSelectedAppIds.value[0])
      if (binding)
        appAccessSelectedRole.value = binding.role_name
    }
  }
  catch (error) {
    console.error('Error fetching role bindings:', error)
    appAccessBindings.value = []
  }
}

function updateAppAccessSaveButton() {
  const buttons = dialogStore.dialogOptions?.buttons
  if (!buttons)
    return
  const saveButton = buttons.find(b => b.id === 'app-access-save')
  if (!saveButton)
    return
  saveButton.disabled = isAppAccessSubmitting.value || !isAppAccessSelectionValid.value
}

async function openAppAccessModal(member: OrganizationMemberRow) {
  if (!currentOrganization.value || !useNewRbac.value) {
    toast.error(t('no-permission'))
    return
  }

  appAccessMember.value = member
  appAccessSearch.value = ''
  appAccessSelectedAppIds.value = []
  appAccessSelectedRole.value = ''
  appAccessRoleTouched.value = false

  dialogStore.openDialog({
    id: 'org-member-app-access',
    title: t('app-access-control'),
    description: t('app-access-control-description'),
    size: 'xl',
    preventAccidentalClose: true,
    buttons: [
      {
        text: t('close'),
        role: 'cancel',
      },
      {
        text: t('assign'),
        id: 'app-access-save',
        role: 'primary',
        preventClose: true,
        handler: handleAppAccessAssign,
      },
    ],
  })

  isAppAccessLoading.value = true
  try {
    await Promise.all([
      fetchAppAccessApps(),
      fetchAvailableAppRoles(),
      fetchMemberAppBindings(member),
    ])
  }
  finally {
    isAppAccessLoading.value = false
    updateAppAccessSaveButton()
  }

  await dialogStore.onDialogDismiss()
  appAccessMember.value = null
}

async function handleAppAccessAssign() {
  if (!appAccessMember.value || !currentOrganization.value) {
    toast.error(t('no-permission'))
    return false
  }

  if (appAccessSelectedAppIds.value.length === 0) {
    toast.error(t('select-app', 'Select an app'))
    return false
  }

  if (!appAccessSelectedRole.value) {
    toast.error(t('please-select-permission'))
    return false
  }

  isAppAccessSubmitting.value = true
  updateAppAccessSaveButton()
  try {
    const { data: roleData, error: roleError } = await supabase
      .from('roles')
      .select('id')
      .eq('name', appAccessSelectedRole.value)
      .single()

    if (roleError || !roleData)
      throw roleError || new Error('Role not found')

    const bindingMap = appAccessBindingByAppId.value
    let createdCount = 0
    let updatedCount = 0

    for (const appId of appAccessSelectedAppIds.value) {
      const existingBinding = bindingMap.get(appId)
      if (existingBinding && existingBinding.role_name === appAccessSelectedRole.value) {
        continue
      }

      if (existingBinding) {
        const { error: updateError } = await supabase
          .from('role_bindings')
          .update({ role_id: roleData.id })
          .eq('id', existingBinding.id)

        if (updateError)
          throw updateError

        updatedCount += 1
      }
      else {
        const { error } = await supabase.functions.invoke('private/role_bindings', {
          method: 'POST',
          body: {
            principal_type: 'user',
            principal_id: appAccessMember.value.uid,
            role_name: appAccessSelectedRole.value,
            scope_type: 'app',
            org_id: currentOrganization.value.gid,
            app_id: appId,
            channel_id: null,
          },
        })

        if (error)
          throw error

        createdCount += 1
      }
    }

    if (updatedCount > 0) {
      toast.success(t('permission-changed'))
    }
    else if (createdCount > 0) {
      toast.success(t('role-assigned'))
    }
    await fetchMemberAppBindings(appAccessMember.value)
    return true
  }
  catch (error: any) {
    console.error('Error assigning app role:', error)
    toast.error(t('error-assigning-role'))
    return false
  }
  finally {
    isAppAccessSubmitting.value = false
    updateAppAccessSaveButton()
  }
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
      const errorMessage = await resolveInviteNewUserErrorMessage(error, t)
      toast.error(errorMessage ?? t('invitation-failed', 'Invitation failed'))
      resetInviteCaptcha()
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
    const errorMessage = await resolveInviteNewUserErrorMessage(error, t)
    toast.error(errorMessage ?? t('invitation-failed', 'Invitation failed'))
    resetInviteCaptcha()
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
      <div v-if="rbacSystemEnabled && useNewRbac" class="items-start gap-3 mb-4 d-alert d-alert-info">
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
      <DataTable
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

    <!-- Teleport for app access modal -->
    <Teleport
      v-if="dialogStore.showDialog && dialogStore.dialogOptions?.id === 'org-member-app-access'"
      defer
      to="#dialog-v2-content"
    >
      <div class="w-full">
        <div class="max-h-[75vh] overflow-hidden">
          <div class="grid h-full gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <SearchInput
                v-model="appAccessSearch"
                :placeholder="t('search-apps', 'Search apps')"
                :disabled="isAppAccessLoading"
              />
              <div class="mt-3 overflow-hidden border rounded-lg dark:border-gray-600">
                <div v-if="isAppAccessLoading" class="p-4 text-sm text-gray-500">
                  {{ t('loading') }}
                </div>
                <div v-else-if="filteredAppAccessApps.length" class="max-h-[55vh] space-y-2 overflow-y-auto p-3">
                  <label
                    v-for="app in filteredAppAccessApps"
                    :key="app.id"
                    class="flex items-start gap-3 p-3 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                    :class="{ 'bg-gray-50 dark:bg-gray-800': appAccessSelectedAppIds.includes(app.id) }"
                  >
                    <input
                      v-model="appAccessSelectedAppIds"
                      type="checkbox"
                      name="app-access-app"
                      :value="app.id"
                      class="mt-1 checkbox checkbox-primary"
                    >
                    <div class="flex flex-col">
                      <span class="text-sm font-medium">
                        {{ app.name || app.app_id }}
                      </span>
                      <span class="text-xs text-gray-500">
                        {{ app.app_id }}
                      </span>
                      <span v-if="getAppAccessLabel(app.id)" class="text-xs text-primary">
                        {{ getAppAccessLabel(app.id) }}
                      </span>
                    </div>
                  </label>
                </div>
                <div v-else class="p-4 text-sm text-gray-500">
                  {{ t('no-results') }}
                </div>
              </div>
            </div>

            <div>
              <div class="mb-4">
                <div class="text-xs uppercase text-gray-500">
                  {{ t('app') }} · {{ t('role') }}
                </div>
                <div class="text-sm font-medium">
                  <span v-if="appAccessSelectedAppIds.length === 1">
                    {{ selectedAppAccessBinding ? getRoleDisplayName(selectedAppAccessBinding.role_name) : t('none') }}
                  </span>
                  <span v-else-if="appAccessSelectedAppIds.length > 1">
                    {{ t('selected-apps', 'Selected apps') }}: {{ appAccessSelectedAppIds.length }}
                  </span>
                  <span v-else>
                    {{ t('none') }}
                  </span>
                </div>
                <div v-if="selectedAppAccessApp" class="text-xs text-gray-500">
                  {{ selectedAppAccessApp.name || selectedAppAccessApp.app_id }}
                </div>
              </div>

              <RoleSelect
                v-model="appAccessSelectedRole"
                :roles="availableAppRoles.map(role => ({
                  ...role,
                  description: `${getRoleDisplayName(role.name)} - ${role.description}`,
                }))"
                :label="t('select-app-role')"
                :disabled="appAccessSelectedAppIds.length === 0 || isAppAccessLoading"
                @update:model-value="appAccessRoleTouched = true"
              />
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
