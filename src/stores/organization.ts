import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { useMainStore } from './main'
import type { Database } from '~/types/supabase.types'
import { getCurrentPlanName, useSupabase } from '~/services/supabase'
import type { ArrayElement, Concrete, Merge } from '~/services/types'

export type Organization = ArrayElement<Database['public']['Functions']['get_orgs_v2']['Returns']>
export type OrganizationRole = Database['public']['Enums']['user_min_right'] | 'owner'
export type ExtendedOrganizationMember = Concrete<Merge<ArrayElement<Database['public']['Functions']['get_org_members']['Returns']>, { id: number }>>
export type ExtendedOrganizationMembers = ExtendedOrganizationMember[]
// TODO Create user rights in database
// type Right = Database['public']['Tables']['user_rights']['Row']

const supabase = useSupabase()

export const useOrganizationStore = defineStore('organization', () => {
  const _organizations: Ref<Map<string, Organization>> = ref(new Map())

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

  const currentOrganization = ref<Organization>()
  const currentRole = ref<OrganizationRole | null>(null)
  const currentPlanName = ref<string>('Free')

  watch(currentOrganization, async (currentOrganization) => {
    if (!currentOrganization) {
      currentRole.value = null
      return
    }

    currentRole.value = await getCurrentRole(currentOrganization.created_by, undefined, undefined)
    currentPlanName.value = await getCurrentPlanName(currentOrganization.created_by)
    console.log('current role', currentRole.value)
  })

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
    const main = useMainStore()

    const userId = main.user?.id
    if (!userId)
      return

    // We have RLS that ensure that we only selct rows where we are member or owner
    const { data, error } = await supabase
      .rpc('get_orgs_v2', {
        userid: userId,
      })

    if (error)
      throw error

    const organization = data.find(org => org.role === 'owner')
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
  }

  const dedupFetchOrganizations = async () => {
    if (_organizations.value.size === 0)
      await fetchOrganizations()
  }

  return {
    organizations,
    currentOrganization,
    currentRole,
    currentPlanName,
    setCurrentOrganization,
    setCurrentOrganizationFromValue,
    setCurrentOrganizationToMain,
    getMembers,
    getCurrentRole,
    hasPermisisonsInRole,
    fetchOrganizations,
    dedupFetchOrganizations,
  }
})
