import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useSupabase } from '~/services/supabase'
import { useOrganizationStore } from './organization'

export const useDashboardAppsStore = defineStore('dashboardApps', () => {
  const apps = ref<{ app_id: string, name: string | null }[]>([])
  const isLoading = ref(false)
  const isLoaded = ref(false)
  const currentOrgId = ref<string | null>(null)

  const appNames = computed(() => {
    const names: { [appId: string]: string } = {}
    apps.value.forEach((app) => {
      names[app.app_id] = app.name || app.app_id
    })
    return names
  })

  const appIds = computed(() => apps.value.map(app => app.app_id))

  async function fetchApps(force = false) {
    const organizationStore = useOrganizationStore()
    const orgId = organizationStore.currentOrganization?.gid

    // Return early if already loading
    if (isLoading.value || !orgId) {
      return
    }

    // Return cached data if same organization and not forcing
    if (!force && isLoaded.value && currentOrgId.value === orgId) {
      return
    }

    // Reset if organization changed
    if (currentOrgId.value !== orgId) {
      reset()
      currentOrgId.value = orgId
    }

    if (!orgId) {
      apps.value = []
      isLoaded.value = true
      return
    }

    isLoading.value = true

    try {
      const { data } = await useSupabase()
        .from('apps')
        .select('app_id, name')
        .eq('owner_org', orgId)

      apps.value = data || []
      isLoaded.value = true
    }
    catch (error) {
      console.error('Error fetching apps:', error)
      apps.value = []
    }
    finally {
      isLoading.value = false
    }
  }

  function reset() {
    apps.value = []
    isLoaded.value = false
    isLoading.value = false
    currentOrgId.value = null
  }

  return {
    // State
    apps,
    isLoading,
    isLoaded,

    // Getters
    appNames,
    appIds,

    // Actions
    fetchApps,
    reset,
  }
})
