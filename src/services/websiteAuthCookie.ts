import { getLocalConfig } from '~/services/supabase'

const WEBSITE_PAID_USER_COOKIE_NAME = 'capgo_paid_user'
const LEGACY_WEBSITE_AUTH_COOKIE_NAME = 'capgo_logged_in'
const WEBSITE_PAID_USER_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

interface WebsiteAuthOrganization {
  paying?: boolean | null
  role?: string | null
}

function getWebsiteCookieDomain() {
  try {
    const { hostWeb } = getLocalConfig()
    const hostname = new URL(hostWeb).hostname.replace(/^www\./, '')
    if (!hostname || hostname === 'localhost' || /^[\d.]+$/.test(hostname))
      return null

    return `.${hostname}`
  }
  catch {
    return null
  }
}

function getCookieAttributes(maxAgeSeconds: number, domain?: string | null) {
  const attributes = [
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
    'SameSite=Lax',
  ]

  if (domain)
    attributes.push(`Domain=${domain}`)

  if (globalThis.location.protocol === 'https:')
    attributes.push('Secure')

  return attributes.join('; ')
}

function writeWebsiteCookie(name: string, value: string, maxAgeSeconds: number, domain?: string | null) {
  document.cookie = `${name}=${value}; ${getCookieAttributes(maxAgeSeconds, domain)}`
}

function clearWebsiteCookie(name: string, domain?: string | null) {
  writeWebsiteCookie(name, '', 0, domain)
  if (domain)
    writeWebsiteCookie(name, '', 0)
}

export function clearWebsitePaidUserCookie() {
  if (typeof document === 'undefined')
    return

  const domain = getWebsiteCookieDomain()
  clearWebsiteCookie(WEBSITE_PAID_USER_COOKIE_NAME, domain)
  clearWebsiteCookie(LEGACY_WEBSITE_AUTH_COOKIE_NAME, domain)
}

export function setWebsitePaidUserCookie(isPaidUser: boolean) {
  if (typeof document === 'undefined')
    return

  if (!isPaidUser) {
    clearWebsitePaidUserCookie()
    return
  }

  const domain = getWebsiteCookieDomain()
  writeWebsiteCookie(WEBSITE_PAID_USER_COOKIE_NAME, '1', WEBSITE_PAID_USER_COOKIE_MAX_AGE_SECONDS, domain)
  clearWebsiteCookie(LEGACY_WEBSITE_AUTH_COOKIE_NAME, domain)
}

export function syncWebsitePaidUserCookieFromOrganizations(organizations: WebsiteAuthOrganization[]) {
  const hasPaidOrganization = organizations.some((organization) => {
    return !organization.role?.includes('invite') && !!organization.paying
  })

  setWebsitePaidUserCookie(hasPaidOrganization)
}
