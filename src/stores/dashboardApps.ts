import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useSupabase } from '~/services/supabase'
import { useOrganizationStore } from './organization'

export const useDashboardAppsStore = defineStore('dashboardApps', () => {
  const apps = ref<{ app_id: string, name: string | null }[]>([])
  const isLoading = ref(false)
  const isLoaded = ref(false)
  const currentOrgId = ref<string | null>(null)
  let loadPromise: Promise<void> | null = null

  const appNames = computed(() => {
    const names: { [appId: string]: string } = {}
    apps.value.forEach((app) => {
      names[app.app_id] = app.name || app.app_id
    })
    return names
  })

  const appIds = computed(() => apps.value.map(app => app.app_id))

  async function fetchApps(force = false) {
    console.log('[dashboardAppsStore] fetchApps called, force:', force, 'isLoaded:', isLoaded.value, 'currentOrgId:', currentOrgId.value)
    const organizationStore = useOrganizationStore()
    try {
      await organizationStore.dedupFetchOrganizations()
      await organizationStore.awaitInitialLoad()
    }
    catch (error) {
      console.error('Error preparing organization data for apps fetch:', error)
      return
    }
    const orgId = organizationStore.currentOrganization?.gid

    if (!orgId) {
      console.log('[dashboardAppsStore] No orgId, resetting')
      apps.value = []
      currentOrgId.value = null
      isLoaded.value = true
      return
    }

    if (isLoading.value) {
      console.log('[dashboardAppsStore] Already loading, waiting for existing promise')
      if (loadPromise)
        await loadPromise
      if (!force)
        return
    }

    // Return cached data if same organization and not forcing
    if (!force && isLoaded.value && currentOrgId.value === orgId) {
      console.log('[dashboardAppsStore] Using cached apps data - NO NETWORK REQUEST')
      return
    }

    // Reset if organization changed
    if (currentOrgId.value !== orgId) {
      reset()
      currentOrgId.value = orgId
    }

    console.log('[dashboardAppsStore] Fetching apps from API - NETWORK REQUEST ABOUT TO HAPPEN')
    console.trace('[dashboardAppsStore] Stack trace for fetchApps')
    isLoading.value = true

    const supabase = useSupabase()
    const request = (async () => {
      try {
        const { data } = await supabase
          .from('apps')
          .select('app_id, name')
          .eq('owner_org', orgId)

        console.log('[dashboardAppsStore] Apps fetched, count:', data?.length)
        apps.value = data || []
        isLoaded.value = true
      }
      catch (error) {
        console.error('Error fetching apps:', error)
        apps.value = []
      }
      finally {
        isLoading.value = false
        loadPromise = null
      }
    })()

    loadPromise = request
    await request
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
