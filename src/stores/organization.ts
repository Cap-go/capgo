import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { useMainStore } from './main'
import type { Database } from '~/types/supabase.types'
import { useSupabase } from '~/services/supabase'
import type { ArrayElement, Concrete, Merge } from '~/services/types'

type User = Database['public']['Tables']['users']['Row']
export type Organization = ArrayElement<Database['public']['Functions']['get_orgs_v2']['Returns']>
type OrganizationRole = Database['public']['Enums']['user_min_right'] | 'owner'
export type ExtendedOrganizationMembers = Concrete<Merge<ArrayElement<Database['public']['Functions']['get_org_members']['Returns']>, { id: number }>>[]
// TODO Create user rights in database
// type Right = Database['public']['Tables']['user_rights']['Row']
type Right = 'create' | 'read' | 'update' | 'delete'

const supabase = useSupabase()

export const useOrganizationStore = defineStore('organization', () => {
  const _organizations: Ref<Map<string, Organization>> = ref(new Map())

  const organizations: ComputedRef<Organization[]> = computed(
    () => {
      return Array.from(
        _organizations.value, ([key, value]) => value,
      )
    },
  )

  const currentOrganization = ref<Organization>()

  const setCurrentOrganization = (id: string) => {
    currentOrganization.value = organizations.value.find(org => org.gid === id)
  }

  const setCurrentOrganizationFromValue = (value: Organization) => {
    currentOrganization.value = value
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

    console.log('fetch orgs!')
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

    console.log('fetch or d', data)
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
      fetchOrganizations()
  }

  const createOrganization = (name: string, logo?: string) => {
    throw new Error('Not implemented')
  }

  const updateOrganization = (name: string, logo?: string) => {
    throw new Error('Not implemented')
  }

  const deleteOrganization = (name: string, logo?: string) => {
    throw new Error('Not implemented')
  }

  const getUsers = (orgId: string): User[] => {
    throw new Error('Not implemented')
  }

  const addUser = (newUserId: string) => {
    throw new Error('Not implemented')
  }

  const deleteUser = (newUserId: string) => {
    throw new Error('Not implemented')
  }

  const updateRightForUser = (userId: string, right: Right) => {
    throw new Error('Not implemented')
  }

  /**
   *
   * @brief Create Stripe hosted solution
   * @param orgId
   * @returns
   */
  const getBillingInformation = (orgId: string) => {
    return ''
  }

  return {
    organizations,
    currentOrganization,
    setCurrentOrganization,
    setCurrentOrganizationFromValue,
    getMembers,
    fetchOrganizations,
    dedupFetchOrganizations,
  }
})
