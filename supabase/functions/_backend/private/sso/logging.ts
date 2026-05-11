interface SsoLogMetadataInput {
  authenticatedProviders?: unknown
  count?: unknown
  domain?: unknown
  email?: unknown
  enforceSso?: unknown
  error?: unknown
  externalProviderId?: unknown
  ip?: unknown
  orgId?: unknown
  provider?: unknown
  providerId?: unknown
  providers?: unknown
  status?: unknown
  userId?: unknown
}

const SAFE_LOG_TOKEN_PATTERN = /^[\w:-]{1,64}$/

function hasStringValue(value: unknown) {
  return typeof value === 'string' && value.length > 0
}

function getSafeLogToken(value: unknown) {
  return typeof value === 'string' && SAFE_LOG_TOKEN_PATTERN.test(value)
    ? value
    : undefined
}

function asProviderList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function isSsoProvider(value: unknown) {
  return typeof value === 'string' && (value === 'sso' || value.startsWith('sso:'))
}

function getProviderType(value: unknown) {
  if (isSsoProvider(value))
    return 'sso'

  return getSafeLogToken(value) ?? (hasStringValue(value) ? 'other' : undefined)
}

function getErrorLogMetadata(error: unknown) {
  if (!error)
    return { hasError: false }

  if (typeof error === 'object') {
    const issue = error as { code?: unknown, name?: unknown }
    return {
      hasError: true,
      errorCode: getSafeLogToken(issue.code),
      errorName: getSafeLogToken(issue.name),
    }
  }

  return { hasError: true }
}

export function getSsoLogMetadata(input: SsoLogMetadataInput = {}) {
  const providers = asProviderList(input.providers)
  const authenticatedProviders = asProviderList(input.authenticatedProviders)

  return {
    hasEmail: hasStringValue(input.email),
    hasDomain: hasStringValue(input.domain),
    hasUserId: hasStringValue(input.userId),
    hasOrgId: hasStringValue(input.orgId),
    hasProviderId: hasStringValue(input.providerId),
    hasExternalProviderId: hasStringValue(input.externalProviderId),
    hasIp: hasStringValue(input.ip),
    providerType: getProviderType(input.provider),
    providerCount: providers.length,
    ssoProviderCount: providers.filter(isSsoProvider).length,
    authenticatedProviderCount: authenticatedProviders.length,
    authenticatedSsoProviderCount: authenticatedProviders.filter(isSsoProvider).length,
    requestCount: typeof input.count === 'number' ? input.count : undefined,
    enforceSso: typeof input.enforceSso === 'boolean' ? input.enforceSso : undefined,
    status: getSafeLogToken(input.status),
    ...getErrorLogMetadata(input.error),
  }
}
