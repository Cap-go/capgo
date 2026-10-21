import { invokeCapgoApi } from '~/services/capgoApi'

// Access the SSO role mapping rewrites on every login of an SSO member: their
// org role, their roles on the mapped apps and their membership of the mapped
// groups. A manual edit of these would be reverted at the next login, so the
// UI locks them.
export interface SsoManagedAccess {
  userIds: Set<string>
  appIds: Set<string>
  groupIds: Set<string>
}

export function emptySsoManagedAccess(): SsoManagedAccess {
  return { userIds: new Set(), appIds: new Set(), groupIds: new Set() }
}

// Best effort: if the lookup fails nothing is locked.
export async function fetchSsoManagedAccess(orgId: string): Promise<SsoManagedAccess> {
  const { data, error } = await invokeCapgoApi<{ user_ids: string[], app_ids: string[], group_ids: string[] }>(
    `private/sso/providers/${orgId}/managed`,
    { method: 'GET' },
  )
  if (error || !data) {
    console.error('Failed to load SSO managed access:', error)
    return emptySsoManagedAccess()
  }
  return { userIds: new Set(data.user_ids), appIds: new Set(data.app_ids), groupIds: new Set(data.group_ids) }
}
