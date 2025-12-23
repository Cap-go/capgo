import type { ComputedRef, Ref } from 'vue'
import type { ArrayElement, Concrete, Merge } from '~/services/types'
import type { Database } from '~/types/supabase.types'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useSupabase } from '~/services/supabase'
import { useDashboardAppsStore } from './dashboardApps'
import { useDisplayStore } from './display'
import { useMainStore } from './main'

export type Organization = ArrayElement<Database['public']['Functions']['get_orgs_v6']['Returns']>
export type OrganizationRole = Database['public']['Enums']['user_min_right'] | 'owner'
export type ExtendedOrganizationMember = Concrete<Merge<ArrayElement<Database['public']['Functions']['get_org_members']['Returns']>, { id: number }>>
export type ExtendedOrganizationMembers = ExtendedOrganizationMember[]

const supabase = useSupabase()
const main = useMainStore()

export const useOrganizationStore = defineStore('organization', () => {
  const _organizations: Ref<Map<string, Organization>> = ref(new Map())
  const _organizationsByAppId: Ref<Map<string, Organization>> = ref(new Map())
  const _initialLoadPromise = ref(Promise.withResolvers())
  const _initialized = ref(false)

  const organizations: ComputedRef<Organization[]> = computed(
    () => {
      return Array.from(
        _organizations.value,
        ([_key, value]) => value,
      )
    },
  )

  const getCurrentRole = async (appOwner: string, appId?: string, channelId?: number): Promise<OrganizationRole> => {
    if (_organizations.value.size === 0) {
      // eslint-disable-next-line ts/no-use-before-define
      await fetchOrganizations()
    }
    for (const org of _organizations.value.values()) {
      if (org.created_by === appOwner)
        return org.role as OrganizationRole
    }

    throw new Error(`Cannot find role for (${appOwner}, ${appId}, ${channelId}))`)
  }

  // WARNING: currentOrganization does not guarantee correctness when used in an app-based URL
  // For example if you try to use this value when fetching app channels it COULD BE incorrect
  // When trying to fetch an organization in an app based component the following should be used
  //
  // const organization = ref(null as null | Organization)
  // watchEffect(async () => {
  //  await organizationStore.awaitInitialLoad()
  //  organization.value = organizationStore.getOrgByAppId(appId.value) ?? null
  // }
  //
  const currentOrganization = ref<Organization | undefined>(undefined)
  const currentOrganizationFailed = ref(false)
  const currentRole = ref<OrganizationRole | null>(null)

  const STORAGE_KEY = 'capgo_current_org_id'

  watch(currentOrganization, async (currentOrganizationRaw, oldOrganization) => {
    if (!currentOrganizationRaw) {
      currentRole.value = null
      localStorage.removeItem(STORAGE_KEY)
      return
    }

    localStorage.setItem(STORAGE_KEY, currentOrganizationRaw.gid)
    currentRole.value = await getCurrentRole(currentOrganizationRaw.created_by)
    currentOrganizationFailed.value = !(!!currentOrganizationRaw.paying || (currentOrganizationRaw.trial_left ?? 0) > 0)

    // Clear caches when org changes to prevent showing stale data from other orgs
    if (oldOrganization?.gid !== currentOrganizationRaw.gid) {
      const displayStore = useDisplayStore()
      displayStore.clearCachesForOrg(currentOrganizationRaw.gid)

      // Reset and refetch dashboard apps for the new org
      const dashboardAppsStore = useDashboardAppsStore()
      dashboardAppsStore.reset()
      // Fetch apps for the new org - don't await to avoid blocking other operations
      dashboardAppsStore.fetchApps(true)
    }

    // Always fetch last 30 days of data and filter client-side for billing period
    const last30DaysEnd = new Date()
    const last30DaysStart = new Date()
    last30DaysStart.setDate(last30DaysStart.getDate() - 29) // 30 days including today
    await main.updateDashboard(currentOrganizationRaw.gid, last30DaysStart.toISOString(), last30DaysEnd.toISOString())
  })

  watch(_organizations, async (organizationsMap) => {
    // Only run once - if we already have the app-to-org mapping, skip
    if (_organizationsByAppId.value.size > 0)
      return

    const organizations = Array.from(organizationsMap.values())
    const orgIds = organizations.map(org => org.gid)

    if (orgIds.length === 0) {
      _initialLoadPromise.value.resolve(true)
      return
    }

    const { error, data: allAppsByOwner } = await supabase
      .from('apps')
      .select('app_id, owner_org')
      .in('owner_org', orgIds)

    if (error) {
      console.error('Cannot get app apps for org store', error)
      return
    }

    const organizationsByAppId = new Map<string, Organization>()

    for (const app of allAppsByOwner) {
      // For each app find the org_id that owns said app
      // This is needed for the "banner"
      const org = organizations.find(org => org.gid === app.owner_org)
      if (!org) {
        console.error(`Cannot find organization for app`, app)
        _initialLoadPromise.value.reject(`Cannot find organization for app ${app}`)
        return
      }

      organizationsByAppId.set(app.app_id, org)
    }

    _organizationsByAppId.value = organizationsByAppId
    _initialLoadPromise.value.resolve(true)
  })

  const getOrgByAppId = (appId: string) => {
    return _organizationsByAppId.value.get(appId)
  }

  const awaitInitialLoad = () => {
    return _initialLoadPromise.value.promise
  }

  const getCurrentRoleForApp = (appId: string) => {
    if (_organizationsByAppId.value.size < 1)
      throw new Error('Organizations by app_id map is empty')

    const org = getOrgByAppId(appId)
    if (!org)
      throw new Error(`Cannot find app ${appId} in the app_id -> org map`)

    return org.role as OrganizationRole
  }

  const hasPermissionsInRole = (perm: OrganizationRole | null, perms: OrganizationRole[]): boolean => {
    return (perm && perms.includes(perm)) ?? false
  }

  const setCurrentOrganization = (id: string) => {
    currentOrganization.value = organizations.value.find(org => org.gid === id)
  }

  const setCurrentOrganizationToMain = () => {
    const organization = organizations.value.find(org => org.role === 'owner')
    if (!organization)
      throw new Error('User has no main organization')

    setCurrentOrganization(organization.gid)
  }
  const setCurrentOrganizationToFirst = () => {
    if (organizations.value.length === 0)
      return
    const organization = organizations.value[0]
    setCurrentOrganization(organization.gid)
  }

  const getMembers = async (): Promise<ExtendedOrganizationMembers> => {
    const currentOrgId = currentOrganization.value?.gid
    if (!currentOrgId)
      return []

    const { data, error } = await supabase
      .rpc('get_org_members', {
        guild_id: currentOrgId,
      })

    if (error || data === null) {
      console.log('Cannot get org members!', error)
      return []
    }

    return data.map(
      (item, id) => {
        return { id, ...item }
      },
    )
  }

  const fetchOrganizations = async () => {
    const main = useMainStore()

    const userId = main.user?.id
    if (!userId)
      return

    if (!_initialized.value) {
      const listener = supabase.auth.onAuthStateChange((event: any) => {
        if (event === 'SIGNED_OUT') {
          listener.data.subscription.unsubscribe()
          // Remove all from orgs
          _organizations.value = new Map()
          _organizationsByAppId.value = new Map()
          _initialLoadPromise.value = Promise.withResolvers()
          currentOrganization.value = undefined
          currentRole.value = null
        }
      })
    }

    // We have RLS that ensure that we only select rows where we are member or owner
    const { data, error } = await supabase
      .rpc('get_orgs_v6')

    if (error) {
      console.error('Cannot get orgs!', error)
      throw error
    }

    const organization = data
      .filter(org => !org.role.includes('invite'))
      .sort((a, b) => b.app_count - a.app_count)[0]
    if (!organization) {
      console.log('user has no main organization')
      throw error
    }

    const mappedData = data.map((item, id) => {
      return { id, ...item }
    })

    _organizations.value = new Map(mappedData.map(item => [item.gid, item]))

    // Try to restore from localStorage first
    if (!currentOrganization.value) {
      const storedOrgId = localStorage.getItem(STORAGE_KEY)
      if (storedOrgId) {
        const storedOrg = data.find(org => org.gid === storedOrgId && !org.role.includes('invite'))
        if (storedOrg) {
          currentOrganization.value = storedOrg
        }
      }
    }

    currentOrganization.value ??= organization
    currentOrganizationFailed.value = !(!!currentOrganization.value?.paying || (currentOrganization.value?.trial_left ?? 0) > 0)
  }

  const dedupFetchOrganizations = async () => {
    if (_organizations.value.size === 0)
      await fetchOrganizations()
  }

  const getAllOrgs = () => {
    return _organizations.value
  }

  const deleteOrganization = async (orgId: string) => {
    // Validate input
    if (!orgId || typeof orgId !== 'string' || orgId.trim() === '') {
      return { data: null, error: new Error('Invalid organization ID') }
    }

    // Check if current user has permission to delete this organization
    const currentUserId = main.user?.id
    if (!currentUserId) {
      return { data: null, error: new Error('User not authenticated') }
    }

    // Verify user has super_admin or owner role for this organization
    const currentOrg = _organizations.value.get(orgId)
    console.log('Delete org check:', { orgId, currentOrg, role: currentOrg?.role, userId: currentUserId })
    if (!currentOrg || (currentOrg.role !== 'super_admin' && currentOrg.role !== 'owner')) {
      console.error('Permission denied:', { role: currentOrg?.role, required: ['super_admin', 'owner'] })
      return { data: null, error: new Error('Insufficient permissions') }
    }

    const { data, error } = await supabase.from('orgs')
      .delete()
      .eq('id', orgId)

    if (error) {
      console.error('Organization deletion failed:', error.message)
      return { data, error }
    }

    return { data, error: null }
  }

  return {
    organizations,
    currentOrganization,
    currentOrganizationFailed,
    currentRole,
    setCurrentOrganization,
    setCurrentOrganizationToMain,
    setCurrentOrganizationToFirst,
    getMembers,
    getCurrentRoleForApp,
    getCurrentRole,
    getAllOrgs,
    hasPermissionsInRole,
    fetchOrganizations,
    dedupFetchOrganizations,
    getOrgByAppId,
    awaitInitialLoad,
    deleteOrganization,
  }
})
