import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { Database } from '~/types/supabase.types'

type User = Database['public']['Tables']['users']['Row']
type Organization = Database['public']['Tables']['orgs']['Row']
// TODO Create user rights in database
// type Right = Database['public']['Tables']['user_rights']['Row']
type Right = 'create' | 'read' | 'update' | 'delete'

export const useOrganizationStore = defineStore('organization', () => {
  const _organizations: Ref<Map<string, Organization>> = ref(new Map())

  const organizations: ComputedRef<Organization[]> = computed(
    () => {
      return Array.from(
        _organizations.value, ([key, value]) => value,
      )
    },
  )

  const currentOrganization = ref()

  const setCurrentOrganization = (id: string) => {
    currentOrganization.value = organizations.value.find(org => org.id === id)
  }

  const fetchOrganizations = () => {
    // ...
    if (!currentOrganization.value)
      currentOrganization.value = organizations.value[0]
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
    fetchOrganizations,
  }
})
