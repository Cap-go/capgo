<script setup lang="ts">
import { FormKit } from '@formkit/vue'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { useI18n } from 'petite-vue-i18n'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import iconEmail from '~icons/oui/email?raw'
import iconName from '~icons/ph/user?raw'
import { pickPhoto, takePhoto } from '~/services/photos'
import { useSupabase } from '~/services/supabase'
import { useDialogV2Store } from '~/stores/dialogv2'
import { useOrganizationStore } from '~/stores/organization'
import DeleteOrgDialog from './DeleteOrgDialog.vue'

const { t } = useI18n()
const displayStore = useDisplayStore()
const organizationStore = useOrganizationStore()
const dialogStore = useDialogV2Store()
const supabase = useSupabase()
const isLoading = ref(true)
const dialogRef = ref()

displayStore.NavTitle = t('organization')
onMounted(async () => {
  await organizationStore.dedupFetchOrganizations()
  isLoading.value = false
})

const { currentOrganization } = storeToRefs(organizationStore)
const orgName = ref(currentOrganization.value?.name ?? '')
const email = ref(currentOrganization.value?.management_email ?? '')

watch(currentOrganization, (newOrg) => {
  if (newOrg) {
    orgName.value = newOrg.name
    email.value = newOrg.management_email
  }
})

async function presentActionSheet() {
  if (!currentOrganization.value || (!organizationStore.hasPermisisonsInRole(organizationStore.currentRole, ['admin', 'super_admin']))) {
    toast.error(t('no-permission'))
    return
  }

  dialogStore.openDialog({
    title: t('change-your-picture'),
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('button-camera'),
        role: 'primary',
        id: 'camera-button',
        handler: async () => {
          takePhoto('update-org', isLoading, 'org', '')
        },
      },
      {
        text: t('button-browse'),
        role: 'secondary',
        id: 'browse-button',
        handler: () => {
          pickPhoto('update-org', isLoading, 'org', '')
        },
      },
    ],
  })
  return dialogStore.onDialogDismiss()
}

async function toastError(error: any) {
  if (error instanceof FunctionsHttpError && error.context instanceof Response) {
    const json = await error.context.json<{ status: string }>()
    if (json.status && typeof json.status === 'string') {
      if (json.status === 'email_not_unique')
        toast.error(t('org-changes-set-email-not-unique'))
      else
        toast.error(`${t('org-changes-set-email-other-error')}. ${t('error')}: ${json.status}`)
    }
    else {
      toast.error(t('org-changes-set-email-other-error'))
    }
  }
  else {
    toast.error(t('org-changes-set-email-other-error'))
  }
}

async function updateEmail(form: { email: string }) {
  if (!currentOrganization.value)
    return false
  const orgCopy = { ...currentOrganization.value }

  const { error } = await supabase.functions.invoke('private/set_org_email', {
    body: {
      emial: form.email,
      org_id: orgCopy.gid,
    },
  })

  if (error) {
    await toastError(error)
    // Revert the optimistic update
    currentOrganization.value.management_email = orgCopy.management_email
    return true
  }

  return false
}

async function saveChanges(form: { orgName: string, email: string }) {
  if (!currentOrganization.value || (!organizationStore.hasPermisisonsInRole(organizationStore.currentRole, ['admin', 'super_admin']))) {
    toast.error(t('no-permission'))
    return
  }

  const gid = currentOrganization.value.gid

  if (!gid) {
    console.error('No current org id')
    return
  }

  const orgCopy = { ...currentOrganization.value }

  // Optimistic update
  currentOrganization.value.name = form.orgName
  currentOrganization.value.management_email = form.email
  isLoading.value = true

  // Update name only
  const { error } = await supabase
    .from('orgs')
    .update({ name: form.orgName })
    .eq('id', gid)

  if (error) {
    // TODO: INFORM USER THAT HE IS NOT ORG OWNER
    console.log(`Cannot save changes: ${error}`)

    // Revert the optimistic update
    currentOrganization.value.name = orgCopy.name
    isLoading.value = false
    return
  }

  let hasErrored = false
  if (orgCopy.management_email !== form.email) {
    // The management email has changed, call the edge function
    hasErrored = await updateEmail(form)
  }

  isLoading.value = false
  if (!hasErrored)
    toast.success(t('org-changes-saved'))
}

const hasOrgPerm = computed(() => {
  return organizationStore.hasPermisisonsInRole(organizationStore.currentRole, ['admin', 'super_admin'])
})

const acronym = computed(() => {
  let res = 'N/A'
  // use currentOrganization.value?.name first letter of 2 first words or first 2 letter of first word or N/A
  if (currentOrganization.value?.name) {
    const words = currentOrganization.value.name.split(' ')
    if (words.length > 1)
      res = words[0][0] + words[1][0]
    else
      res = words[0].slice(0, 2)
  }
  return res.toUpperCase()
})

