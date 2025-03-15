<script setup lang="ts">
import type { ExtendedOrganizationMember, ExtendedOrganizationMembers } from '~/stores/organization'
import type { Database } from '~/types/supabase.types'
import { useI18n } from 'petite-vue-i18n'
import { storeToRefs } from 'pinia'
import { onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import Plus from '~icons/heroicons/plus'
import Trash from '~icons/heroicons/trash'
import Wrench from '~icons/heroicons/Wrench'
import iconEmail from '~icons/oui/email?raw'
import iconName from '~icons/ph/user?raw'
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

const members = ref([] as ExtendedOrganizationMembers)

watch(currentOrganization, async () => {
  members.value = await organizationStore.getMembers()
})

onMounted(async () => {
  members.value = await organizationStore.getMembers()
})

// Do not ask me, I don't know how to do it better
// This was stolen from some stack overflow answer
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

          if (!email)
            toast.error(t('missing-email'))

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
  const permision = await permisionPromise

  if (!permision || !email)
    return

  await sendInvitation(email, permision)
}

async function sendInvitation(email: string, type: Database['public']['Enums']['user_min_right']) {
  console.log(`Invite ${email} with perm ${type}`)

  const orgId = currentOrganization.value?.gid
  if (!orgId)
    return

  const { data, error } = await supabase.rpc('invite_user_to_org', {
    email,
    org_id: orgId,
    invite_type: type,
  })

  if (error)
    throw error

  handleSendInvitationOutput(data, email, type)
  members.value = await organizationStore.getMembers()
}

async function showUserCreationModal(email: string, inviteType: Database['public']['Enums']['user_min_right']) {
  let firstName = ''
  let lastName = ''

  displayStore.dialogOption = {
    header: t('please-create-user-account'),
    size: 'max-w-md',
    customContent: true,
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('button-invite'),
        id: 'confirm-button',
        handler: async () => {
          if (!firstName || !lastName) {
            toast.error(t('missing-name'))
            return
          }

          await createUserAndInvite(email, firstName, lastName, inviteType)
        },
      },
    ],
    customContentRender: () => {
      return `
        <div class="space-y-4 p-4">
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">${t('email')}</label>
            <div class="mt-1 flex rounded-md shadow-sm">
              <span class="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300">
                ${iconEmail}
              </span>
              <input type="text" disabled value="${email}" class="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border border-gray-300 bg-gray-100 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 focus:outline-none sm:text-sm" />
            </div>
          </div>
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">${t('first-name')}</label>
            <div class="mt-1 flex rounded-md shadow-sm">
              <span class="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300">
                ${iconName}
              </span>
              <input type="text" id="first-name-input" class="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border border-gray-300 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 focus:outline-none sm:text-sm" />
            </div>
          </div>
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">${t('last-name')}</label>
            <div class="mt-1 flex rounded-md shadow-sm">
              <span class="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300">
                ${iconName}
              </span>
              <input type="text" id="last-name-input" class="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border border-gray-300 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 focus:outline-none sm:text-sm" />
            </div>
          </div>
        </div>
      `
    },
  }

  displayStore.showDialog = true
  await displayStore.onDialogDismiss()

  // Get the values from the inputs after the dialog is shown
  const firstNameInput = document.getElementById('first-name-input') as HTMLInputElement
  const lastNameInput = document.getElementById('last-name-input') as HTMLInputElement

  if (firstNameInput && lastNameInput) {
    firstNameInput.addEventListener('input', (e) => {
      firstName = (e.target as HTMLInputElement).value
    })
    lastNameInput.addEventListener('input', (e) => {
      lastName = (e.target as HTMLInputElement).value
    })
  }
}

async function createUserAndInvite(email: string, firstName: string, lastName: string, inviteType: Database['public']['Enums']['user_min_right']) {
  const orgId = currentOrganization.value?.gid
  if (!orgId)
    return

  try {
    const { data, error } = await supabase.functions.invoke('organization/members/create_user', {
      body: {
        orgId,
        email,
        first_name: firstName,
        last_name: lastName,
        invite_type: inviteType,
      },
    })

    if (error) {
      console.error('Error creating user:', error)
      toast.error(t('error-creating-user'))
      return
    }

    if (data.status === 'OK') {
      toast.success(t('org-invited-user'))
      members.value = await organizationStore.getMembers()
    }
    else {
      toast.error(data.status)
    }
  }
  catch (error) {
    console.error('Error invoking function:', error)
    toast.error(t('error-creating-user'))
  }
}

