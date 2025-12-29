<script setup lang="ts">
import { FormKit } from '@formkit/vue'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import iconEmail from '~icons/heroicons/envelope?raw'
import iconName from '~icons/heroicons/user?raw'
import { pickPhoto, takePhoto } from '~/services/photos'
import { useSupabase } from '~/services/supabase'
import { useDialogV2Store } from '~/stores/dialogv2'
import { useDisplayStore } from '~/stores/display'
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

// API key policy state
const requireApikeyExpiration = ref(false)
const maxApikeyExpirationDays = ref<number | null>(null)

watch(currentOrganization, (newOrg) => {
  if (newOrg) {
    orgName.value = newOrg.name
    email.value = newOrg.management_email
    requireApikeyExpiration.value = newOrg.require_apikey_expiration ?? false
    maxApikeyExpirationDays.value = newOrg.max_apikey_expiration_days ?? null
  }
})

async function presentActionSheet() {
  if (!currentOrganization.value || (!organizationStore.hasPermissionsInRole(organizationStore.currentRole, ['admin', 'super_admin']))) {
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
      email: form.email,
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
  if (!currentOrganization.value || (!organizationStore.hasPermissionsInRole(organizationStore.currentRole, ['admin', 'super_admin']))) {
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
  currentOrganization.value.require_apikey_expiration = requireApikeyExpiration.value
  currentOrganization.value.max_apikey_expiration_days = maxApikeyExpirationDays.value
  isLoading.value = true

  // Update name and API key policy
  const { error } = await supabase
    .from('orgs')
    .update({
      name: form.orgName,
      require_apikey_expiration: requireApikeyExpiration.value,
      max_apikey_expiration_days: maxApikeyExpirationDays.value,
    })
    .eq('id', gid)

  if (error) {
    // TODO: INFORM USER THAT HE IS NOT ORG OWNER
    console.log(`Cannot save changes: ${error}`)

    // Revert the optimistic update
    currentOrganization.value.name = orgCopy.name
    currentOrganization.value.require_apikey_expiration = orgCopy.require_apikey_expiration ?? false
    currentOrganization.value.max_apikey_expiration_days = orgCopy.max_apikey_expiration_days ?? null
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
  return organizationStore.hasPermissionsInRole(organizationStore.currentRole, ['admin', 'super_admin'])
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
    <div class="flex flex-col h-full pb-8 overflow-hidden overflow-y-auto bg-white border shadow-lg md:pb-0 max-h-fit grow md:rounded-lg dark:bg-gray-800 border-slate-300 dark:border-slate-900">
      <FormKit id="update-org" type="form" :actions="false" @submit="saveChanges">
        <div class="p-6 space-y-6">
          <h2 class="mb-5 text-2xl font-bold dark:text-white text-slate-800">
            {{ t('general-information') }}
          </h2>
          <div class="dark:text-gray-100">
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
              <button id="change-org-pic" type="button" class="px-3 py-2 text-xs font-medium text-center text-black border rounded-lg cursor-pointer dark:text-white hover:bg-gray-100 focus:ring-4 focus:ring-blue-300 border-slate-500 dark:hover:bg-gray-600 dark:focus:ring-blue-800 focus:outline-hidden" @click="presentActionSheet">
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
              <p class="dark:text-white text-slate-800">
                {{ t('organization-id') }}
              </p>
              <div class="pt-2 md:pt-0 md:ml-6">
                <button type="button" class="px-3 py-2 text-xs font-medium text-center text-gray-700 border rounded-lg cursor-pointer dark:text-white hover:bg-gray-100 focus:ring-4 focus:ring-blue-300 border-slate-500 dark:hover:bg-gray-600 dark:focus:ring-blue-800 focus:outline-hidden" @click.prevent="copyOrganizationId()">
                  {{ t('copy-organization-id') }}
                </button>
              </div>
            </div>
          </div>

          <!-- API Key Policy Section -->
          <div v-if="hasOrgPerm" class="mt-8 pt-6 border-t border-slate-300 dark:border-slate-600">
            <h3 class="mb-4 text-lg font-semibold dark:text-white text-slate-800">
              {{ t('api-key-policy') }}
            </h3>
            <p class="mb-4 text-sm dark:text-gray-300 text-slate-600">
              {{ t('api-key-policy-description') }}
            </p>
            <div class="space-y-4">
              <label class="flex items-center gap-3 cursor-pointer">
                <input
                  v-model="requireApikeyExpiration"
                  type="checkbox"
                  class="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                >
                <span class="dark:text-white text-slate-800">
                  {{ t('require-apikey-expiration') }}
                </span>
              </label>
              <div v-if="requireApikeyExpiration" class="ml-8">
                <label class="block mb-2 text-sm dark:text-gray-300 text-slate-600">
                  {{ t('max-apikey-expiration-days') }}
                </label>
                <input
                  v-model.number="maxApikeyExpirationDays"
                  type="number"
                  min="1"
                  max="365"
                  :placeholder="t('max-apikey-expiration-days-placeholder')"
                  class="w-full max-w-xs px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                >
                <p class="mt-1 text-xs dark:text-gray-400 text-slate-500">
                  {{ t('max-apikey-expiration-days-help') }}
                </p>
              </div>
            </div>
          </div>

          <footer class="mt-auto">
            <div class="flex flex-col px-2 py-5 border-t md:px-6 border-slate-300">
              <div class="flex self-end">
                <button
                  class="p-2 text-red-600 border border-red-400 rounded-lg cursor-pointer hover:text-white hover:bg-red-600"
                  color="secondary"
                  shape="round"
                  type="button"
                  :class="{
                    invisible: !canDeleteOrg(),
                  }"
                  @click="() => deleteOrganization()"
                >
                  <span v-if="!isLoading" class="truncate rounded-4xl">
                    {{ t('delete-org') }}
                  </span>
                  <Spinner v-else size="w-4 h-4" class="px-4 pt-0 pb-0" color="fill-gray-100 text-gray-200 dark:text-gray-600" />
                </button>
                <button
                  id="save-changes"
                  class="p-2 ml-3 text-white bg-blue-500 rounded-lg cursor-pointer hover:bg-blue-600 d-btn"
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
