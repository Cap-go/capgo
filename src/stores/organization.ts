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

// Nouveaux rôles RBAC
export type RbacRoleName = 'org_super_admin' | 'org_admin' | 'org_billing_admin' | 'org_member' | 'app_admin' | 'app_developer' | 'app_uploader' | 'app_reader'

// Mapping des nouveaux rôles RBAC vers les anciens rôles (pour compatibilité avec l'ancien système)
export const RBAC_TO_LEGACY_ROLE_MAPPING: Record<RbacRoleName, OrganizationRole[]> = {
  org_super_admin: ['super_admin', 'owner'],
  org_admin: ['admin'],
  org_billing_admin: ['admin'], // Billing admin maps to admin in legacy
  org_member: ['read'],
  app_admin: ['admin', 'write'], // App admin needs at least admin or write
  app_developer: ['write'],
  app_uploader: ['upload'],
  app_reader: ['read'],
}

// Hiérarchie des rôles RBAC (un rôle inclut tous ceux en dessous)
export const RBAC_ROLE_HIERARCHY: Record<RbacRoleName, RbacRoleName[]> = {
  org_super_admin: ['org_super_admin', 'org_admin', 'org_member', 'app_admin', 'app_developer', 'app_uploader', 'app_reader'],
  org_admin: ['org_admin', 'org_member', 'app_admin', 'app_developer', 'app_uploader', 'app_reader'],
  org_billing_admin: ['org_billing_admin', 'org_member'],
  org_member: ['org_member', 'app_reader'],
  app_admin: ['app_admin', 'app_developer', 'app_uploader', 'app_reader'],
  app_developer: ['app_developer', 'app_uploader', 'app_reader'],
  app_uploader: ['app_uploader', 'app_reader'],
  app_reader: ['app_reader'],
}

// Mapping des rôles RBAC d'organisation vers leurs clés de traduction i18n
export const RBAC_ORG_ROLE_I18N_KEYS: Record<string, string> = {
  org_super_admin: 'role-org-super-admin',
  org_admin: 'role-org-admin',
  org_billing_admin: 'role-org-billing-admin',
  org_member: 'role-org-member',
  app_developer: 'role-app-developer',
  app_uploader: 'role-app-uploader',
  app_reader: 'role-app-reader',
}

/**
 * Obtient la clé i18n pour un rôle RBAC d'organisation
 * @param role Le nom technique du rôle
 * @returns La clé de traduction i18n, ou undefined si non mappé
 */
export function getRbacRoleI18nKey(role: string): string | undefined {
  return RBAC_ORG_ROLE_I18N_KEYS[role]
}

interface RoleBinding {
  id: string
  principal_type: string
  principal_id: string
  role_id: string
  role_name: string
  scope_type: string
  org_id: string | null
  app_id: string | null
  channel_id: string | null
  granted_at: string
  granted_by: string
  expires_at: string | null
  reason: string | null
  is_direct: boolean
}

const supabase = useSupabase()
const main = useMainStore()

