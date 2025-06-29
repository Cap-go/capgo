import type { ComputedRef, Ref } from 'vue'
import type { ArrayElement, Concrete, Merge } from '~/services/types'
import type { Database } from '~/types/supabase.types'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { getProcessCronStatsJobInfo, useSupabase } from '~/services/supabase'
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

  // WARNING: currentOrganization does not guarantee corectness when used in an app-based URL
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
  const currentRole = ref<OrganizationRole | null>(null)

  watch(currentOrganization, async (currentOrganizationRaw) => {
    if (!currentOrganizationRaw) {
      currentRole.value = null
      return
    }

    currentRole.value = await getCurrentRole(currentOrganizationRaw.created_by)
    await main.updateDashboard(currentOrganizationRaw.gid, currentOrganizationRaw.subscription_start, currentOrganizationRaw.subscription_end)
  })

  watch(_organizations, async (organizationsMap) => {
    const organizations = Array.from(organizationsMap.values())

    const { error, data: allAppsByOwner } = await supabase.from('apps').select('app_id, owner_org')

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

  const setCurrentOrganization = (id: string) => {
    currentOrganization.value = organizations.value.find(org => org.gid === id)
  }

  const setCurrentOrganizationFromValue = (value: Organization) => {
    currentOrganization.value = value
  }

  const hasPermisisonsInRole = (perm: OrganizationRole | null, perms: OrganizationRole[]): boolean => {
    return (perm && perms.includes(perm)) ?? false
  }

  const setCurrentOrganizationToMain = () => {
    const organization = organizations.value.find(org => org.role === 'owner')
    if (!organization)
      throw new Error('User has no main organization')

    currentOrganization.value = organization
  }
  const setCurrentOrganizationToFirst = () => {
    if (organizations.value.length === 0)
      return
    const organization = organizations.value[0]
    currentOrganization.value = organization
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
      const listner = supabase.auth.onAuthStateChange((event: any) => {
        if (event === 'SIGNED_OUT') {
          listner.data.subscription.unsubscribe()
          // Remove all from orgs
          _organizations.value = new Map()
          _organizationsByAppId.value = new Map()
          _initialLoadPromise.value = Promise.withResolvers()
          currentOrganization.value = undefined
          currentRole.value = null
        }
      })
    }

    // We have RLS that ensure that we only selct rows where we are member or owner
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

    _organizations.value = new Map(mappedData.map(item => [item.id.toString(), item]))
    currentOrganization.value ??= organization

    // console.log('done', currentOrganization.value)
    getProcessCronStatsJobInfo()
      .then((data) => {
        main.statsTime.last_run = data.last_run
        main.statsTime.next_run = data.next_run
      })
      .catch()
  }

  const dedupFetchOrganizations = async () => {
    if (_organizations.value.size === 0)
      await fetchOrganizations()
  }

  const getAllOrgs = () => {
    return _organizations.value
  }

  return {
    organizations,
    currentOrganization,
    currentRole,
    setCurrentOrganization,
    setCurrentOrganizationFromValue,
    setCurrentOrganizationToMain,
    setCurrentOrganizationToFirst,
    getMembers,
    getCurrentRoleForApp,
    getCurrentRole,
    getAllOrgs,
    hasPermisisonsInRole,
    fetchOrganizations,
    dedupFetchOrganizations,
    getOrgByAppId,
    awaitInitialLoad,
  }
})
