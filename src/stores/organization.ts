import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { useMainStore } from './main'
import type { Database } from '~/types/supabase.types'
import { useSupabase } from '~/services/supabase'

type User = Database['public']['Tables']['users']['Row']
export type Organization = Database['public']['Tables']['orgs']['Row']
type ExtendedOrganizationMembers = Database['public']['Functions']['get_org_members']['Returns']
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
    currentOrganization.value = organizations.value.find(org => org.id === id)
  }

  const setCurrentOrganizationFromValue = (value: Organization) => {
    currentOrganization.value = value
  }

  const getMembers = async (): Promise<ExtendedOrganizationMembers> => {
    const currentOrgId = currentOrganization.value?.id
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

    return data
  }

  const fetchOrganizations = async () => {
    const main = useMainStore()

    console.log('fetch orgs!')
    // We have RLS that ensure that we only selct rows where we are member or owner
    const { data, error } = await supabase
      .from('orgs')
      .select('*')

    if (error)
      throw error

    console.log('fetch or d', data)
    const organization = <Organization | undefined>data[0]
    if (!organization) {
      console.log('user has no main organization')
      return
    }

    _organizations.value = new Map(data.map(item => [item.id, item]))
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
