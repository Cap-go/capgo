<script setup lang="ts">
import type { Organization } from '~/stores/organization'
import { storeToRefs } from 'pinia'
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import IconDown from '~icons/material-symbols/keyboard-arrow-down-rounded'
import { useSupabase } from '~/services/supabase'
import { useDialogV2Store } from '~/stores/dialogv2'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'

const router = useRouter()
const organizationStore = useOrganizationStore()
const { currentOrganization } = storeToRefs(organizationStore)
const dialogStore = useDialogV2Store()
const { t } = useI18n()
const supabase = useSupabase()
const main = useMainStore()
const dropdown = useTemplateRef('dropdown')
const hasNewInvitation = ref(false)
const orgNameInput = ref('')

onClickOutside(dropdown, () => closeDropdown())

onMounted(async () => {
  await organizationStore.fetchOrganizations()
    .catch((error) => {
      console.error('Cannot get orgs!', error)
      createNewOrg()
    })
  hasNewInvitation.value = organizationStore.organizations.some(org => org.role.startsWith('invite'))
})

async function handleOrganizationInvitation(org: Organization) {
  const newName = t('alert-accept-invitation').replace('%ORG%', org.name)
  dialogStore.openDialog({
    title: t('alert-confirm-invite'),
    description: `${newName}`,
    buttons: [
      {
        text: t('button-join'),
        id: 'confirm-button',
        handler: async () => {
          const { data, error } = await supabase.rpc('accept_invitation_to_org', {
            org_id: org.gid,
          })

          if (!data || error) {
            console.log('Error accept: ', error)
            return
          }

          if (data === 'OK') {
            organizationStore.setCurrentOrganization(org.gid)
            organizationStore.fetchOrganizations()
            toast.success(t('invite-accepted'))
          }
          else if (data === 'NO_INVITE') {
            toast.error(t('alert-no-invite'))
          }
          else if (data === 'INVALID_ROLE') {
            toast.error(t('alert-not-invited'))
          }
          else {
            toast.error(t('alert-unknown-error'))
          }
        },
      },
      {
        text: t('button-deny-invite'),
        id: 'deny-button',
        handler: async () => {
          const userId = main.user?.id
          if (userId === undefined)
            return

          const { error } = await supabase
            .from('org_users')
            .delete()
            .eq('user_id', userId)

          if (error)
            console.log('Error delete: ', error)

          organizationStore.fetchOrganizations()
          toast.success(t('alert-denied-invite'))
        },
      },
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
    ],
  })
}

function closeDropdown() {
  if (dropdown.value) {
    dropdown.value.removeAttribute('open')
  }
}

function onOrganizationClick(org: Organization) {
  // Check if the user is invited to the organization
  if (org.role.startsWith('invite')) {
    handleOrganizationInvitation(org)
    return
  }

  organizationStore.setCurrentOrganization(org.gid)
  // if current path is not home, redirect to the org home page
  // route.params.app
  if (router.currentRoute.value.path !== '/dashboard')
    router.push(`/dashboard`)
  // Note: When already on dashboard, the watch on currentOrganization in
  // organization.ts will trigger data reload via main.updateDashboard()
}

async function createNewOrg() {
  orgNameInput.value = ''

  dialogStore.openDialog({
    title: t('create-new-org'),
    description: `${t('type-new-org-name')}`,
    size: 'lg',
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('button-confirm'),
        role: 'primary',
        id: 'confirm-button',
        handler: async () => {
          const orgName = orgNameInput.value
          if (!orgName) {
            toast.error(t('org-name-required'))
            return false
          }

          const { error } = await supabase.from('orgs')
            .insert({
              name: orgName,
              created_by: main.auth?.id ?? '',
              management_email: main.auth?.email ?? '',
            })

          if (error) {
            console.error('Error when creating org', error)
            toast.error(error.code === '23505' ? t('org-with-this-name-exists') : t('cannot-create-org'))
            return false
          }

          toast.success(t('org-created-successfully'))
          await organizationStore.fetchOrganizations()
          const org = organizationStore.organizations.find(org => org.name === orgName)
          if (org) {
            console.log('org found', org)
            organizationStore.setCurrentOrganization(org.gid)
            currentOrganization.value = org
            router.push('/apps')
          }
          else {
            console.log('org not found', organizationStore.organizations)
          }
        },
      },
    ],
  })
  return dialogStore.onDialogDismiss()
}

function isSelected(org: Organization) {
  return !!(currentOrganization.value && org.gid === currentOrganization.value.gid)
}

