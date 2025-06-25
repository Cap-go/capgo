<script setup lang="ts">
import type { TableColumn } from '~/components/comp_def'
import type { Database } from '~/types/supabase.types'
import { useI18n } from 'petite-vue-i18n'
import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'
import IconArrowPath from '~icons/heroicons/arrow-path'
import IconClipboard from '~icons/heroicons/clipboard-document'
import IconPencil from '~icons/heroicons/pencil'
import IconTrash from '~icons/heroicons/trash'
import Table from '~/components/Table.vue'
import { useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'

const { t } = useI18n()
const displayStore = useDisplayStore()
const main = useMainStore()
const currentPage = ref(1)
const isLoading = ref(false)
const supabase = useSupabase()
const keys = ref<Database['public']['Tables']['apikeys']['Row'][]>([])
const organizationStore = useOrganizationStore()
const columns: Ref<TableColumn[]> = ref<TableColumn[]>([])

// Cache for organization and app names
const orgCache = ref(new Map<string, string>())
const appCache = ref(new Map<string, string>())

// Function to truncate strings (show first 5 and last 5 characters)
function hideString(str: string) {
  const first = str.slice(0, 5)
  const last = str.slice(-5)
  return `${first}...${last}`
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
const filteredKeys = computed(() => {
  if (!keys.value || !searchQuery.value)
    return keys.value ?? []

  const query = searchQuery.value.toLowerCase()
  return keys.value.filter(key =>
    key.name?.toLowerCase().includes(query)
    || key.key.toLowerCase().includes(query),
  )
})

columns.value = [
  {
    key: 'mode',
    label: t('type'),
    displayFunction: (row: Database['public']['Tables']['apikeys']['Row']) => {
      return row.mode.toUpperCase()
    },
  },
  {
    key: 'key',
    label: t('api-key'),
    head: true,
    displayFunction: (row: Database['public']['Tables']['apikeys']['Row']) => {
      return hideString(row.key)
    },
  },
  {
    key: 'name',
    label: t('name'),
    head: true,
    mobile: true,
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

async function addNewApiKey() {
  console.log('displayStore.dialogCheckbox', organizationStore.organizations)
  if (await showAddNewKeyModal())
    return

  const keyType = displayStore.lastButtonRole

  let databaseKeyType: 'read' | 'write' | 'all' | 'upload'

  switch (keyType) {
    case 'cancel':
    case '':
      return
    case 'read-button':
      databaseKeyType = 'read'
      break
    case 'upload-button':
      databaseKeyType = 'upload'
      break
    case 'write-button':
      databaseKeyType = 'write'
      break
    case 'all-button':
      databaseKeyType = 'all'
      break
    default:
      return
  }

  let selectedOrganizations = [] as string[]
  if (displayStore.dialogCheckbox) {
    displayStore.unsetDialogCheckbox()
    displayStore.dialogOption = {
      header: t('alert-confirm-org-limit'),
      message: t('alert-confirm-org-limit-message'),
      textStyle: 'mb-5',
      listOrganizations: true,
      checkboxText: t('limit-to-app'),
      checkboxStyle: 'mb-0 mt-10',
      buttons: [
        {
          text: t('button-cancel'),
          role: 'cancel',
        },
        {
          text: t('button-confirm'),
          id: 'confirm-button',
        },
      ],
    }
    displayStore.showDialog = true
    if (await displayStore.onDialogDismiss())
      return
    selectedOrganizations = displayStore.selectedOrganizations
    if (selectedOrganizations.length === 0) {
      toast.error(t('alert-no-org-selected'))
      return
    }
  }

  let selectedApps = [] as Database['public']['Tables']['apps']['Row'][]
  // check if the users wants to limit the api key to a specific app
  if (displayStore.dialogCheckbox) {
    displayStore.unsetDialogCheckbox()
    const { data: apps, error } = await supabase.from('apps').select('*').in('owner_org', selectedOrganizations)
    if (error) {
      console.error('Cannot get apps for api key', error)
      return
    }

    if (error) {
      toast.error(t('cannot-get-apps'))
      console.error('Cannot get apps for api key', error)
      return
    }

    if (apps.length === 0) {
      toast.error(selectedOrganizations.length === 1 ? t('no-apps-found') : t('no-apps-found-plural'))
      return
    }

    displayStore.dialogOption = {
      header: t('alert-confirm-appid-limit'),
      message: t('alert-confirm-appid-limit-message'),
      listApps: apps,
      textStyle: 'mb-5',
      buttons: [
        {
          text: t('button-cancel'),
          role: 'cancel',
        },
        {
          text: t('button-confirm'),
          id: 'confirm-button',
        },
      ],
    }
    displayStore.showDialog = true
    if (await displayStore.onDialogDismiss())
      return
    selectedApps = displayStore.selectedApps as any as Database['public']['Tables']['apps']['Row'][]
    if (selectedApps.length === 0) {
      toast.error(t('alert-no-app-selected'))
      return
    }
  }

  const newApiKey = crypto.randomUUID()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    console.log('Not logged in, cannot regenerate API key')
    return
  }

  const { data, error } = await supabase
    .from('apikeys')
    .upsert({
      user_id: user.id,
      key: newApiKey,
      mode: databaseKeyType as 'read' | 'write' | 'all' | 'upload',
      name: '',
      limited_to_orgs: selectedOrganizations.length > 0 ? selectedOrganizations : null,
      limited_to_apps: selectedApps.length > 0 ? selectedApps.map(app => app.app_id) : null,
    })
    .select()

  if (error)
    throw error

  keys.value?.push(data[0])
  toast.success(t('add-api-key'))
}

async function regenrateKey(app: Database['public']['Tables']['apikeys']['Row']) {
  if (await showRegenerateKeyModal())
    return

  const newApiKey = crypto.randomUUID()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    console.log('Not logged in, cannot regenerate API key')
    return
  }

  const { error } = await supabase
    .from('apikeys')
    .update({ key: newApiKey })
    .eq('user_id', user.id)
    .eq('key', app.key)

  if (error || typeof newApiKey !== 'string')
    throw error

  app.key = newApiKey

  toast.success(t('generated-new-apikey'))
}

async function deleteKey(key: Database['public']['Tables']['apikeys']['Row']) {
  if (await showDeleteKeyModal())
    return

  const { error } = await supabase
    .from('apikeys')
    .delete()
    .eq('key', key.key)

  if (error)
    throw error

  toast.success(t('removed-apikey'))
  keys.value = keys.value?.filter(filterKey => filterKey.key !== key.key)
}

async function changeName(key: Database['public']['Tables']['apikeys']['Row']) {
  const currentName = key.name
  displayStore.dialogInputText = currentName

  displayStore.dialogOption = {
    header: t('change-api-key-name'),
    message: `${t('type-new-name')}`,
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
          const newName = displayStore.dialogInputText
          if (currentName === newName) {
            toast.error(t('new-name-not-changed'))
            return
          }

          if (newName.length > 32) {
            toast.error(t('new-name-to-long'))
            return
          }

          if (newName.length < 4) {
            toast.error(t('new-name-to-short'))
            return
          }

          const { error } = await supabase.from('apikeys')
            .update({ name: newName })
            .eq('id', key.id)

          if (error) {
            toast.error(t('cannot-change-name'))
            console.error(error)
            return
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
  }
  displayStore.showDialog = true
  return displayStore.onDialogDismiss()
}

// This returns true if user has canceled the action
async function showRegenerateKeyModal() {
  displayStore.dialogOption = {
    header: t('alert-confirm-regenerate'),
    message: `${t('alert-not-reverse-message')}. ${t('alert-regenerate-key')}?`,
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('button-regenerate'),
        id: 'confirm-button',
      },
    ],
  }
  displayStore.showDialog = true
  return displayStore.onDialogDismiss()
}

async function showDeleteKeyModal() {
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

async function showAddNewKeyModal() {
  displayStore.dialogOption = {
    header: t('alert-add-new-key'),
    message: t('alert-generate-new-key'),
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('key-read'),
        id: 'read-button',
      },
      {
        text: t('key-upload'),
        id: 'upload-button',
      },
      {
        text: t('write-key'),
        id: 'write-button',
      },
      {
        text: t('key-all'),
        id: 'all-button',
      },
    ],
    checkboxText: t('limit-to-org'),
    checkboxStyle: 'mb-0 mt-14',
  }
  displayStore.showDialog = true
  return displayStore.onDialogDismiss()
}

