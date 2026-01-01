<script setup lang="ts">
import type { TableColumn } from '~/components/comp_def'
import type { Database } from '~/types/supabase.types'
import { FormKit } from '@formkit/vue'
import { VueDatePicker } from '@vuepic/vue-datepicker'
import { useDark } from '@vueuse/core'
import dayjs from 'dayjs'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import IconArrowPath from '~icons/heroicons/arrow-path'
import IconCalendar from '~icons/heroicons/calendar'
import IconClipboard from '~icons/heroicons/clipboard-document'
import IconPencil from '~icons/heroicons/pencil'
import IconTrash from '~icons/heroicons/trash'
import '@vuepic/vue-datepicker/dist/main.css'
import Table from '~/components/Table.vue'
import { formatLocalDate } from '~/services/date'
import { useSupabase } from '~/services/supabase'
import { useDialogV2Store } from '~/stores/dialogv2'
import { useDisplayStore } from '~/stores/display'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'

const { t } = useI18n()
const isDark = useDark()
const dialogStore = useDialogV2Store()
const displayStore = useDisplayStore()
const main = useMainStore()
const currentPage = ref(1)
const isLoading = ref(false)
const supabase = useSupabase()
const keys = ref<Database['public']['Tables']['apikeys']['Row'][]>([])
const organizationStore = useOrganizationStore()
const columns: Ref<TableColumn[]> = ref<TableColumn[]>([])

// State for change name dialog
const newApiKeyName = ref('')

// State for tracking app limitation checkbox
const limitToAppCheckbox = ref(false)

// State for tracking organization limitation checkbox
const limitToOrgCheckbox = ref(false)

// State for API key type selection
const selectedKeyType = ref('')

// State for expiration date
const setExpirationCheckbox = ref(false)
const expirationDate = ref<Date | null>(null)

// Computed properties for expiration date limits
const minExpirationDate = computed(() => {
  return dayjs().add(1, 'day').toDate()
})

// Check if a key is expired
function isKeyExpired(expiresAt: string | null): boolean {
  if (!expiresAt)
    return false

  return new Date(expiresAt) < new Date()
}

// State for hashed key creation
const createAsHashed = ref(false)

// Available apps for selection (populated when showing app dialog)
const availableApps = ref<Database['public']['Tables']['apps']['Row'][]>([])

// Cache for organization and app names
const orgCache = ref(new Map<string, string>())
const appCache = ref(new Map<string, string>())

// Function to truncate strings (show first 5 and last 5 characters)
function hideString(str: string | null) {
  if (!str)
    return ''
  const first = str.slice(0, 5)
  const last = str.slice(-5)
  return `${first}...${last}`
}

// Check if a key is a hashed (secure) key
function isHashedKey(key: Database['public']['Tables']['apikeys']['Row']) {
  return key.key === null && key.key_hash !== null
}

// Computed property to get unique organization IDs from all API keys
const uniqueOrgIds = computed(() => {
  if (!keys.value)
    return new Set<string>()

  const orgIds = new Set<string>()
  keys.value.forEach((key) => {
    if (key.limited_to_orgs && key.limited_to_orgs.length > 0) {
      key.limited_to_orgs.forEach(orgId => orgIds.add(orgId))
    }
  })

  return orgIds
})

// Computed property to get unique app IDs from all API keys
const uniqueAppIds = computed(() => {
  if (!keys.value)
    return new Set<string>()

  const appIds = new Set<string>()
  keys.value.forEach((key) => {
    if (key.limited_to_apps && key.limited_to_apps.length > 0) {
      key.limited_to_apps.forEach(appId => appIds.add(appId))
    }
  })

  return appIds
})

// Helper computed property to get organization name by ID
const getOrgName = computed(() => {
  return (orgId: string) => orgCache.value.get(orgId) || 'Unknown'
})

// Helper computed property to get app name by ID
const getAppName = computed(() => {
  return (appId: string) => appCache.value.get(appId) || 'Unknown'
})