function acronym(name: string) {
  const trimmed = name.trim()
  if (!trimmed)
    return '?'
  const parts = trimmed.split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const second = parts.length > 1 ? (parts[1]?.[0] ?? '') : (parts[0]?.[1] ?? '')
  return (first + second).toUpperCase()
}

function onOrgItemClick(org: Organization, e: MouseEvent) {
  if (isSelected(org)) {
    e.preventDefault()
    e.stopPropagation()
    return
  }
  onOrganizationClick(org)
}
</script>

<template>
  <div>
    <details v-show="currentOrganization" ref="dropdown" class="w-full d-dropdown d-dropdown-end">
      <summary class="justify-between shadow-none w-full d-btn d-btn-sm border border-gray-700 text-white bg-[#1a1d24] hover:bg-gray-700 hover:text-white active:text-white focus-visible:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-800">
        <div class="flex items-center w-4/5 text-left">
          <img
            v-if="currentOrganization?.logo"
            :src="currentOrganization.logo"
            :alt="`${currentOrganization.name} logo`"
            class="object-cover w-6 h-6 mr-2 rounded-sm d-mask d-mask-squircle shrink-0"
          >
          <div
            v-else
            class="flex items-center justify-center w-6 h-6 mr-2 text-xs font-semibold text-gray-300 bg-gray-700 rounded-sm d-mask d-mask-squircle shrink-0"
          >
            {{ acronym(currentOrganization?.name ?? '') }}
          </div>
          <span class="truncate">{{ currentOrganization?.name }}</span>
          <div v-if="hasNewInvitation" class="w-3 h-3 ml-1 bg-red-500 rounded-full" />
        </div>
        <IconDown class="w-6 h-6 ml-1 fill-current shrink-0 text-slate-400" />
      </summary>
      <div class="flex flex-col w-52 max-h-[60vh] shadow d-dropdown-content bg-[#1a1d24] rounded-box z-1 text-white" @click="closeDropdown()">
        <ul class="flex-1 overflow-y-auto p-2 cursor-pointer">
          <li
            v-for="org in organizationStore.organizations"
            :key="org.gid"
            class="block px-1 my-1 rounded-lg"
            :class="isSelected(org) ? 'bg-gray-700' : 'hover:bg-gray-600'"
          >
            <a
              class="flex items-center justify-between px-3 py-3 text-white rounded-md"
              :class="isSelected(org) ? 'cursor-default' : 'cursor-pointer'"
              :aria-current="isSelected(org) ? 'true' : undefined"
              @click="onOrgItemClick(org, $event)"
            >
              <div class="flex items-center min-w-0">
                <img
                  v-if="org.logo"
                  :src="org.logo"
                  :alt="`${org.name} logo`"
                  class="object-cover w-6 h-6 mr-2 rounded-sm d-mask d-mask-squircle shrink-0"
                >
                <div
                  v-else
                  class="flex items-center justify-center w-6 h-6 mr-2 text-xs font-semibold text-gray-300 bg-gray-700 rounded-sm d-mask d-mask-squircle shrink-0"
                >
                  {{ acronym(org.name) }}
                </div>
                <span class="truncate">{{ org.name }}</span>
              </div>
              <div class="flex items-center gap-2">
                <div v-if="org.role.startsWith('invite')" class="w-3 h-3 bg-red-500 rounded-full" />
              </div>
            </a>
          </li>
        </ul>
        <div class="p-2 border-t border-gray-700">
          <div class="block p-px rounded-lg from-cyan-500 to-purple-500 bg-linear-to-r">
            <a
              class="flex justify-center items-center py-3 px-3 text-center text-white rounded-lg bg-[#1a1d24] hover:bg-gray-600 cursor-pointer"
              @click="createNewOrg"
            >{{ t('add-organization') }}
            </a>
          </div>
        </div>
      </div>
    </details>
    <div v-show="!currentOrganization" class="p-px rounded-lg from-cyan-500 to-purple-500 bg-linear-to-r">
      <button class="block w-full text-white d-btn d-btn-outline bg-slate-800 d-btn-sm" @click="createNewOrg">
        {{ t('add-organization') }}
      </button>
    </div>

    <Teleport v-if="dialogStore.showDialog && dialogStore.dialogOptions?.title === t('create-new-org')" to="#dialog-v2-content" defer>
      <div class="w-full">
        <input
          v-model="orgNameInput"
          type="text"
          :placeholder="t('organization-name')"
          class="w-full p-3 text-gray-900 bg-white border border-gray-300 rounded-lg dark:text-white dark:bg-gray-800 dark:border-gray-600"
          @keydown.enter="$event.preventDefault()"
        >
      </div>
    </Teleport>
  </div>
</template>
