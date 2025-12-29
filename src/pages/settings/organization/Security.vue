<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import IconCheck from '~icons/heroicons/check-circle'
import IconWarning from '~icons/heroicons/exclamation-triangle'
import IconShield from '~icons/heroicons/shield-check'
import IconUser from '~icons/heroicons/user'
import { useSupabase } from '~/services/supabase'
import { useDialogV2Store } from '~/stores/dialogv2'
import { useDisplayStore } from '~/stores/display'
import { useOrganizationStore } from '~/stores/organization'

interface MemberWithMfaStatus {
  uid: string
  email: string
  image_url: string
  role: string
  is_tmp: boolean
  has_2fa: boolean
}

const { t } = useI18n()
const displayStore = useDisplayStore()
const organizationStore = useOrganizationStore()
const dialogStore = useDialogV2Store()
const supabase = useSupabase()
const isLoading = ref(true)
const isSaving = ref(false)

displayStore.NavTitle = t('security')

const { currentOrganization } = storeToRefs(organizationStore)
const enforcing2fa = ref(false)
const membersWithMfaStatus = ref<MemberWithMfaStatus[]>([])
const impactedMembers = ref<MemberWithMfaStatus[]>([])

const hasOrgPerm = computed(() => {
  return organizationStore.hasPermissionsInRole(organizationStore.currentRole, ['super_admin'])
})

const compliantMembersCount = computed(() => {
  return membersWithMfaStatus.value.filter(m => m.has_2fa && !m.is_tmp).length
})

const nonCompliantMembersCount = computed(() => {
  return membersWithMfaStatus.value.filter(m => !m.has_2fa && !m.is_tmp).length
})

const totalMembersCount = computed(() => {
  return membersWithMfaStatus.value.filter(m => !m.is_tmp).length
})

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

async function loadData() {
  if (!currentOrganization.value?.gid)
    return

  isLoading.value = true

  try {
    // Load current org's enforcing_2fa setting
    const { data: orgData, error: orgError } = await supabase
      .from('orgs')
      .select('enforcing_2fa')
      .eq('id', currentOrganization.value.gid)
      .single()

    if (orgError) {
      console.error('Error loading org settings:', orgError)
      toast.error(t('error-loading-settings'))
      return
    }

    enforcing2fa.value = orgData?.enforcing_2fa ?? false

    // Load members with their 2FA status
    await loadMembersWithMfaStatus()
  }
  catch (error) {
    console.error('Error loading security settings:', error)
    toast.error(t('error-loading-settings'))
  }
  finally {
    isLoading.value = false
  }
}

async function loadMembersWithMfaStatus() {
  if (!currentOrganization.value?.gid || !hasOrgPerm.value)
    return

  try {
    // Get org members
    const { data: members, error: membersError } = await supabase
      .rpc('get_org_members', {
        guild_id: currentOrganization.value.gid,
      })

    if (membersError) {
      console.error('Error loading members:', membersError)
      return
    }

    // Get 2FA status for all members
    const { data: mfaStatus, error: mfaError } = await supabase
      .rpc('check_org_members_2fa_enabled', {
        org_id: currentOrganization.value.gid,
      })

    if (mfaError) {
      console.error('Error loading MFA status:', mfaError)
      // Still continue with members, just mark 2FA as unknown
    }

    // Create a map of user_id to 2FA status
    const mfaMap = new Map<string, boolean>()
    if (mfaStatus) {
      for (const status of mfaStatus) {
        mfaMap.set(status.user_id, status['2fa_enabled'])
      }
    }

    // Merge members with MFA status
    membersWithMfaStatus.value = (members || []).map(member => ({
      uid: member.uid,
      email: member.email,
      image_url: member.image_url || '',
      role: member.role,
      is_tmp: member.is_tmp,
      has_2fa: mfaMap.get(member.uid) ?? false,
    }))

    // Calculate impacted members (those without 2FA, excluding pending invites)
    impactedMembers.value = membersWithMfaStatus.value.filter(m => !m.has_2fa && !m.is_tmp)
  }
  catch (error) {
    console.error('Error loading members with MFA status:', error)
  }
}

async function toggle2faEnforcement() {
  if (!currentOrganization.value?.gid || !hasOrgPerm.value) {
    toast.error(t('no-permission'))
    return
  }

  const newValue = !enforcing2fa.value

  if (newValue && impactedMembers.value.length > 0) {
    // Show warning dialog with impacted members
    dialogStore.openDialog({
      id: 'enforce-2fa-warning',
      title: t('2fa-enforcement-warning-title'),
      description: t('2fa-enforcement-warning-description'),
      size: 'lg',
      buttons: [
        {
          text: t('button-cancel'),
          role: 'cancel',
        },
        {
          text: t('2fa-enforcement-enable-anyway'),
          role: 'danger',
          handler: async () => {
            await save2faEnforcement(true)
          },
        },
      ],
    })

    await dialogStore.onDialogDismiss()
    return
  }

  // No impacted members, proceed directly
  await save2faEnforcement(newValue)
}

