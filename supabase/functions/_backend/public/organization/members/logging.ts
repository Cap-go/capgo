interface OrganizationMemberInviteBody {
  orgId?: unknown
  email?: unknown
  invite_type?: unknown
}

interface OrganizationMemberDeleteBody {
  orgId?: unknown
  email?: unknown
}

interface OrganizationMemberLogEntry {
  image_url?: unknown
  is_tmp?: unknown
}

// Supabase/Postgres error identifiers are short symbolic tokens; drop anything else.
const SAFE_ERROR_FIELD_PATTERN = /^\w{1,32}$/

function hasStringValue(value: unknown) {
  return typeof value === 'string' && value.length > 0
}

function getSafeErrorField(value: unknown) {
  return typeof value === 'string' && SAFE_ERROR_FIELD_PATTERN.test(value)
    ? value
    : undefined
}

function getErrorLogMetadata(error: unknown) {
  if (!error)
    return { hasError: false }

  if (typeof error === 'object') {
    const issue = error as { code?: unknown, name?: unknown }
    return {
      hasError: true,
      errorCode: getSafeErrorField(issue.code),
      errorName: getSafeErrorField(issue.name),
    }
  }

  return { hasError: true }
}

export function getOrganizationInviteLogMetadata(body: OrganizationMemberInviteBody) {
  return {
    hasOrgId: hasStringValue(body.orgId),
    hasEmail: hasStringValue(body.email),
    hasInviteType: typeof body.invite_type === 'string',
  }
}

export function getOrganizationMemberDeleteLogMetadata(body: OrganizationMemberDeleteBody, userId?: unknown) {
  return {
    hasOrgId: hasStringValue(body.orgId),
    hasEmail: hasStringValue(body.email),
    hasUserId: hasStringValue(userId),
  }
}

export function getOrganizationMembersQueryLogMetadata(data: unknown, error: unknown) {
  return {
    hasData: Array.isArray(data) && data.length > 0,
    memberCount: Array.isArray(data) ? data.length : 0,
    ...getErrorLogMetadata(error),
  }
}

export function getOrganizationMembersLogMetadata(members: OrganizationMemberLogEntry[]) {
  return {
    memberCount: members.length,
    temporaryMemberCount: members.filter(member => member.is_tmp === true).length,
    hasSignedImages: members.some(member => hasStringValue(member.image_url)),
  }
}
