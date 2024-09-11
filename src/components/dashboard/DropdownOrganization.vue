<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { onMounted } from 'vue'
import { useI18n } from 'petite-vue-i18n'
import { toast } from 'vue-sonner'
import type { Organization } from '~/stores/organization'
import { useOrganizationStore } from '~/stores/organization'
import { useDisplayStore } from '~/stores/display'
import { useSupabase } from '~/services/supabase'
import { useMainStore } from '~/stores/main'
import Plus from '~icons/heroicons/plus'
import IconDown from '~icons/material-symbols/keyboard-arrow-down-rounded'

const router = useRouter()
const organizationStore = useOrganizationStore()
const { currentOrganization } = storeToRefs(organizationStore)
const displayStore = useDisplayStore()
const { t } = useI18n()
const supabase = useSupabase()
const main = useMainStore()
const dropdown = ref<HTMLElement | null>(null)

onClickOutside(dropdown, () => closeDropdown())

onMounted(async () => {
  await organizationStore.fetchOrganizations()
})

async function handleOrganizationInvitation(org: Organization) {
  const newName = t('alert-accept-inviation').replace('%ORG%', org.name)
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

          switch (data) {
            case 'OK':
              organizationStore.setCurrentOrganization(org.gid)
              organizationStore.fetchOrganizations()
              toast.success(t('invite-accepted'))
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
  if (router.currentRoute.value.path !== '/app/home')
    router.push(`/app/home`)
}

async function createNewOrg() {
  console.log('new org!')

  displayStore.dialogOption = {
    header: t('create-new-org'),
    message: `${t('type-new-org-name')}`,
    input: true,
    headerStyle: 'w-full text-center',
    textStyle: 'w-full text-center',
    size: 'max-w-lg',
    buttonCenter: true,
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('button-confirm'),
        id: 'confirm-button',
        handler: async () => {
          console.log('new org', displayStore.dialogInputText)

          const { error } = await supabase.from('orgs')
            .insert({
              name: displayStore.dialogInputText,
              created_by: main.auth?.id ?? '',
              management_email: main.auth?.email ?? '',
            })

          if (error) {
            console.error('Error when creating org', error)
            toast.error(error.code === '23505' ? t('org-with-this-name-exists') : t('cannot-create-org'))
            return
          }

          toast.success(t('org-created-successfully'))
          await organizationStore.fetchOrganizations()
        },
      },
    ],
  }
  displayStore.showDialog = true
  return displayStore.onDialogDismiss()
}
</script>

<template>
  <div>
    <details v-show="currentOrganization" ref="dropdown" class="dropdown dropdown-end">
      <summary class="m-1 btn btn-outline btn-sm text-slate-800 dark:text-white">
        <div class="hidden md:block">
          {{ currentOrganization?.name }}
        </div>
        <div class="block md:hidden">
          {{ currentOrganization?.name.substring(0, 3) }}..
        </div>
        <div class="flex items-center truncate">
          <IconDown class="w-6 h-6 ml-1 fill-current text-slate-400" />
        </div>
      </summary>
      <ul class="dropdown-content dark:bg-base-100 bg-white rounded-box z-[1] w-52 p-2 shadow" @click="closeDropdown()">
        <li v-for="org in organizationStore.organizations" :key="org.gid">
          <a
            class="block px-4 py-2 text-center hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white"
            @click="onOrganizationClick(org)"
          >
            {{ org.name }}
          </a>
        </li>
        <li>
          <a
            class="block px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white"
            @click="createNewOrg"
          ><Plus class="mx-auto " />
          </a>
        </li>
      </ul>
    </details>
  </div>
</template>