function handleSendInvitationOutput(output: string, email: string, inviteType: Database['public']['Enums']['user_min_right']) {
  console.log('Output: ', output)
  switch (output) {
    case 'OK': {
      toast.success(t('org-invited-user'))
      break
    }
    case 'CREATE_USER': {
      // Show modal to create user
      showUserCreationModal(email, inviteType)
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
  return displayStore.onDialogDismiss()
}

async function deleteMember(member: ExtendedOrganizationMember) {
  if (await didCancel())
    return

  if (member.aid === 0) {
    toast.error(t('cannot-delete-owner'))
    return
  }

  const { error } = await supabase.from('org_users').delete().eq('id', member.aid)
  if (error) {
    console.log('Error delete: ', error)
    toast.error(t('cannot-delete-member'))
  }

  if (member.uid === main.user?.id) {
    organizationStore.fetchOrganizations()
    organizationStore.setCurrentOrganizationToMain()
  }
  else {
    members.value = await organizationStore.getMembers()
  }

  toast.success(t('member-deleted'))
}

async function changeMemberPermission(member: ExtendedOrganizationMember) {
  const perm = await showPermModal(member.role.includes('invite'))

  if (!perm)
    return

  const { error } = await supabase.from('org_users').update({ user_right: perm }).eq('id', member.aid)
  if (error) {
    console.log('Error delete: ', error)
    toast.error(t('cannot-change-permission'))
  }

  toast.success(t('permission-changed'))
  members.value = await organizationStore.getMembers()
}
function acronym(email: string) {
  let res = 'NA'
  const prefix = email.split('@')[0]
  // search for a dot and if there is more than 2 chars, if yes use the first 2 chars of each word
  if (prefix.length > 2 && prefix.includes('.')) {
    const first_name = prefix.split('.')[0]
    const last_name = prefix.split('.')[1]
    res = first_name[0] + last_name[0]
  }
  else if (prefix) {
    res = prefix[0] + prefix[1]
  }
  return res.toUpperCase()
}
function canEdit(member: ExtendedOrganizationMember) {
  return (organizationStore.hasPermisisonsInRole(organizationStore.currentRole, ['admin', 'super_admin'])) && (member.uid !== currentOrganization?.value?.created_by)
}
function isSuperAdmin() {
  return organizationStore.hasPermisisonsInRole(organizationStore.currentRole, ['super_admin'])
}
function canDelete(member: ExtendedOrganizationMember) {
  return (member.uid === main.user?.id || currentOrganization?.value?.created_by === main.user?.id || organizationStore.currentRole === 'admin') && member.uid !== currentOrganization?.value?.created_by
}
</script>

<template>
  <div>
    <div class="h-full p-8 overflow-hidden max-h-fit grow md:pb-0">
      <div class="flex justify-between w-full">
        <h2 class="mb-5 text-2xl font-bold text-slate-800 dark:text-white">
          {{ t('members') }}
        </h2>
        <button type="button" class="btn btn-outline btn-secondary" @click="showInviteModal">
          <Plus />
          <p class="hidden ml-2 md:block">
            {{ t('add-member') }}
          </p>
        </button>
      </div>
      <div class="flex flex-col overflow-y-auto md:mx-auto md:mt-5 md:w-full ">
        <dl id="members-div" class="divide-y dark:divide-slate-500 divide-slate-200">
          <div v-for="member in members" :key="member.id">
            <div id="member-card" class="flex justify-between my-2 ml-2 md:my-6">
              <div class="hidden md:flex">
                <img
                  v-if="member?.image_url" class="object-cover w-20 h-20 mask mask-squircle" :src="member.image_url"
                  width="80" height="80" alt="profile"
                >
                <div v-else class="flex items-center justify-center w-20 h-20 text-4xl border rounded-full border-slate-900 dark:border-slate-500">
                  <p>{{ acronym(member.email) }}</p>
                </div>
              </div>
              <div id="user-email" class="mt-auto mb-auto text-center ml-1/3 mr-1/3">
                {{ `${member.email} (${member.role.replaceAll('_', ' ')})` }}
              </div>
              <div class="mt-auto mb-auto mr-4">
                <button id="wrench-button" class="ml-4 bg-transparent w-7 h-7" :class="{ visible: canEdit(member), invisible: !canEdit(member) }" @click="changeMemberPermission(member)">
                  <Wrench class="mr-4 text-lg text-[#397cea]" />
                </button>
                <button id="trash-button" class="ml-4 bg-transparent w-7 h-7" :class="{ visible: canDelete(member), invisible: !canDelete(member) }" @click="deleteMember(member)">
                  <Trash class="mr-4 text-lg text-red-600" />
                </button>
              </div>
            </div>
          </div>
        </dl>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
</route>
