<script setup lang="ts">
import type { TableColumn } from '~/components/comp_def'
import type { Database } from '~/types/supabase.types'
import { useI18n } from 'petite-vue-i18n'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import IconArrowPath from '~icons/heroicons/arrow-path'
import IconClipboard from '~icons/heroicons/clipboard-document'
import IconPencil from '~icons/heroicons/pencil'
import IconTrash from '~icons/heroicons/trash'
import Table from '~/components/Table.vue'
import { useSupabase } from '~/services/supabase'
import { useDialogV2Store } from '~/stores/dialogv2'
import { useDisplayStore } from '~/stores/display'
import { useMainStore } from '~/stores/main'
import { useOrganizationStore } from '~/stores/organization'

const { t } = useI18n()
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

// Available apps for selection (populated when showing app dialog)
const availableApps = ref<Database['public']['Tables']['apps']['Row'][]>([])

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
    return keys.value || []

  const query = searchQuery.value.toLowerCase()
  return keys.value.filter(key =>
    key.name?.toLowerCase().includes(query)
    || key.key.toLowerCase().includes(query),
  )
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
    .eq('user_id', main.user?.id || '')
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
    const { data: apps, error } = await supabase.from('apps').select('*')
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

  try {
    const newApiKey = crypto.randomUUID()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      console.log('Not logged in, cannot create API key')
      toast.error('Not logged in')
      return false
    }

    const { data, error } = await supabase
      .from('apikeys')
      .upsert({
        user_id: user.id,
        key: newApiKey,
        mode: keyType,
        name: '',
        limited_to_orgs: finalSelectedOrganizations.length > 0 ? finalSelectedOrganizations : null,
        limited_to_apps: finalSelectedApps.length > 0 ? finalSelectedApps.map(app => app.app_id) : null,
      })
      .select()

    if (error) {
      console.error('Error creating API key:', error)
      toast.error('Failed to create API key')
      return false
    }

    keys.value?.push(data[0])
    // Fetch org and app names for the new key
    await fetchOrgAndAppNames()
    toast.success(t('add-api-key'))
    return true
  }
  catch (error) {
    console.error('Error creating API key:', error)
    toast.error('Failed to create API key')
    return false
  }
}

async function addNewApiKey() {
  // Clear global state
  displayStore.selectedOrganizations = []
  displayStore.selectedApps = []
  limitToOrgCheckbox.value = false
  limitToAppCheckbox.value = false

  // Load all apps for selection
  await loadAllApps()

  // Show API key type selection modal with options
  await showAddNewKeyModal()
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
  dialogStore.openDialog({
    title: t('alert-add-new-key'),
    description: t('alert-generate-new-key'),
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('key-read'),
        id: 'read-button',
        role: 'secondary',
        handler: () => createApiKey('read'),
      },
      {
        text: t('key-upload'),
        id: 'upload-button',
        role: 'secondary',
        handler: () => createApiKey('upload'),
      },
      {
        text: t('write-key'),
        id: 'write-button',
        role: 'secondary',
        handler: () => createApiKey('write'),
      },
      {
        text: t('key-all'),
        id: 'all-button',
        role: 'primary',
        handler: () => createApiKey('all'),
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

async function copyKey(app: Database['public']['Tables']['apikeys']['Row']) {
  try {
    await navigator.clipboard.writeText(app.key)
    toast.success(t('key-copied'))
  }
  catch (err) {
    console.error('Failed to copy: ', err)
    // Display a modal with the copied key
    dialogStore.openDialog({
      title: t('cannot-copy-key'),
      description: app.key,
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

    <!-- Teleport Content for Add New Key Modal -->
    <Teleport v-if="dialogStore.showDialog && dialogStore.dialogOptions?.title === t('alert-add-new-key')" defer to="#dialog-v2-content">
      <div class="space-y-4 mt-4">
        <!-- Limit to Organizations -->
        <div class="flex items-center gap-2">
          <input
            id="limit-to-org"
            v-model="limitToOrgCheckbox"
            type="checkbox"
            class="checkbox"
          >
          <label for="limit-to-org" class="text-sm">
            {{ t('limit-to-org') }}
          </label>
        </div>
        <div v-if="limitToOrgCheckbox" class="pl-6">
          <div class="space-y-2 max-h-32 overflow-y-auto border rounded-lg p-2">
            <div v-for="org in organizationStore.organizations" :key="org.gid" class="flex items-center gap-2">
              <input
                :id="`org-${org.gid}`"
                :value="org.gid"
                type="checkbox"
                class="checkbox"
                @change="handleOrgSelection(org.gid, ($event.target as HTMLInputElement).checked)"
              >
              <label :for="`org-${org.gid}`" class="text-sm">
                {{ org.name }}
              </label>
            </div>
          </div>
        </div>

        <!-- Limit to Apps (only show if orgs are selected) -->
        <div v-if="limitToOrgCheckbox && displayStore.selectedOrganizations.length > 0" class="flex items-center gap-2">
          <input
            id="limit-to-app"
            v-model="limitToAppCheckbox"
            type="checkbox"
            class="checkbox"
          >
          <label for="limit-to-app" class="text-sm">
            {{ t('limit-to-app') }}
          </label>
        </div>
        <div v-if="limitToAppCheckbox && displayStore.selectedOrganizations.length > 0" class="pl-6">
          <div class="space-y-2 max-h-32 overflow-y-auto border rounded-lg p-2">
            <div v-for="app in filteredAppsForSelectedOrgs" :key="app.app_id" class="flex items-center gap-2">
              <input
                :id="`app-${app.app_id}`"
                :value="app"
                type="checkbox"
                class="checkbox"
                @change="handleAppSelection(app, ($event.target as HTMLInputElement).checked)"
              >
              <label :for="`app-${app.app_id}`" class="text-sm">
                {{ app.name }}
              </label>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Teleport Content for Change Name Modal -->
    <Teleport v-if="dialogStore.showDialog && dialogStore.dialogOptions?.title === t('change-api-key-name')" defer to="#dialog-v2-content">
      <div class="space-y-4">
        <div>
          <label for="api-key-name" class="block text-sm font-medium mb-2">{{ t('name') }}</label>
          <input
            v-model="newApiKeyName"
            type="text"
            :placeholder="t('type-new-name')"
            class="input input-bordered w-full"
            maxlength="32"
          >
        </div>
      </div>
    </Teleport>

    <!-- Teleport Content for Organization Selection Modal -->
    <Teleport v-if="dialogStore.showDialog && dialogStore.dialogOptions?.title === t('alert-confirm-org-limit')" defer to="#dialog-v2-content">
      <div class="space-y-4">
        <div class="max-h-64 overflow-y-auto border rounded-lg p-2">
          <div v-for="org in organizationStore.organizations" :key="org.gid" class="flex items-center gap-2 p-2">
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
        <div class="flex items-center gap-2 mt-4">
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
        <div class="max-h-64 overflow-y-auto border rounded-lg p-2">
          <div v-for="app in availableApps" :key="app.app_id" class="flex items-center gap-2 p-2">
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
