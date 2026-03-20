import { simpleError } from '../../utils/hono.ts'

export function normalizeWebsiteUrl(input?: string | null) {
  const trimmed = input?.trim()
  if (!trimmed)
    return null

  try {
    const hasExplicitScheme = /^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed)
    if (hasExplicitScheme && !/^https?:\/\//i.test(trimmed)) {
      throw new Error('invalid website protocol')
    }

    const normalized = new URL(hasExplicitScheme ? trimmed : `https://${trimmed}`)
    if (normalized.protocol !== 'http:' && normalized.protocol !== 'https:') {
      throw new Error('invalid website protocol')
    }

    return normalized.toString()
  }
  catch {
    throw simpleError('invalid_body', 'Invalid body', { error: 'website_must_be_a_valid_url' })
  }
}