// Function to fetch organization and app names in parallel
async function fetchOrgAndAppNames() {
  if (!keys.value)
    return

  // Collect unique organization and app IDs that aren't already cached
  const uncachedOrgIds = Array.from(uniqueOrgIds.value).filter(id => !orgCache.value.has(id))
  const uncachedAppIds = Array.from(uniqueAppIds.value).filter(id => !appCache.value.has(id))

  // Fetch organization names in parallel
  if (uncachedOrgIds.length > 0) {
    const orgPromises = uncachedOrgIds.map(async (orgId) => {
      try {
        const { data, error } = await supabase
          .from('orgs')
          .select('id, name')
          .eq('id', orgId)
          .single()

        if (error)
          throw error
        if (data)
          orgCache.value.set(orgId, data.name)
        return { id: orgId, name: data?.name }
      }
      catch (err) {
        console.error(`Error fetching org name for ${orgId}:`, err)
        return { id: orgId, name: 'Unknown' }
      }
    })

    await Promise.all(orgPromises)
  }

  // Fetch app names in parallel
  if (uncachedAppIds.length > 0) {
    const appPromises = uncachedAppIds.map(async (appId) => {
      try {
        const { data, error } = await supabase
          .from('apps')
          .select('app_id, name')
          .eq('app_id', appId)
          .single()

        if (error)
          throw error
        if (data && data.name)
          appCache.value.set(appId, data.name)
        return { id: appId, name: data?.name }
      }
      catch (err) {
        console.error(`Error fetching app name for ${appId}:`, err)
        return { id: appId, name: 'Unknown' }
      }
    })

    await Promise.all(appPromises)
  }
}

const searchQuery = ref('')

const filteredAndSortedKeys = computed(() => {
  let result = keys.value ?? []

  // Filter first
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(key =>
      key.name?.toLowerCase().includes(query)
      || key.key?.toLowerCase().includes(query),
    )
  }

  // Then sort based on column state
  if (columns.value.length) {
    columns.value.forEach((col) => {
      if (col.sortable && typeof col.sortable === 'string') {
        result = [...result].sort((a, b) => {
          let aValue: any = ''
          let bValue: any = ''

          switch (col.key) {
            case 'name':
              aValue = a.name?.toLowerCase() || ''
              bValue = b.name?.toLowerCase() || ''
              break
            case 'mode':
              aValue = a.mode.toLowerCase()
              bValue = b.mode.toLowerCase()
              break
            case 'created_at':
              aValue = new Date(a.created_at || 0)
              bValue = new Date(b.created_at || 0)
              break
            default:
              return 0
          }

          if (aValue < bValue)
            return col.sortable === 'asc' ? -1 : 1
          if (aValue > bValue)
            return col.sortable === 'asc' ? 1 : -1
          return 0
        })
      }
    })
  }

  return result
})

// Computed property to filter apps based on selected organizations
const filteredAppsForSelectedOrgs = computed(() => {
  if (!availableApps.value || displayStore.selectedOrganizations.length === 0) {
    return []
  }
  return (availableApps.value as any).filter((app: Database['public']['Tables']['apps']['Row']) =>
    displayStore.selectedOrganizations.includes(app.owner_org),
  )
})