function canDeleteOrg() {
  return currentOrganization.value?.role === 'super_admin'
    && organizationStore.organizations.length > 1
}

async function deleteOrganization() {
  dialogRef.value?.open()
}

async function copyOrganizationId() {
  if (!currentOrganization.value?.gid)
    return
  try {
    await navigator.clipboard.writeText(currentOrganization.value.gid.toString())
    toast.success(t('copied-to-clipboard'))
  }
  catch (err) {
    console.error('Failed to copy: ', err)
    // Display a modal with the copied key
    dialogStore.openDialog({
      title: t('cannot-copy'),
      description: currentOrganization.value.gid.toString(),
      buttons: [
        {
          text: t('button-cancel'),
          role: 'cancel',
        },
      ],
    })
    await dialogStore.onDialogDismiss()
  }
}
</script>

<template>
  <div>
    <div class="h-full pb-8 max-h-fit grow md:pb-0">
      <FormKit id="update-org" type="form" :actions="false" @submit="saveChanges">
        <div class="p-6 space-y-6">
          <h2 class="mb-5 text-2xl font-bold text-slate-800 dark:text-white">
            {{ t('general-information') }}
          </h2>
          <div clas="dark:text-gray-100">
            {{ t('modify-org-info') }}
          </div>
          <section>
            <div class="flex items-center">
              <div class="mr-4">
                <img
                  v-if="!!currentOrganization?.logo"
                  id="org-avatar" class="object-cover w-20 h-20 d-mask d-mask-squircle" :src="currentOrganization.logo"
                  width="80" height="80" alt="User upload"
                >
                <div v-else class="p-6 text-xl bg-gray-700 d-mask d-mask-squircle">
                  <span class="font-medium text-gray-300">
                    {{ acronym }}
                  </span>
                </div>
              </div>
              <button id="change-org-pic" type="button" class="cursor-pointer px-3 py-2 text-xs font-medium text-center text-black border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-white border-slate-500 focus:ring-4 focus:outline-hidden focus:ring-blue-300 dark:focus:ring-blue-800" @click="presentActionSheet">
                {{ t('change') }}
              </button>
            </div>
          </section>
          <div class="mt-5 space-y-4">
            <div class="w-full md:pr-[50%]">
              <FormKit
                type="text"
                name="orgName"
                autocomplete="given-name"
                :prefix-icon="iconName"
                :disabled="!hasOrgPerm"
                :value="orgName"
                validation="required:trim"
                enterkeyhint="next"
                autofocus
                :label="t('organization-name')"
              />
            </div>
            <div class="w-full md:pr-[50%]">
              <FormKit
                type="email"
                name="email"
                :prefix-icon="iconEmail"
                autocomplete="given-name"
                :disabled="!hasOrgPerm"
                :value="email"
                validation="required:trim" enterkeyhint="next"
                autofocus
                :label="t('organization-email')"
              />
            </div>
            <div class="flex flex-col md:flex-row md:items-center items-left">
              <p class="text-slate-800 dark:text-white">
                {{ t('organization-id') }}
              </p>
              <div class="pt-2 md:pt-0 md:ml-6">
                <button type="button" class="px-3 cursor-pointer py-2 text-xs font-medium text-center text-gray-700 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-white border-slate-500 focus:ring-4 focus:outline-hidden focus:ring-blue-300 dark:focus:ring-blue-800" @click.prevent="copyOrganizationId()">
                  {{ t('copy-organization-id') }}
                </button>
              </div>
            </div>
          </div>
          <footer style="margin-top: auto">
            <div class="flex flex-col px-2 md:px-6 py-5 border-t border-slate-300">
              <div class="flex self-end">
                <button
                  class="cursor-pointer p-2 text-red-600 border border-red-400 rounded-lg hover:bg-red-600 hover:text-white"
                  color="secondary"
                  shape="round"
                  type="button"
                  :class="{
                    invisible: !canDeleteOrg(),
                  }"
                  @click="() => deleteOrganization()"
                >
                  <span v-if="!isLoading" class="rounded-4xl truncate">
                    {{ t('delete-org') }}
                  </span>
                  <Spinner v-else size="w-4 h-4" class="px-4 pt-0 pb-0" color="fill-gray-100 text-gray-200 dark:text-gray-600" />
                </button>
                <button
                  id="save-changes"
                  class="cursor-pointer p-2 ml-3 text-white bg-blue-500 rounded-lg d-btn hover:bg-blue-600"
                  type="submit"
                  color="secondary"
                  shape="round"
                >
                  <span v-if="!isLoading" class="rounded-4xl">
                    {{ t('update') }}
                  </span>
                  <Spinner v-else size="w-4 h-4" class="px-4 pt-0 pb-0" color="fill-gray-100 text-gray-200 dark:text-gray-600" />
                </button>
              </div>
            </div>
          </footer>
        </div>
      </FormKit>
    </div>
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
