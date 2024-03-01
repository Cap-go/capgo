import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { ComputedRef } from 'vue'
import { useMainStore } from './main'
import type { Database } from '~/types/supabase.types'
import { useSupabase } from '~/services/supabase'
import type { ArrayElement, Concrete, Merge } from '~/services/types'

export type Organization = ArrayElement<Database['public']['Functions']['get_orgs_v4']['Returns']>
export type OrganizationRole = Database['public']['Enums']['user_min_right'] | 'owner'
export type ExtendedOrganizationMember = Concrete<Merge<ArrayElement<Database['public']['Functions']['get_org_members']['Returns']>, { id: number }>>
export type ExtendedOrganizationMembers = ExtendedOrganizationMember[]
// TODO Create user rights in database
// type Right = Database['public']['Tables']['user_rights']['Row']

// const permMap = new Map([
//   ['invite_read', 0],
//   ['invite_upload', 0],
//   ['invite_write', 0],
//   ['invite_admin', 0],
//   ['read', 1],
//   ['upload', 2],
//   ['write', 3],
//   ['admin', 4],
//   ['super_admin', 5],
// ])

const supabase = useSupabase()
const main = useMainStore()

export const useOrganizationStore = defineStore('organization', () => {
  const _organizations: Ref<Map<string, Organization>> = ref(new Map())
  const _organizationsByAppId: Ref<Map<string, Organization>> = ref(new Map())

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

  const currentOrganization = ref<Organization | undefined>(undefined)
  const currentRole = ref<OrganizationRole | null>(null)

  watch(currentOrganization, async (currentOrganizationRaw) => {
    if (!currentOrganizationRaw) {
      currentRole.value = null
      return
    }

    currentRole.value = await getCurrentRole(currentOrganizationRaw.created_by, undefined, undefined)
    await main.updateDashboard(currentOrganizationRaw.gid, currentOrganizationRaw.subscription_start, currentOrganizationRaw.subscription_end)
  })

  watch(_organizations, async (organizationsMap) => {
    const organizations = Array.from(organizationsMap.values())

    const a = await supabase.from('org_users').select('*')
    console.log(organizations, a.data)
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
        return
      }

      organizationsByAppId.set(app.app_id, org)
    }

    _organizationsByAppId.value = organizationsByAppId
  })

  const getOrgByAppId = (appId: string) => {
    return _organizationsByAppId.value.get(appId)
  }

  const setCurrentOrganization = (id: string) => {
    currentOrganization.value = organizations.value.find(org => org.gid === id)
  }

  const setCurrentOrganizationFromValue = (value: Organization) => {
    currentOrganization.value = value
  }

  const hasPermisisonsInRole = (perm: OrganizationRole | null, perms: OrganizationRole[]): boolean => {
    return (perm && perms.includes(perm)) || false
  }

  const setCurrentOrganizationToMain = () => {
    const organization = organizations.value.find(org => org.role === 'owner')
    if (!organization)
      throw new Error('User has no main organization')

    currentOrganization.value = organization
  }

  const getMembers = async (): Promise<ExtendedOrganizationMembers> => {
    const currentOrgId = currentOrganization.value?.gid
    if (!currentOrgId)
      return []

    console.log('fetch members!')

    const uid = (await supabase.auth.getUser()).data.user?.id
    console.log(uid)

    const { data, error } = await supabase
      .rpc('get_org_members', {
        guild_id: currentOrgId,
      })

    console.log(data)
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
    console.log('fetch orgs')
    const main = useMainStore()

    const userId = main.user?.id
    if (!userId)
      return

    // We have RLS that ensure that we only selct rows where we are member or owner
    const { data, error } = await supabase
      .rpc('get_orgs_v4', {
        userid: userId,
      })

    if (error)
      throw error

    const organization = data.filter(org => !org.role.includes('invite')).sort((a, b) => b.app_count - a.app_count)[0]
    if (!organization) {
      console.log('user has no main organization')
      return
    }

    const mappedData = data.map((item, id) => {
      return { id, ...item }
    })

    _organizations.value = new Map(mappedData.map(item => [item.id.toString(), item]))
    if (!currentOrganization.value)
      currentOrganization.value = organization

    console.log('done', currentOrganization.value)
  }

  const dedupFetchOrganizations = async () => {
    if (_organizations.value.size === 0)
      await fetchOrganizations()
  }

  return {
    organizations,
    currentOrganization,
    currentRole,
    setCurrentOrganization,
    setCurrentOrganizationFromValue,
    setCurrentOrganizationToMain,
    getMembers,
    getCurrentRole,
    hasPermisisonsInRole,
    fetchOrganizations,
    dedupFetchOrganizations,
    getOrgByAppId,
  }
})