columns.value = [
  {
    key: 'mode',
    label: t('type'),
    sortable: true,
    displayFunction: (row: Database['public']['Tables']['apikeys']['Row']) => {
      return row.mode.toUpperCase()
    },
  },
  {
    key: 'key',
    label: t('api-key'),
    head: true,
    displayFunction: (row: Database['public']['Tables']['apikeys']['Row']) => {
      if (isHashedKey(row)) {
        return t('secure-key-hidden')
      }
      return hideString(row.key)
    },
  },
  {
    key: 'name',
    label: t('name'),
    head: true,
    mobile: true,
    sortable: true,
  },
  {
    key: 'created_at',
    label: t('created'),
    sortable: true,
    displayFunction: (row: Database['public']['Tables']['apikeys']['Row']) => {
      return formatLocalDate(row.created_at)
    },
  },
  {
    key: 'expires_at',
    label: t('expires'),
    sortable: true,
    displayFunction: (row: Database['public']['Tables']['apikeys']['Row']) => {
      if (!row.expires_at)
        return t('never')

      const expired = isKeyExpired(row.expires_at)
      const dateStr = formatLocalDate(row.expires_at)
      return expired ? `${dateStr} (${t('expired')})` : dateStr
    },
  },
  {
    key: 'limited_to_orgs',
    label: t('organizations'),
    displayFunction: (row: Database['public']['Tables']['apikeys']['Row']) => {
      if (!row.limited_to_orgs || row.limited_to_orgs.length === 0)
        return ''
      return row.limited_to_orgs.map(orgId => getOrgName.value(orgId)).join(', ')
    },
  },
  {
    key: 'limited_to_apps',
    label: t('apps'),
    displayFunction: (row: Database['public']['Tables']['apikeys']['Row']) => {
      if (!row.limited_to_apps || row.limited_to_apps.length === 0)
        return ''
      return row.limited_to_apps.map(appId => getAppName.value(appId)).join(', ')
    },
  },
  {
    key: 'actions',
    label: t('actions'),
    mobile: true,
    actions: [
      {
        icon: IconClipboard,
        onClick: (key: Database['public']['Tables']['apikeys']['Row']) => copyKey(key),
      },
      {
        icon: IconPencil,
        onClick: (key: Database['public']['Tables']['apikeys']['Row']) => changeName(key),
      },
      {
        icon: IconArrowPath,
        onClick: (key: Database['public']['Tables']['apikeys']['Row']) => regenrateKey(key),
      },
      {
        icon: IconTrash,
        onClick: (key: Database['public']['Tables']['apikeys']['Row']) => deleteKey(key),
      },
    ],
  },
]

async function refreshData() {
  // console.log('refreshData')
  try {
    currentPage.value = 1
    keys.value.length = 0
    await getKeys()
  }
  catch (error) {
    console.error(error)
  }
}
async function getKeys(retry = true): Promise<void> {
  isLoading.value = true
  const { data } = await supabase
    .from('apikeys')
    .select()
    .eq('user_id', main.user?.id ?? '')
  if (data && data.length) {
    keys.value = data
    // Fetch organization and app names after getting API keys
    await fetchOrgAndAppNames()
  }
  else if (retry && main.user?.id) {
    return getKeys(false)
  }

  isLoading.value = false
}

async function loadAllApps() {
  try {
    const orgIds = organizationStore.organizations.map(org => org.gid)
    if (orgIds.length === 0) {
      availableApps.value = []
      return
    }
    const { data: apps, error } = await supabase
      .from('apps')
      .select('*')
      .in('owner_org', orgIds)
    if (error) {
      console.error('Cannot load apps:', error)
      return
    }
    availableApps.value = apps || []
  }
  catch (err) {
    console.error('Error loading apps:', err)
  }
}

async function createApiKey(keyType: 'read' | 'write' | 'all' | 'upload') {
  // Get selections from the dialog
  const limitToOrg = limitToOrgCheckbox.value
  const limitToApp = limitToAppCheckbox.value
  const isHashed = createAsHashed.value

  let finalSelectedOrganizations: string[] = []
  if (limitToOrg) {
    finalSelectedOrganizations = [...displayStore.selectedOrganizations]
    if (finalSelectedOrganizations.length === 0) {
      toast.error(t('alert-no-org-selected'))
      return false
    }
  }

  let finalSelectedApps: Database['public']['Tables']['apps']['Row'][] = []
  if (limitToApp) {
    finalSelectedApps = Array.from(displayStore.selectedApps) as any
    if (finalSelectedApps.length === 0) {
      toast.error(t('alert-no-app-selected'))
      return false
    }
  }

  // Get expiration date if set
  let expiresAt: string | null = null
  if (setExpirationCheckbox.value && expirationDate.value) {
    expiresAt = dayjs(expirationDate.value).toISOString()
  }

  try {
    const newApiKey = crypto.randomUUID()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      console.log('Not logged in, cannot create API key')
      toast.error('Not logged in')
      return false
    }

    let createdKey: Database['public']['Tables']['apikeys']['Row']
    let plainKeyForDisplay: string | null = null

    if (isHashed) {
      // For hashed keys, we use the backend API which will hash the key
      // and return the plain key only once for display
      const { data, error } = await supabase.functions.invoke('public/apikey', {
        method: 'POST',
        body: {
          mode: keyType,
          name: newApiKeyName.value.trim(),
          limited_to_orgs: finalSelectedOrganizations.length > 0 ? finalSelectedOrganizations : [],
          limited_to_apps: finalSelectedApps.length > 0 ? finalSelectedApps.map(app => app.app_id) : [],
          expires_at: expiresAt,
          hashed: true,
        },
      })

      if (error) {
        console.error('Error creating hashed API key:', error)
        toast.error('Failed to create API key')
        return false
      }

      createdKey = data
      plainKeyForDisplay = data.key // This is the one-time visible key
    }
    else {
      // For plain-text keys, use direct database insert
      const { data, error } = await supabase
        .from('apikeys')
        .upsert({
          user_id: user.id,
          key: newApiKey,
          mode: keyType,
          name: newApiKeyName.value.trim(),
          limited_to_orgs: finalSelectedOrganizations.length > 0 ? finalSelectedOrganizations : [],
          limited_to_apps: finalSelectedApps.length > 0 ? finalSelectedApps.map(app => app.app_id) : [],
          expires_at: expiresAt,
        })
        .select()

      if (error) {
        console.error('Error creating API key:', error)
        toast.error('Failed to create API key')
        return false
      }

      createdKey = data[0]
    }

    // For hashed keys, clear the key field before adding to the list
    // (the plainkey was only returned for one-time display)
    if (isHashed) {
      createdKey.key = null as any
    }
    keys.value?.push(createdKey)
    // Fetch org and app names for the new key
    await fetchOrgAndAppNames()

    // For hashed keys, show the key one time in a modal
    if (isHashed && plainKeyForDisplay) {
      await showOneTimeKeyModal(plainKeyForDisplay)
    }

    toast.success(t('add-api-key'))
    return true
  }
  catch (error) {
    console.error('Error creating API key:', error)
    toast.error('Failed to create API key')
    return false
  }
}

