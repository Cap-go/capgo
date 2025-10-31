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
  const newName = t('alert-accept-inviation').replace('%ORG%', org.name)
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
  if (router.currentRoute.value.path !== '/app')
    router.push(`/app`)
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
            router.push('/app')
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
      <summary class="justify-between w-full d-btn d-btn-outline border border-gray-600 d-btn-sm text-white">
        <div class="flex items-center w-4/5 text-left">
          <span class="truncate">{{ currentOrganization?.name }}</span>
          <div v-if="hasNewInvitation" class="w-3 h-3 ml-1 bg-red-500 rounded-full" />
        </div>
        <IconDown class="shrink-0 w-6 h-6 ml-1 fill-current text-slate-400" />
      </summary>
      <ul class="d-dropdown-content bg-base-200 rounded-box z-1 w-52 p-2 shadow cursor-pointer" @click="closeDropdown()">
        <li
          v-for="org in organizationStore.organizations"
          :key="org.gid"
          class="block px-1 my-1 rounded-lg"
          :class="{ 'bg-gray-700': isSelected(org) }"
        >
          <a
            class="flex items-center justify-between px-3 py-3 text-white rounded-md"
            :class="isSelected(org) ? 'cursor-default' : 'hover:bg-gray-600 cursor-pointer'"
            :aria-current="isSelected(org) ? 'true' : undefined"
            @click="onOrgItemClick(org, $event)"
          >
            <span class="truncate">{{ org.name }}</span>
            <div class="flex items-center gap-2">
              <div v-if="org.role.startsWith('invite')" class="w-3 h-3 bg-red-500 rounded-full" />
            </div>
          </a>
        </li>
        <li class="block p-px rounded-lg hover:bg-gray-600 from-cyan-500 to-purple-500 bg-linear-to-r">
          <a
            class="flex items-center justify-center text-center px-3 py-3 hover:bg-gray-600 bg-base-200 rounded-lg text-white"
            @click="createNewOrg"
          >{{ t('add-organization') }}
          </a>
        </li>
      </ul>
    </details>
    <div v-show="!currentOrganization" class="p-px from-cyan-500 to-purple-500 bg-linear-to-r rounded-lg">
      <button class="d-btn d-btn-outline bg-slate-800 block w-full d-btn-sm text-white" @click="createNewOrg">
        {{ t('add-organization') }}
      </button>
    </div>

    <Teleport v-if="dialogStore.showDialog && dialogStore.dialogOptions?.title === t('create-new-org')" to="#dialog-v2-content" defer>
      <div class="w-full">
        <input
          v-model="orgNameInput"
          type="text"
          :placeholder="t('organization-name')"
          class="w-full p-3 border border-gray-600 rounded-lg bg-gray-800 text-white"
          @keydown.enter="$event.preventDefault()"
        >
      </div>
    </Teleport>
  </div>
</template>
