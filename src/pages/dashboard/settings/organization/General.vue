<script setup lang="ts">
import { FormKit } from '@formkit/vue'
import { FunctionsHttpError } from '@supabase/supabase-js'
import iconEmail from '~icons/oui/email?raw'
import iconName from '~icons/ph/user?raw'
import { useI18n } from 'petite-vue-i18n'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import { pickPhoto, takePhoto } from '~/services/photos'
import { useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'
import { useOrganizationStore } from '~/stores/organization'

const { t } = useI18n()

const organizationStore = useOrganizationStore()
const displayStore = useDisplayStore()
const supabase = useSupabase()
const isLoading = ref(true)

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

  displayStore.dialogOption = {
    header: t('change-your-picture'),
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('button-camera'),
        id: 'camera-button',
        handler: async () => {
          takePhoto(isLoading, 'org', '')
        },
      },
      {
        id: 'browse-button',
        text: t('button-browse'),
        handler: () => {
          pickPhoto(isLoading, 'org', '')
        },
      },
    ],
  }
  displayStore.showDialog = true
  return displayStore.onDialogDismiss()
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

  const orgCopy = Object.assign({}, currentOrganization.value)

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
    // The management emial has changed, call the edge function
    console.log('Edge fn')

    const { error } = await supabase.functions.invoke('private/set_org_email', {
      body: {
        emial: form.email,
        org_id: orgCopy.gid,
      },
    })

    if (error) {
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

      // Revert the optimistic update
      currentOrganization.value.management_email = orgCopy.management_email
      hasErrored = true
    }

    console.log(error)
  }

  isLoading.value = false
  if (!hasErrored)
    toast.success(t('org-changes-saved'))
}

const hasOrgPerm = computed(() => {
  return organizationStore.hasPermisisonsInRole(organizationStore.currentRole, ['admin', 'super_admin'])
})

const acronym = computed(() => {
  const res = 'N/A'
  // use currentOrganization.value?.name first letter of 2 first words or first 2 letter of first word or N/A
  // if (currentOrganization.value?.name) {
  //   const words = currentOrganization.value.name.split(' ')
  //   if (words.length > 1)
  //     res = words[0][0] + words[1][0]
  //   else
  //     res = words[0].slice(0, 2)
  // }
  return res.toUpperCase()
})

function canDeleteOrg() {
  return currentOrganization.value?.role === 'super_admin'
    && organizationStore.organizations.length > 1
}

async function deleteOrganization() {
  displayStore.dialogOption = {
    header: t('delete-org'),
    message: `${t('please-confirm-org-del')}`.replace('%1', currentOrganization.value?.name ?? ''),
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
          const typed = displayStore.dialogInputText
          if (typed !== (currentOrganization.value?.name ?? '')) {
            toast.error(t('wrong-name-org-del').replace('%1', currentOrganization.value?.name ?? ''))
            return
          }

          const { error } = await supabase.from('orgs')
            .delete()
            .eq('id', currentOrganization.value?.gid ?? 0)

          if (error) {
            toast.error(t('cannot-del-org'))
            console.error('org del err', error)
            return
          }

          toast.success(t('org-deleted'))
          await organizationStore.fetchOrganizations()
        },
      },
    ],
  }

  displayStore.showDialog = true
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
                  id="org-avatar" class="object-cover w-20 h-20 mask mask-squircle" :src="currentOrganization.logo"
                  width="80" height="80" alt="User upload"
                >
                <div v-else class="p-6 text-xl bg-gray-700 mask mask-squircle">
                  <span class="font-medium text-gray-300">
                    {{ acronym }}
                  </span>
                </div>
              </div>
              <button id="change-org-pic" type="button" class="px-3 py-2 text-xs font-medium text-center text-black border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-white border-slate-500 focus:ring-4 focus:outline-none focus:ring-blue-300 dark:focus:ring-blue-800" @click="presentActionSheet">
                {{ t('change') }}
              </button>
            </div>
          </section>
          <div class="mt-3 mb-6">
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
          <div class="mt-3 mb-6">
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
        </div>
        <footer style="margin-top: auto">
          <div class="flex flex-col px-6 py-5 border-t border-slate-300">
            <div class="flex self-end">
              <button
                class="p-2 mb-2 mr-4 text-white border border-red-400 rounded-lg btn hover:bg-red-600"
                color="secondary"
                shape="round"
                type="button"
                :class="{
                  invisible: !canDeleteOrg(),
                }"
                @click="() => deleteOrganization()"
              >
                <span v-if="!isLoading" class="rounded-4xl">
                  {{ t('delete-org') }}
                </span>
                <Spinner v-else size="w-4 h-4" class="px-4 pt-0 pb-0" color="fill-gray-100 text-gray-200 dark:text-gray-600" />
              </button>
              <button
                id="save-changes"
                class="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 mr-2 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none dark:focus:ring-blue-800"
                type="submit"
                color="secondary"
                shape="round"
              >
                <span v-if="!isLoading" class="rounded-4xl">
                  {{ t('save-changes') }}
                </span>
                <Spinner v-else size="w-4 h-4" class="px-4 pt-0 pb-0" color="fill-gray-100 text-gray-200 dark:text-gray-600" />
              </button>
            </div>
          </div>
        </footer>
      </FormKit>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
</route>
