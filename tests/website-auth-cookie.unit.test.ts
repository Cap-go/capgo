import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearWebsitePaidUserCookie, syncWebsitePaidUserCookieFromOrganizations } from '../src/services/websiteAuthCookie.ts'

vi.mock('~/services/supabase', () => ({
  getLocalConfig: () => ({ hostWeb: 'https://www.capgo.app' }),
}))

describe('website paid user cookie', () => {
  let cookieWrites: string[]

  beforeEach(() => {
    cookieWrites = []
    vi.stubGlobal('document', {
      get cookie() {
        return ''
      },
      set cookie(value: string) {
        cookieWrites.push(value)
      },
    })
    vi.stubGlobal('location', {
      protocol: 'https:',
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sets a 30 day cookie for paid non-invite organizations', () => {
    syncWebsitePaidUserCookieFromOrganizations([
      { paying: false, role: 'owner' },
      { paying: true, role: 'read' },
    ])

    expect(cookieWrites).toContain('capgo_paid_user=1; Path=/; Max-Age=2592000; SameSite=Lax; Domain=.capgo.app; Secure')
  })

  it('clears the cookie when paid access is only from an invite', () => {
    syncWebsitePaidUserCookieFromOrganizations([
      { paying: true, role: 'invite_read' },
    ])

    expect(cookieWrites).toContain('capgo_paid_user=; Path=/; Max-Age=0; SameSite=Lax; Domain=.capgo.app; Secure')
    expect(cookieWrites).toContain('capgo_paid_user=; Path=/; Max-Age=0; SameSite=Lax; Secure')
  })

  it('also clears the previous logged-in cookie name', () => {
    clearWebsitePaidUserCookie()

    expect(cookieWrites).toContain('capgo_logged_in=; Path=/; Max-Age=0; SameSite=Lax; Domain=.capgo.app; Secure')
    expect(cookieWrites).toContain('capgo_logged_in=; Path=/; Max-Age=0; SameSite=Lax; Secure')
  })
})
