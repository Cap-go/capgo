<script setup lang="ts">
import { Dropdown, initDropdowns } from 'flowbite'
import { storeToRefs } from 'pinia'
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import type { Organization } from '~/stores/organization'
import { useOrganizationStore } from '~/stores/organization'
import { useDisplayStore } from '~/stores/display'
import { useSupabase } from '~/services/supabase'
import { useMainStore } from '~/stores/main'

const organizationStore = useOrganizationStore()
const { currentOrganization, organizations } = storeToRefs(organizationStore)
const displayStore = useDisplayStore()
const { t } = useI18n()
const supabase = useSupabase()
const main = useMainStore()

let dropdown: Dropdown

onMounted(async () => {
  await organizationStore.fetchOrganizations()

  initDropdowns()
  console.log(organizations)

  dropdown = new Dropdown(
    document.getElementById('dropdown-org'),
    document.getElementById('organization-picker'),
  )
})

async function handleOrganizationInvitation(org: Organization) {
  const newName = t('alert-accept-inviation').replace('%ORG%', org.name)
  console.log(newName)
  displayStore.dialogOption = {
    header: t('alert-confirm-invite'),
    message: `${newName}`,
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

          console.log('Data accept:', data)
          switch (data) {
            case 'OK':
              organizationStore.setCurrentOrganization(org.gid)
              organizationStore.fetchOrganizations()
              break
            case 'NO_INVITE':
              toast.error(t('alert-no-invite'))
              break
            case 'INVALID_ROLE':
              toast.error(t('alert-not-invited'))
              break
            default:
              toast.error(t('alert-unknown-error'))
              break
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
  }
  displayStore.showDialog = true
}

function onOrganizationClick(org: Organization) {
  console.log(org)
  console.log('Role: ', org.role)

  // Check if the user is invited to the organization
  if (org.role.startsWith('invite')) {
    handleOrganizationInvitation(org)
    return
  }

  organizationStore.setCurrentOrganization(org.gid)

  if (dropdown)
    dropdown.hide()
}
</script>

<template>
  <button v-if="currentOrganization" id="organization-picker" data-dropdown-toggle="dropdown-org" class="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center inline-flex items-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800" type="button">
    {{ currentOrganization?.name }}
    <svg class="w-2.5 h-2.5 ml-2.5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 10 6">
      <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m1 1 4 4 4-4" />
    </svg>
  </button>
  <div id="dropdown-org" class="z-10 hidden bg-white divide-y divide-gray-100 rounded-lg shadow w-44 dark:bg-gray-700">
    <ul class="py-2 text-sm text-gray-700 dark:text-gray-200" aria-labelledby="dropdownDefaultButton">
      <li v-for="org in organizations" :key="org.gid">
        <a class="block px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white" @click="onOrganizationClick(org)">{{ org.name }}</a>
      </li>
    </ul>
  </div>
</template>