async function copyKey(app: Database['public']['Tables']['apikeys']['Row']) {
  try {
    await navigator.clipboard.writeText(app.key)
    console.log('displayStore.messageToast', displayStore.messageToast)
    toast.success(t('key-copied'))
  }
  catch (err) {
    console.error('Failed to copy: ', err)
    // Display a modal with the copied key
    displayStore.dialogOption = {
      header: t('cannot-copy-key'),
      message: app.key,
      buttons: [
        {
          text: t('button-cancel'),
          role: 'cancel',
        },
      ],
    }
    displayStore.showDialog = true
    await displayStore.onDialogDismiss()
  }
}
displayStore.NavTitle = t('api-keys')
displayStore.defaultBack = '/app'
getKeys()
</script>

<template>
  <div>
    <div class="w-full h-full md:px-4 md:py-8 mx-auto max-w-9xl lg:px-8 sm:px-6">
      <div class="flex flex-col">
        <div class="flex flex-col overflow-hidden overflow-y-auto bg-white md:rounded-lg md:shadow-lg border-slate-300 md:mx-auto md:mt-5 md:w-2/3 md:border dark:border-slate-900 dark:bg-slate-800">
          <Table
            v-model:current-page="currentPage"
            show-add
            :columns="columns"
            :element-list="filteredKeys"
            :is-loading="isLoading"
            :total="filteredKeys.length"
            :search-placeholder="t('search-api-keys')"
            :search="searchQuery"
            @add="addNewApiKey"
            @update:search="searchQuery = $event"
            @reload="getKeys()"
            @reset="refreshData()"
          />
        </div>
        <p class="mx-3 mt-6 md:mx-auto">
          {{ t('api-keys-are-used-for-cli-and-public-api') }}
        </p>
        <div class="mx-3 mb-2 md:mx-auto">
          <a class="text-blue-500 underline" href="https://capgo.app/docs/tooling/cli/" target="_blank">
            {{ t('cli-doc') }}
          </a>
          <a class="ml-1 text-blue-500 underline" href="https://capgo.app/docs/tooling/api/" target="_blank">
            {{ t('api-doc') }}
          </a>
        </div>
      </div>
    </div>
  </div>
</template>