async function showOneTimeKeyModal(plainKey: string) {
  dialogStore.openDialog({
    title: t('secure-key-created'),
    description: t('secure-key-warning'),
    size: 'lg',
    buttons: [
      {
        text: t('copy-and-close'),
        role: 'primary',
        handler: async () => {
          try {
            await navigator.clipboard.writeText(plainKey)
            toast.success(t('key-copied'))
          }
          catch (err) {
            console.error('Failed to copy:', err)
          }
        },
      },
    ],
  })
  return dialogStore.onDialogDismiss()
}

async function addNewApiKey() {
  // Clear global state
  displayStore.selectedOrganizations = []
  displayStore.selectedApps = []
  limitToOrgCheckbox.value = false
  limitToAppCheckbox.value = false
  createAsHashed.value = false
  newApiKeyName.value = ''
  setExpirationCheckbox.value = false
  expirationDate.value = null

  // Load all apps for selection
  await loadAllApps()

  // Show API key type selection modal with options
  await showAddNewKeyModal()
}

async function regenrateKey(apikey: Database['public']['Tables']['apikeys']['Row']) {
  if (await showRegenerateKeyModal())
    return

  const newApiKey = crypto.randomUUID()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    console.log('Not logged in, cannot regenerate API key')
    return
  }

  const wasHashed = isHashedKey(apikey)

  if (wasHashed) {
    // For hashed keys, we need to hash the new key too
    // We'll update both key_hash with the new hash and keep key as null
    // Use the backend API which handles hashing
    const { data, error } = await supabase.functions.invoke('public/apikey', {
      method: 'POST',
      body: {
        mode: apikey.mode,
        name: apikey.name,
        limited_to_orgs: apikey.limited_to_orgs ?? [],
        limited_to_apps: apikey.limited_to_apps ?? [],
        hashed: true,
      },
    })

    if (error) {
      console.error('Error regenerating hashed API key:', error)
      toast.error('Failed to regenerate API key')
      return
    }

    // Extract the plaintext key for one-time display before clearing it
    const plainKeyForDisplay = data.key as string | undefined

    // Clear the key field before caching to maintain the "hashed" state
    // This ensures isHashedKey() returns true and the key cannot be copied
    data.key = null as any

    // Delete the old key
    await supabase.from('apikeys').delete().eq('id', apikey.id)

    // Update the local key reference with the new hashed row (key = null)
    const idx = keys.value.findIndex(k => k.id === apikey.id)
    if (idx !== -1) {
      keys.value[idx] = data
    }

    // Show the new key one time
    if (plainKeyForDisplay) {
      await showOneTimeKeyModal(plainKeyForDisplay)
    }
    toast.success(t('generated-new-apikey'))
  }
  else {
    // For plain-text keys, update directly
    const { error } = await supabase
      .from('apikeys')
      .update({ key: newApiKey })
      .eq('user_id', user.id)
      .eq('id', apikey.id)

    if (error || typeof newApiKey !== 'string')
      throw error

    apikey.key = newApiKey
    toast.success(t('generated-new-apikey'))
  }
}

