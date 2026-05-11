type PasswordComplianceField = 'email' | 'password' | 'org_id' | 'captcha_token'

function getBodyObject(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return null
  return body as Partial<Record<PasswordComplianceField, unknown>> & Record<string, unknown>
}

function hasStringField(body: Record<string, unknown> | null, field: PasswordComplianceField) {
  return typeof body?.[field] === 'string'
}

export function getPasswordComplianceBodyLogMetadata(body: unknown) {
  const bodyObject = getBodyObject(body)

  return {
    bodyType: Array.isArray(body) ? 'array' : typeof body,
    fieldCount: bodyObject ? Object.keys(bodyObject).length : 0,
    hasEmail: hasStringField(bodyObject, 'email'),
    hasPassword: hasStringField(bodyObject, 'password'),
    hasOrgId: hasStringField(bodyObject, 'org_id'),
    hasCaptchaToken: hasStringField(bodyObject, 'captcha_token'),
  }
}

export function getPasswordComplianceSuccessLogMetadata(userId: unknown, orgId: unknown) {
  return {
    hasUserId: typeof userId === 'string' && userId.length > 0,
    hasOrgId: typeof orgId === 'string' && orgId.length > 0,
  }
}