async function save2faEnforcement(value: boolean) {
  if (!currentOrganization.value?.gid)
    return

  isSaving.value = true

  try {
    const { error } = await supabase
      .from('orgs')
      .update({ enforcing_2fa: value })
      .eq('id', currentOrganization.value.gid)

    if (error) {
      console.error('Error updating 2FA enforcement:', error)
      toast.error(t('error-saving-settings'))
      return
    }

    enforcing2fa.value = value
    toast.success(value ? t('2fa-enforcement-enabled') : t('2fa-enforcement-disabled'))
  }
  catch (error) {
    console.error('Error saving 2FA enforcement:', error)
    toast.error(t('error-saving-settings'))
  }
  finally {
    isSaving.value = false
  }
}

async function copyEmailList() {
  const emails = impactedMembers.value.map(m => m.email).join(', ')
  try {
    await navigator.clipboard.writeText(emails)
    toast.success(t('copied-to-clipboard'))
  }
  catch (err) {
    console.error('Failed to copy: ', err)
    dialogStore.openDialog({
      title: t('cannot-copy'),
      description: emails,
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

watch(currentOrganization, loadData)

onMounted(async () => {
  await organizationStore.dedupFetchOrganizations()
  await loadData()
})
</script>

<template>
  <div>
    <div class="flex flex-col h-full pb-8 overflow-hidden overflow-y-auto bg-white border shadow-lg md:pb-0 max-h-fit grow md:rounded-lg dark:bg-gray-800 border-slate-300 dark:border-slate-900">
      <div class="p-6 space-y-6">
        <h2 class="mb-5 text-2xl font-bold dark:text-white text-slate-800">
          {{ t('security-settings') }}
        </h2>
        <div class="dark:text-gray-100">
          {{ t('security-settings-description') }}
        </div>

        <!-- Loading state -->
        <div v-if="isLoading" class="flex items-center justify-center py-12">
          <Spinner size="w-8 h-8" color="fill-blue-500 text-gray-200 dark:text-gray-600" />
        </div>

        <!-- Content -->
        <template v-else>
          <!-- 2FA Enforcement Toggle Section -->
          <section class="p-6 border rounded-lg border-slate-200 dark:border-slate-700">
            <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div class="flex items-start gap-4">
                <div class="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/30">
                  <IconShield class="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 class="text-lg font-semibold dark:text-white text-slate-800">
                    {{ t('2fa-enforcement-title') }}
                  </h3>
                  <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    {{ t('2fa-enforcement-description') }}
                  </p>
                </div>
              </div>
              <div class="flex items-center gap-4">
                <button
                  type="button"
                  :disabled="!hasOrgPerm || isSaving"
                  class="relative inline-flex items-center cursor-pointer"
                  :class="{ 'opacity-50 cursor-not-allowed': !hasOrgPerm || isSaving }"
                  @click="toggle2faEnforcement"
                >
                  <div
                    class="w-11 h-6 rounded-full transition-colors duration-200 ease-in-out"
                    :class="enforcing2fa ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'"
                  >
                    <div
                      class="absolute top-[2px] left-[2px] bg-white border-gray-300 border rounded-full h-5 w-5 transition-transform duration-200 ease-in-out"
                      :class="enforcing2fa ? 'translate-x-full border-white' : ''"
                    />
                  </div>
                </button>
                <span v-if="enforcing2fa" class="px-3 py-1 text-sm font-medium text-green-700 bg-green-100 rounded-full dark:bg-green-900/30 dark:text-green-400">
                  {{ t('enabled') }}
                </span>
                <span v-else class="px-3 py-1 text-sm font-medium text-gray-700 bg-gray-100 rounded-full dark:bg-gray-700 dark:text-gray-300">
                  {{ t('disabled') }}
                </span>
              </div>
            </div>
          </section>

          <!-- Members 2FA Status Overview -->
          <section v-if="hasOrgPerm" class="p-6 border rounded-lg border-slate-200 dark:border-slate-700">
            <h3 class="mb-4 text-lg font-semibold dark:text-white text-slate-800">
              {{ t('2fa-members-status') }}
            </h3>

            <!-- Stats cards -->
            <div class="grid grid-cols-1 gap-4 mb-6 md:grid-cols-3">
              <div class="p-4 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                <div class="flex items-center gap-3">
                  <IconUser class="w-5 h-5 text-slate-500" />
                  <div>
                    <p class="text-2xl font-bold dark:text-white text-slate-800">
                      {{ totalMembersCount }}
                    </p>
                    <p class="text-sm text-slate-600 dark:text-slate-400">
                      {{ t('total-members') }}
                    </p>
                  </div>
                </div>
              </div>
              <div class="p-4 rounded-lg bg-green-50 dark:bg-green-900/20">
                <div class="flex items-center gap-3">
                  <IconCheck class="w-5 h-5 text-green-600 dark:text-green-400" />
                  <div>
                    <p class="text-2xl font-bold text-green-700 dark:text-green-400">
                      {{ compliantMembersCount }}
                    </p>
                    <p class="text-sm text-green-600 dark:text-green-500">
                      {{ t('2fa-enabled') }}
                    </p>
                  </div>
                </div>
              </div>
              <div class="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                <div class="flex items-center gap-3">
                  <IconWarning class="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  <div>
                    <p class="text-2xl font-bold text-amber-700 dark:text-amber-400">
                      {{ nonCompliantMembersCount }}
                    </p>
                    <p class="text-sm text-amber-600 dark:text-amber-500">
                      {{ t('2fa-not-enabled') }}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Impacted Members List (shown if there are non-compliant members) -->
            <div v-if="impactedMembers.length > 0" class="p-4 border rounded-lg border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
              <div class="flex flex-col gap-4 mb-4 md:flex-row md:items-center md:justify-between">
                <div class="flex items-center gap-2">
                  <IconWarning class="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  <h4 class="font-semibold text-amber-800 dark:text-amber-200">
                    {{ t('2fa-impacted-members-title') }}
                  </h4>
                </div>
                <button
                  type="button"
                  class="px-3 py-2 text-xs font-medium text-center border rounded-lg cursor-pointer text-amber-700 dark:text-amber-300 hover:bg-amber-100 focus:ring-4 focus:ring-amber-300 border-amber-400 dark:border-amber-600 dark:hover:bg-amber-800/30 dark:focus:ring-amber-800 focus:outline-hidden"
                  @click="copyEmailList"
                >
                  {{ t('copy-email-list') }}
                </button>
              </div>
              <p class="mb-4 text-sm text-amber-700 dark:text-amber-300">
                {{ t('2fa-impacted-members-description') }}
              </p>
              <ul class="space-y-2">
                <li v-for="member in impactedMembers" :key="member.uid" class="flex items-center gap-3 p-2 rounded-lg bg-white/50 dark:bg-slate-800/50">
                  <img
                    v-if="member.image_url"
                    :src="member.image_url"
                    :alt="`Profile picture for ${member.email}`"
                    class="w-8 h-8 rounded-full shrink-0"
                  >
                  <div v-else class="flex items-center justify-center w-8 h-8 text-sm bg-gray-700 rounded-full shrink-0">
                    <span class="font-medium text-gray-300">
                      {{ acronym(member.email) }}
                    </span>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium truncate text-slate-800 dark:text-white">
                      {{ member.email }}
                    </p>
                    <p class="text-xs text-slate-500 dark:text-slate-400">
                      {{ member.role.replace('_', ' ') }}
                    </p>
                  </div>
                </li>
              </ul>
            </div>

            <!-- All compliant message -->
            <div v-else-if="totalMembersCount > 0" class="p-4 border rounded-lg border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20">
              <div class="flex items-center gap-3">
                <IconCheck class="w-6 h-6 text-green-600 dark:text-green-400" />
                <p class="font-medium text-green-700 dark:text-green-300">
                  {{ t('2fa-all-members-compliant') }}
                </p>
              </div>
            </div>
          </section>

          <!-- Permission notice for non-super-admins -->
          <section v-if="!hasOrgPerm" class="p-4 border rounded-lg border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
            <div class="flex items-center gap-3">
              <IconWarning class="w-5 h-5 text-amber-600 dark:text-amber-400" />
              <p class="text-sm text-amber-700 dark:text-amber-300">
                {{ t('2fa-enforcement-super-admin-only') }}
              </p>
            </div>
          </section>
        </template>
      </div>
    </div>

    <!-- Teleport for 2FA enforcement warning dialog -->
    <Teleport v-if="dialogStore.showDialog && dialogStore.dialogOptions?.id === 'enforce-2fa-warning'" to="#dialog-v2-content" defer>
      <div class="p-4 mt-4 border rounded-lg border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
        <h4 class="mb-3 font-semibold text-amber-800 dark:text-amber-200">
          {{ t('2fa-members-will-be-impacted', { count: impactedMembers.length }) }}
        </h4>
        <p class="mb-4 text-sm text-amber-700 dark:text-amber-300">
          {{ t('2fa-contact-members-before-enabling') }}
        </p>
        <ul class="mb-4 space-y-2">
          <li v-for="member in impactedMembers" :key="member.uid" class="flex items-center gap-2 text-amber-700 dark:text-amber-300">
            <span class="w-2 h-2 rounded-full bg-amber-500" />
            <span class="font-medium">{{ member.email }}</span>
            <span class="text-xs text-amber-600 dark:text-amber-400">({{ member.role.replace('_', ' ') }})</span>
          </li>
        </ul>
        <button
          type="button"
          class="px-3 py-2 text-xs font-medium text-center border rounded-lg cursor-pointer text-amber-700 dark:text-amber-300 hover:bg-amber-100 focus:ring-4 focus:ring-amber-300 border-amber-400 dark:border-amber-600 dark:hover:bg-amber-800/30 dark:focus:ring-amber-800 focus:outline-hidden"
          @click="copyEmailList"
        >
          {{ t('copy-email-list') }}
        </button>
      </div>
    </Teleport>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
</route>