async function deleteKey(key: Database['public']['Tables']['apikeys']['Row']) {
  if (await showDeleteKeyModal())
    return

  const { error } = await supabase
    .from('apikeys')
    .delete()
    .eq('id', key.id)

  if (error)
    throw error

  toast.success(t('removed-apikey'))
  keys.value = keys.value?.filter(filterKey => filterKey.id !== key.id)
}

async function changeName(key: Database['public']['Tables']['apikeys']['Row']) {
  const currentName = key.name || ''
  newApiKeyName.value = currentName

  dialogStore.openDialog({
    title: t('change-api-key-name'),
    description: t('type-new-name'),
    size: 'lg',
    buttons: [
      {
        text: t('cancel'),
        role: 'cancel',
      },
      {
        text: t('button-confirm'),
        role: 'primary',
        handler: async () => {
          const newName = newApiKeyName.value.trim()
          if (currentName === newName) {
            toast.error(t('new-name-not-changed'))
            return false
          }

          if (newName.length > 32) {
            toast.error(t('new-name-to-long'))
            return false
          }

          if (newName.length < 4) {
            toast.error(t('new-name-to-short'))
            return false
          }

          const { error } = await supabase.from('apikeys')
            .update({ name: newName })
            .eq('id', key.id)

          if (error) {
            toast.error(t('cannot-change-name'))
            console.error(error)
            return false
          }

          toast.success(t('changed-name'))
          keys.value = keys.value?.map((k) => {
            if (key.id === k.id)
              k.name = newName
            return k
          })
        },
      },
    ],
  })
  return dialogStore.onDialogDismiss()
}

// This returns true if user has canceled the action
async function showRegenerateKeyModal() {
  dialogStore.openDialog({
    title: t('alert-confirm-regenerate'),
    description: `${t('alert-not-reverse-message')}. ${t('alert-regenerate-key')}?`,
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('button-regenerate'),
        role: 'primary',
      },
    ],
  })
  return dialogStore.onDialogDismiss()
}

async function showDeleteKeyModal() {
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
      },
    ],
  })
  return dialogStore.onDialogDismiss()
}

async function showAddNewKeyModal() {
  // Reset selection state
  selectedKeyType.value = ''

  dialogStore.openDialog({
    title: t('alert-add-new-key'),
    description: t('alert-generate-new-key'),
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('create'),
        role: 'primary',
        handler: () => {
          if (!selectedKeyType.value) {
            toast.error(t('please-select-key-type'))
            return false
          }
          return createApiKey(selectedKeyType.value as 'read' | 'write' | 'all' | 'upload')
        },
      },
    ],
  })
  return dialogStore.onDialogDismiss()
}

function handleOrgSelection(orgId: string, checked: boolean) {
  if (checked) {
    if (!displayStore.selectedOrganizations.includes(orgId)) {
      displayStore.selectedOrganizations.push(orgId)
    }
  }
  else {
    displayStore.selectedOrganizations = displayStore.selectedOrganizations.filter(id => id !== orgId)
  }
}

function handleAppSelection(app: Database['public']['Tables']['apps']['Row'], checked: boolean) {
  if (checked) {
    if (!(displayStore.selectedApps as any).find((a: Database['public']['Tables']['apps']['Row']) => a.app_id === app.app_id)) {
      displayStore.selectedApps.push(app as any)
    }
  }
  else {
    displayStore.selectedApps = (displayStore.selectedApps as any).filter((a: Database['public']['Tables']['apps']['Row']) => a.app_id !== app.app_id)
  }
}