export const useOrganizationStore = defineStore('organization', () => {
  const _organizations: Ref<Map<string, Organization>> = ref(new Map())
  const _organizationsByAppId: Ref<Map<string, Organization>> = ref(new Map())
  const _initialLoadPromise = ref(Promise.withResolvers())
  const _initialized = ref(false)
  const _roleBindingsCache: Ref<Map<string, RoleBinding[]>> = ref(new Map()) // Cache des role_bindings par orgId

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

  /**
   * Récupère les role_bindings de l'utilisateur courant pour une organisation
   */
  const fetchRoleBindingsForOrg = async (orgId: string): Promise<RoleBinding[]> => {
    // Vérifier le cache
    if (_roleBindingsCache.value.has(orgId)) {
      return _roleBindingsCache.value.get(orgId)!
    }

    try {
      const userId = main.user?.id
      if (!userId)
        return []

      // Utiliser la RPC sécurisée
      const { data, error } = await supabase
        .rpc('get_user_org_bindings_rbac', {
          p_org_id: orgId,
          p_user_id: userId,
        })

      if (error)
        throw error

      const userBindings = data || []

      // Mettre en cache
      _roleBindingsCache.value.set(orgId, userBindings)
      return userBindings
    }
    catch (error: any) {
      console.error('Error fetching role bindings:', error)
      return []
    }
  }

  /**
   * Invalide le cache des role_bindings pour une org
   */
  const invalidateRoleBindingsCache = (orgId?: string) => {
    if (orgId) {
      _roleBindingsCache.value.delete(orgId)
    }
    else {
      _roleBindingsCache.value.clear()
    }
  }

  /**
   * Vérifie si l'utilisateur a les permissions requises dans le nouveau système RBAC (synchrone, utilise le cache)
   *
   * ⚠️ FONCTION TEMPORAIRE - À remplacer par hasPermission() dans le futur
   * Cette fonction vérifie les RÔLES. Dans un vrai système RBAC, on devrait vérifier les PERMISSIONS.
   * Voir les commentaires dans hasPermissionsInRole() pour les détails de la migration.
   */
  const hasPermissionsInRbac = (orgId: string, requiredRoles: RbacRoleName[], appId?: string): boolean => {
    const bindings = _roleBindingsCache.value.get(orgId) || []

    if (bindings.length === 0)
      return false

    // Extraire les rôles de l'utilisateur
    const userRoles = bindings
      .filter((b) => {
        // Filtrer par scope si appId est fourni
        if (appId) {
          return (b.scope_type === 'app' && b.app_id === appId) || b.scope_type === 'org'
        }
        return true
      })
      .map(b => b.role_name as RbacRoleName)

    // Vérifier si l'un des rôles de l'utilisateur donne accès aux permissions requises
    for (const userRole of userRoles) {
      const impliedRoles = RBAC_ROLE_HIERARCHY[userRole] || [userRole]
      if (requiredRoles.some(reqRole => impliedRoles.includes(reqRole))) {
        return true
      }
    }

    return false
  }

  /**
   * Vérifie si l'utilisateur a les permissions requises.
   * Détecte automatiquement si l'org utilise le nouveau RBAC ou l'ancien système.
   * SYNCHRONE - les role_bindings sont pré-chargés lors du fetchOrganizations.
   *
   * ⚠️ FUTURE MIGRATION VERS UN SYSTÈME BASÉ SUR LES PERMISSIONS:
   * Cette fonction vérifie actuellement les RÔLES (org_admin, app_developer, etc.)
   * Dans le futur, pour supprimer complètement l'ancien système et avoir un vrai RBAC,
   * il faudra migrer vers un système basé sur les PERMISSIONS au lieu des rôles.
   *
   * EXEMPLE DE MIGRATION:
   * Au lieu de:
   *   hasPermissionsInRole(role, ['org_admin', 'org_super_admin'])
   *
   * Il faudra:
   *   hasPermission('org.settings.update', orgId)
   *   hasPermission('app.bundles.delete', orgId, appId)
   *   hasPermission('billing.view', orgId)
   *
   * Pour cela, créer:
   * 1. Une table `permissions` (key, description, scope_type)
   * 2. Une table `role_permissions` (role_id, permission_id) - déjà existe partiellement
   * 3. Une fonction `hasPermission(permissionKey: string, orgId?: string, appId?: string): boolean`
   *    qui:
   *    - Récupère les role_bindings de l'utilisateur
   *    - Pour chaque rôle, récupère les permissions associées (via role_permissions + hiérarchie)
   *    - Vérifie si permissionKey est dans la liste
   *
   * AVANTAGES:
   * - Plus besoin de lister tous les rôles possibles dans chaque check
   * - Granularité fine (ex: 'billing.view' vs 'billing.update')
   * - Facile d'ajouter de nouvelles permissions sans toucher au code
   * - Système standard d'autorisation (permission-based access control)
   *
   * @param legacyRole Le rôle actuel dans l'ancien système (pour compatibilité, utilisé uniquement en mode legacy)
   * @param requiredRoles Les rôles RBAC requis (org_admin, app_developer, etc.)
   * @param orgId L'ID de l'organisation (optionnel, détecté via currentOrganization si absent)
   * @param appId L'ID de l'app (optionnel, pour filtrer par scope app dans le nouveau RBAC)
   */
  const hasPermissionsInRole = (
    legacyRole: OrganizationRole | null,
    requiredRoles: RbacRoleName[],
    orgId?: string,
    appId?: string,
  ): boolean => {
    // Déterminer l'org à utiliser
    let targetOrg: Organization | undefined
    if (orgId) {
      targetOrg = _organizations.value.get(orgId)
    }
    else if (currentOrganization.value) {
      targetOrg = currentOrganization.value
      orgId = currentOrganization.value.gid
    }

    // Vérifier si on utilise le nouveau RBAC
    const useNewRbac = (targetOrg as any)?.use_new_rbac ?? false

    if (useNewRbac && orgId) {
      // Mode nouveau RBAC : consulter le cache des role_bindings
      return hasPermissionsInRbac(orgId, requiredRoles, appId)
    }

    // Mode ancien système (legacy) : convertir les rôles RBAC requis en anciens rôles et vérifier
    const legacyRolesRequired = new Set<OrganizationRole>()
    for (const rbacRole of requiredRoles) {
      const mappedLegacyRoles = RBAC_TO_LEGACY_ROLE_MAPPING[rbacRole] || []
      mappedLegacyRoles.forEach(r => legacyRolesRequired.add(r))
    }

    return (legacyRole && Array.from(legacyRolesRequired).includes(legacyRole)) ?? false
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

    // Pré-charger les role_bindings pour les orgs qui utilisent le nouveau RBAC
    const rbacOrgs = mappedData.filter(org => (org as any).use_new_rbac)
    await Promise.all(rbacOrgs.map(async (org) => {
      try {
        // Utiliser la RPC sécurisée
        const { data: bindingsData, error: bindingsError } = await supabase
          .rpc('get_user_org_bindings_rbac', {
            p_org_id: org.gid,
            p_user_id: userId,
          })

        if (!bindingsError && bindingsData) {
          _roleBindingsCache.value.set(org.gid, bindingsData)
        }
      }
      catch (error) {
        console.error(`Error preloading role_bindings for org ${org.gid}:`, error)
      }
    }))

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
    fetchRoleBindingsForOrg,
    invalidateRoleBindingsCache,
    fetchOrganizations,
    dedupFetchOrganizations,
    getOrgByAppId,
    awaitInitialLoad,
    deleteOrganization,
  }
})