async function copyKey(apikey: Database['public']['Tables']['apikeys']['Row']) {
  // Cannot copy hashed keys - they are never stored in plain text
  if (isHashedKey(apikey)) {
    toast.error(t('cannot-copy-secure-key'))
    return
  }

  try {
    await navigator.clipboard.writeText(apikey.key!)
    toast.success(t('key-copied'))
  }
  catch (err) {
    console.error('Failed to copy: ', err)
    // Display a modal with the copied key
    dialogStore.openDialog({
      title: t('cannot-copy-key'),
      description: apikey.key!,
      buttons: [
        {
          text: t('ok'),
          role: 'primary',
        },
      ],
    })
    await dialogStore.onDialogDismiss()
  }
}
// Watch for organization checkbox changes to reset app limitation
watch(() => limitToOrgCheckbox.value, (newVal) => {
  if (!newVal) {
    // If org limitation is unchecked, reset app limitation
    limitToAppCheckbox.value = false
    displayStore.selectedApps = []
  }
})

displayStore.NavTitle = t('api-keys')
displayStore.defaultBack = '/app'
getKeys()
</script>

<template>
  <div>
    <div class="overflow-hidden pb-4 h-full">
      <div class="overflow-y-auto px-0 pt-0 mx-auto mb-8 w-full h-full sm:px-6 md:pt-8 lg:px-8 max-w-9xl max-h-fit">
        <div class="flex flex-col">
          <div class="flex overflow-hidden overflow-y-auto flex-col bg-white md:mt-5 md:rounded-lg md:border md:shadow-lg border-slate-300 dark:border-slate-900 dark:bg-slate-800">
            <Table
              v-model:current-page="currentPage"
              show-add
              :auto-reload="false"
              :columns="columns"
              :element-list="filteredAndSortedKeys"
              :is-loading="isLoading"
              :total="filteredAndSortedKeys.length"
              :search-placeholder="t('search-api-keys')"
              :search="searchQuery"
              @add="addNewApiKey"
              @update:search="searchQuery = $event"
              @reload="getKeys()"
              @reset="refreshData()"
            />
          </div>
          <p class="mt-6 ml-4">
            {{ t('api-keys-are-used-for-cli-and-public-api') }}
          </p>
          <div class="mb-2 ml-4">
            <a
              class="inline-flex items-center text-blue-500 underline rounded-sm focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:outline-none"
              href="https://capgo.app/docs/tooling/cli/"
              target="_blank"
              rel="noopener noreferrer"
              :aria-label="`${t('cli-doc')} (opens in new tab)`"
            >
              {{ t('cli-doc') }}
              <svg class="ml-1 w-3 h-3" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path fill-rule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clip-rule="evenodd" />
                <path fill-rule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clip-rule="evenodd" />
              </svg>
            </a>
            <a
              class="inline-flex items-center ml-1 text-blue-500 underline rounded-sm focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:outline-none"
              href="https://capgo.app/docs/tooling/api/"
              target="_blank"
              rel="noopener noreferrer"
              :aria-label="`${t('api-doc')} (opens in new tab)`"
            >
              {{ t('api-doc') }}
              <svg class="ml-1 w-3 h-3" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path fill-rule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clip-rule="evenodd" />
                <path fill-rule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clip-rule="evenodd" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </div>

    <!-- Teleport Content for Add New Key Modal -->
    <Teleport v-if="dialogStore.showDialog && dialogStore.dialogOptions?.title === t('alert-add-new-key')" defer to="#dialog-v2-content">
      <div class="space-y-6">
        <!-- API Key Name -->
        <div>
          <FormKit
            v-model="newApiKeyName"
            type="text"
            :label="t('name')"
            :placeholder="t('type-new-name')"
            validation="required|length:1,32"
            :validation-messages="{
              length: t('name-length-error'),
            }"
          />
        </div>

        <!-- API Key Type Selection -->
        <div>
          <div class="p-4 rounded-lg border dark:border-gray-600">
            <div class="space-y-3">
              <div class="form-control">
                <label class="gap-3 justify-start p-3 rounded-lg cursor-pointer hover:bg-gray-50 label dark:hover:bg-gray-800">
                  <input
                    v-model="selectedKeyType"
                    type="radio"
                    name="key-type"
                    value="read"
                    class="mr-2 radio radio-primary"
                  >
                  <span class="text-base label-text">{{ t('key-read') }}</span>
                </label>
              </div>
              <div class="form-control">
                <label class="gap-3 justify-start p-3 rounded-lg cursor-pointer hover:bg-gray-50 label dark:hover:bg-gray-800">
                  <input
                    v-model="selectedKeyType"
                    type="radio"
                    name="key-type"
                    value="upload"
                    class="mr-2 radio radio-primary"
                  >
                  <span class="text-base label-text">{{ t('key-upload') }}</span>
                </label>
              </div>
              <div class="form-control">
                <label class="gap-3 justify-start p-3 rounded-lg cursor-pointer hover:bg-gray-50 label dark:hover:bg-gray-800">
                  <input
                    v-model="selectedKeyType"
                    type="radio"
                    name="key-type"
                    value="write"
                    class="mr-2 radio radio-primary"
                  >
                  <span class="text-base label-text">{{ t('write-key') }}</span>
                </label>
              </div>
              <div class="form-control">
                <label class="gap-3 justify-start p-3 rounded-lg cursor-pointer hover:bg-gray-50 label dark:hover:bg-gray-800">
                  <input
                    v-model="selectedKeyType"
                    type="radio"
                    name="key-type"
                    value="all"
                    class="mr-2 radio radio-primary"
                  >
                  <span class="text-base label-text">{{ t('key-all') }}</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- Create as Secure (Hashed) Key -->
        <div class="p-4 rounded-lg border bg-blue-50 dark:bg-blue-900/20 dark:border-blue-700 border-blue-200">
          <div class="flex gap-3 items-start">
            <input
              id="create-as-hashed"
              v-model="createAsHashed"
              type="checkbox"
              class="mt-1 border-blue-500 dark:border-blue-400 checkbox checkbox-primary"
            >
            <div>
              <label for="create-as-hashed" class="font-medium text-blue-800 cursor-pointer dark:text-blue-200">
                {{ t('create-secure-key') }}
              </label>
              <p class="mt-1 text-sm text-blue-600 dark:text-blue-300">
                {{ t('create-secure-key-description') }}
              </p>
            </div>
          </div>
        </div>

        <!-- Limit to Organizations -->
        <div class="flex gap-2 items-center">
          <input
            id="limit-to-org"
            v-model="limitToOrgCheckbox"
            type="checkbox"
            class="border-gray-500 dark:border-gray-700 checkbox"
          >
          <label for="limit-to-org" class="text-sm">
            {{ t('limit-to-org') }}
          </label>
        </div>
        <div v-if="limitToOrgCheckbox" class="pl-6">
          <div class="overflow-y-auto p-2 space-y-2 max-h-32 rounded-lg border">
            <div v-for="org in organizationStore.organizations" :key="org.gid" class="flex gap-2 items-center">
              <input
                :id="`org-${org.gid}`"
                :value="org.gid"
                type="checkbox"
                class="border-gray-500 dark:border-gray-700 checkbox"
                @change="handleOrgSelection(org.gid, ($event.target as HTMLInputElement).checked)"
              >
              <label :for="`org-${org.gid}`" class="text-sm">
                {{ org.name }}
              </label>
            </div>
          </div>
        </div>

        <!-- Limit to Apps (only show if orgs are selected) -->
        <div v-if="limitToOrgCheckbox && displayStore.selectedOrganizations.length > 0" class="flex gap-2 items-center">
          <input
            id="limit-to-app"
            v-model="limitToAppCheckbox"
            type="checkbox"
            class="border-gray-500 dark:border-gray-700 checkbox"
          >
          <label for="limit-to-app" class="text-sm">
            {{ t('limit-to-app') }}
          </label>
        </div>
        <div v-if="limitToAppCheckbox && displayStore.selectedOrganizations.length > 0" class="pl-6">
          <div class="overflow-y-auto p-2 space-y-2 max-h-32 rounded-lg border">
            <div v-for="app in filteredAppsForSelectedOrgs" :key="app.app_id" class="flex gap-2 items-center">
              <input
                :id="`app-${app.app_id}`"
                :value="app"
                type="checkbox"
                class="border-gray-500 dark:border-gray-700 checkbox"
                @change="handleAppSelection(app, ($event.target as HTMLInputElement).checked)"
              >
              <label :for="`app-${app.app_id}`" class="text-sm">
                {{ app.name }}
              </label>
            </div>
          </div>
        </div>

        <!-- Set Expiration Date -->
        <div class="flex gap-2 items-center">
          <input
            id="set-expiration"
            v-model="setExpirationCheckbox"
            type="checkbox"
            class="border-gray-500 dark:border-gray-700 checkbox"
          >
          <label for="set-expiration" class="text-sm">
            {{ t('set-expiration-date') }}
          </label>
        </div>
        <div v-if="setExpirationCheckbox" class="pl-6">
          <label class="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
            {{ t('expiration-date') }}
          </label>
          <VueDatePicker
            v-model="expirationDate"
            :min-date="minExpirationDate"
            :enable-time-picker="false"
            :time-picker-inline="false"
            :dark="isDark"
            teleport="body"
            :auto-apply="true"
            hide-input-icon
            :action-row="{ showCancel: false, showSelect: false, showNow: false, showPreview: false }"
            :placeholder="t('select-expiration-date')"
            :ui="{ menu: 'apikey-datepicker-menu' }"
          >
            <template #trigger>
              <button
                type="button"
                class="flex gap-2 items-center py-2 px-3 w-full text-sm text-left bg-white rounded-md border transition-colors border-gray-300 dark:text-white dark:bg-gray-800 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 focus:ring-2 focus:ring-primary-500 focus:outline-none"
              >
                <IconCalendar class="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <span :class="expirationDate ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'">
                  {{ expirationDate ? dayjs(expirationDate).format('YYYY-MM-DD') : t('select-expiration-date') }}
                </span>
              </button>
            </template>
          </VueDatePicker>
        </div>
      </div>
    </Teleport>

    <!-- Teleport Content for Change Name Modal -->
    <Teleport v-if="dialogStore.showDialog && dialogStore.dialogOptions?.title === t('change-api-key-name')" defer to="#dialog-v2-content">
      <div class="space-y-4">
        <FormKit
          v-model="newApiKeyName"
          type="text"
          :label="t('name')"
          :placeholder="t('type-new-name')"
          validation="required|length:1,32"
          :validation-messages="{
            required: t('name-required'),
            length: t('name-length-error'),
          }"
        />
      </div>
    </Teleport>

    <!-- Teleport Content for Organization Selection Modal -->
    <Teleport v-if="dialogStore.showDialog && dialogStore.dialogOptions?.title === t('alert-confirm-org-limit')" defer to="#dialog-v2-content">
      <div class="space-y-4">
        <div class="overflow-y-auto p-2 max-h-64 rounded-lg border">
          <div v-for="org in organizationStore.organizations" :key="org.gid" class="flex gap-2 items-center p-2">
            <input
              :id="`org-select-${org.gid}`"
              :value="org.gid"
              type="checkbox"
              class="checkbox"
              @change="handleOrgSelection(org.gid, ($event.target as HTMLInputElement).checked)"
            >
            <label :for="`org-select-${org.gid}`" class="text-sm">
              {{ org.name }}
            </label>
          </div>
        </div>
        <div class="flex gap-2 items-center mt-4">
          <input
            id="limit-to-app-org"
            v-model="limitToOrgCheckbox"
            type="checkbox"
            class="checkbox"
          >
          <label for="limit-to-app-org" class="text-sm">
            {{ t('limit-to-app') }}
          </label>
        </div>
      </div>
    </Teleport>

    <!-- Teleport Content for App Selection Modal -->
    <Teleport v-if="dialogStore.showDialog && dialogStore.dialogOptions?.title === t('alert-confirm-appid-limit')" defer to="#dialog-v2-content">
      <div class="space-y-4">
        <div class="overflow-y-auto p-2 max-h-64 rounded-lg border">
          <div v-for="app in availableApps" :key="app.app_id" class="flex gap-2 items-center p-2">
            <input
              :id="`app-${app.app_id}`"
              :value="app"
              type="checkbox"
              class="checkbox"
              @change="handleAppSelection(app as any, ($event.target as HTMLInputElement).checked)"
            >
            <label :for="`app-${app.app_id}`" class="text-sm">
              {{ app.name }}
            </label>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
