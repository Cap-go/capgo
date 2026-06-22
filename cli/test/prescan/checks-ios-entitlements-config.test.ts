// test/prescan/checks-ios-entitlements-config.test.ts
import type { ScanContext } from '../../src/build/prescan/types'
import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'bun:test'
import {
  allowNavigationWildcard,
  serverCleartext,
  serverUrlShipped,
} from '../../src/build/prescan/checks/ios-capacitor-config'
import {
  appGroupsFormat,
  apsEnvironmentVsMode,
  associatedDomainsFormat,
  entitlementsVsProfileCapability,
} from '../../src/build/prescan/checks/ios-entitlements-checks'
import { makeCtx, makeProject } from './helpers'

const b64 = (s: string) => Buffer.from(s).toString('base64')

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PLIST_HEAD = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">`

/** App.entitlements file body (inside <dict>...</dict>). */
function entitlementsFile(body: string): string {
  return `${PLIST_HEAD}\n<dict>${body}</dict>\n</plist>`
}

/** The exact grounding-project entitlements (aps-environment=development only). */
const GROUNDING_ENTITLEMENTS = entitlementsFile(`
  <key>aps-environment</key><string>development</string>`)

/**
 * Provisioning-profile XML the mobileprovision parser accepts, with an
 * Entitlements dict whose body the caller supplies. Mirrors the structure the
 * parser scans (<?xml..</plist>, application-identifier, Entitlements dict).
 */
function profileXml(entitlementsBody: string, bundleId = 'com.demo.app', teamId = 'TEAM123456'): string {
  return `${PLIST_HEAD}<dict>
<key>Name</key><string>Test Profile</string>
<key>UUID</key><string>11111111-2222-3333-4444-555555555555</string>
<key>TeamIdentifier</key><array><string>${teamId}</string></array>
<key>ExpirationDate</key><date>2099-01-01T00:00:00Z</date>
<key>Entitlements</key><dict>
  <key>application-identifier</key><string>${teamId}.${bundleId}</string>
  ${entitlementsBody}
</dict>
<key>DeveloperCertificates</key><array></array>
</dict></plist>`
}

/** Serialized CAPGO_IOS_PROVISIONING_MAP: { [bundleId]: { profile, name } }. */
function mapWith(xml: string, bundleId = 'com.demo.app'): string {
  return JSON.stringify({ [bundleId]: { profile: b64(xml), name: 'Test Profile' } })
}

/** ScanContext with an App.entitlements file written to a temp project dir. */
function ctxWithEntitlements(entitlementsBody: string, extra: Partial<ScanContext> = {}): ScanContext {
  const dir = makeProject({ 'ios/App/App/App.entitlements': entitlementsFile(entitlementsBody) })
  return makeCtx({ projectDir: dir, platform: 'ios', ...extra })
}

function ctxWithEntitlementsRaw(raw: string, extra: Partial<ScanContext> = {}): ScanContext {
  const dir = makeProject({ 'ios/App/App/App.entitlements': raw })
  return makeCtx({ projectDir: dir, platform: 'ios', ...extra })
}

// ASC triplet that makes willUploadToAppStore(ctx) true.
const UPLOAD_CREDS = { APPLE_KEY_ID: 'k', APPLE_ISSUER_ID: 'i', APPLE_KEY_CONTENT: 'c' }

// ===========================================================================
// §2.C  ios/entitlements-vs-profile-capability
// ===========================================================================

describe('ios/entitlements-vs-profile-capability', () => {
  it('does not apply without a provisioning map', () => {
    const ctx = ctxWithEntitlements('<key>aps-environment</key><string>development</string>')
    expect(entitlementsVsProfileCapability.appliesTo?.(ctx)).toBe(false)
  })

  it('does not apply when App.entitlements is absent', () => {
    const ctx = makeCtx({
      projectDir: makeProject({}),
      platform: 'ios',
      credentials: { CAPGO_IOS_PROVISIONING_MAP: mapWith(profileXml('')) },
    })
    expect(entitlementsVsProfileCapability.appliesTo?.(ctx)).toBe(false)
  })

  it('errors when the app declares a capability the profile does not grant', async () => {
    const ctx = ctxWithEntitlements(
      '<key>com.apple.developer.healthkit</key><true/>',
      { credentials: { CAPGO_IOS_PROVISIONING_MAP: mapWith(profileXml('')) } },
    )
    const f = await entitlementsVsProfileCapability.run(ctx)
    expect(f[0]?.severity).toBe('error')
    expect(f[0]?.detail ?? f[0]?.title).toContain('com.apple.developer.healthkit')
  })

  it('passes when the profile grants the same bool/string capability', async () => {
    const ctx = ctxWithEntitlements(
      '<key>com.apple.developer.healthkit</key><true/>',
      { credentials: { CAPGO_IOS_PROVISIONING_MAP: mapWith(profileXml('<key>com.apple.developer.healthkit</key><true/>')) } },
    )
    expect(await entitlementsVsProfileCapability.run(ctx)).toEqual([])
  })

  it('errors when an app app-group member is not covered by the profile list', async () => {
    const ctx = ctxWithEntitlements(
      '<key>com.apple.security.application-groups</key><array><string>group.com.demo.app</string><string>group.com.demo.extra</string></array>',
      { credentials: { CAPGO_IOS_PROVISIONING_MAP: mapWith(profileXml('<key>com.apple.security.application-groups</key><array><string>group.com.demo.app</string></array>')) } },
    )
    const f = await entitlementsVsProfileCapability.run(ctx)
    expect(f[0]?.severity).toBe('error')
    expect(f[0]?.detail ?? f[0]?.title).toContain('com.apple.security.application-groups')
  })

  it('passes when every app app-group member is in the profile list', async () => {
    const ctx = ctxWithEntitlements(
      '<key>com.apple.security.application-groups</key><array><string>group.com.demo.app</string></array>',
      { credentials: { CAPGO_IOS_PROVISIONING_MAP: mapWith(profileXml('<key>com.apple.security.application-groups</key><array><string>group.com.demo.app</string><string>group.com.demo.extra</string></array>')) } },
    )
    expect(await entitlementsVsProfileCapability.run(ctx)).toEqual([])
  })

  it('treats a profile wildcard member (*) as covering all app members', async () => {
    const ctx = ctxWithEntitlements(
      '<key>keychain-access-groups</key><array><string>TEAM123456.com.demo.app</string></array>',
      { credentials: { CAPGO_IOS_PROVISIONING_MAP: mapWith(profileXml('<key>keychain-access-groups</key><array><string>*</string></array>')) } },
    )
    expect(await entitlementsVsProfileCapability.run(ctx)).toEqual([])
  })

  it('treats a $(AppIdentifierPrefix)* profile member as covering all app members', async () => {
    const ctx = ctxWithEntitlements(
      '<key>keychain-access-groups</key><array><string>TEAM123456.com.demo.app</string></array>',
      { credentials: { CAPGO_IOS_PROVISIONING_MAP: mapWith(profileXml('<key>keychain-access-groups</key><array><string>$(AppIdentifierPrefix)*</string></array>')) } },
    )
    expect(await entitlementsVsProfileCapability.run(ctx)).toEqual([])
  })

  it('excludes auto-managed keys (aps-environment, get-task-allow, application-identifier, team-identifier)', async () => {
    // App declares only auto-managed keys; profile grants none of them -> no finding.
    const ctx = ctxWithEntitlements(
      `<key>aps-environment</key><string>development</string>
       <key>get-task-allow</key><true/>
       <key>application-identifier</key><string>TEAM123456.com.demo.app</string>
       <key>com.apple.developer.team-identifier</key><string>TEAM123456</string>`,
      { credentials: { CAPGO_IOS_PROVISIONING_MAP: mapWith(profileXml('')) } },
    )
    expect(await entitlementsVsProfileCapability.run(ctx)).toEqual([])
  })

  it('grounding entitlements (aps-environment only) scan clean against a matching profile', async () => {
    const ctx = ctxWithEntitlementsRaw(GROUNDING_ENTITLEMENTS, {
      credentials: { CAPGO_IOS_PROVISIONING_MAP: mapWith(profileXml('<key>aps-environment</key><string>development</string>')) },
    })
    expect(await entitlementsVsProfileCapability.run(ctx)).toEqual([])
  })
})

// ===========================================================================
// §2.C  ios/entitlements-aps-environment-vs-mode
// ===========================================================================

describe('ios/entitlements-aps-environment-vs-mode', () => {
  it('does not apply without aps-environment in App.entitlements', () => {
    const ctx = ctxWithEntitlements('<key>com.apple.developer.healthkit</key><true/>', { distributionMode: 'app_store' })
    expect(apsEnvironmentVsMode.appliesTo?.(ctx)).toBe(false)
  })

  it('does not apply without a distributionMode', () => {
    const ctx = ctxWithEntitlements('<key>aps-environment</key><string>development</string>')
    expect(apsEnvironmentVsMode.appliesTo?.(ctx)).toBe(false)
  })

  it('errors when aps-environment=development but mode is app_store', async () => {
    const ctx = ctxWithEntitlements('<key>aps-environment</key><string>development</string>', { distributionMode: 'app_store' })
    const f = await apsEnvironmentVsMode.run(ctx)
    expect(f[0]?.severity).toBe('error')
  })

  it('warns when aps-environment=production but mode is ad_hoc', async () => {
    const ctx = ctxWithEntitlements('<key>aps-environment</key><string>production</string>', { distributionMode: 'ad_hoc' })
    const f = await apsEnvironmentVsMode.run(ctx)
    expect(f[0]?.severity).toBe('warning')
  })

  it('passes when aps-environment=production and mode is app_store', async () => {
    const ctx = ctxWithEntitlements('<key>aps-environment</key><string>production</string>', { distributionMode: 'app_store' })
    expect(await apsEnvironmentVsMode.run(ctx)).toEqual([])
  })

  it('errors when the app aps-environment differs from the mapped profile aps-environment', async () => {
    const ctx = ctxWithEntitlements('<key>aps-environment</key><string>production</string>', {
      distributionMode: 'app_store',
      credentials: { CAPGO_IOS_PROVISIONING_MAP: mapWith(profileXml('<key>aps-environment</key><string>development</string>')) },
    })
    const f = await apsEnvironmentVsMode.run(ctx)
    expect(f.some(x => x.severity === 'error')).toBe(true)
  })

  it('grounding (development) errors only once mode=app_store is set, the intended catch', async () => {
    const noMode = ctxWithEntitlementsRaw(GROUNDING_ENTITLEMENTS)
    expect(apsEnvironmentVsMode.appliesTo?.(noMode)).toBe(false)
    const withMode = ctxWithEntitlementsRaw(GROUNDING_ENTITLEMENTS, { distributionMode: 'app_store' })
    expect((await apsEnvironmentVsMode.run(withMode))[0]?.severity).toBe('error')
  })
})

// ===========================================================================
// §2.C  ios/entitlements-associated-domains-format
// ===========================================================================

describe('ios/entitlements-associated-domains-format', () => {
  it('does not apply without associated-domains', () => {
    const ctx = ctxWithEntitlements('<key>aps-environment</key><string>development</string>')
    expect(associatedDomainsFormat.appliesTo?.(ctx)).toBe(false)
  })

  it('warns on an entry with a scheme/url (applinks:https://...)', async () => {
    const ctx = ctxWithEntitlements('<key>com.apple.developer.associated-domains</key><array><string>applinks:https://example.com</string></array>')
    const f = await associatedDomainsFormat.run(ctx)
    expect(f[0]?.severity).toBe('warning')
  })

  it('warns on an entry with a trailing path', async () => {
    const ctx = ctxWithEntitlements('<key>com.apple.developer.associated-domains</key><array><string>applinks:example.com/path</string></array>')
    expect((await associatedDomainsFormat.run(ctx))[0]?.severity).toBe('warning')
  })

  it('warns on an unknown service prefix', async () => {
    const ctx = ctxWithEntitlements('<key>com.apple.developer.associated-domains</key><array><string>bogus:example.com</string></array>')
    expect((await associatedDomainsFormat.run(ctx))[0]?.severity).toBe('warning')
  })

  it('passes valid applinks/webcredentials entries', async () => {
    const ctx = ctxWithEntitlements('<key>com.apple.developer.associated-domains</key><array><string>applinks:example.com</string><string>webcredentials:example.com</string><string>applinks:example.com?mode=developer</string></array>')
    expect(await associatedDomainsFormat.run(ctx)).toEqual([])
  })

  it('does not flag the service:* managed wildcard form', async () => {
    const ctx = ctxWithEntitlements('<key>com.apple.developer.associated-domains</key><array><string>applinks:*</string></array>')
    expect(await associatedDomainsFormat.run(ctx)).toEqual([])
  })
})

// ===========================================================================
// §2.C  ios/entitlements-app-groups-format
// ===========================================================================

describe('ios/entitlements-app-groups-format', () => {
  it('does not apply without application-groups', () => {
    const ctx = ctxWithEntitlements('<key>aps-environment</key><string>development</string>')
    expect(appGroupsFormat.appliesTo?.(ctx)).toBe(false)
  })

  it('warns when an entry does not start with group.', async () => {
    const ctx = ctxWithEntitlements('<key>com.apple.security.application-groups</key><array><string>com.demo.app</string></array>')
    expect((await appGroupsFormat.run(ctx))[0]?.severity).toBe('warning')
  })

  it('warns on uppercase / whitespace in the group id', async () => {
    const ctx = ctxWithEntitlements('<key>com.apple.security.application-groups</key><array><string>group.Com.Demo.App</string></array>')
    expect((await appGroupsFormat.run(ctx))[0]?.severity).toBe('warning')
  })

  it('passes a well-formed group identifier', async () => {
    const ctx = ctxWithEntitlements('<key>com.apple.security.application-groups</key><array><string>group.com.demo.app</string></array>')
    expect(await appGroupsFormat.run(ctx)).toEqual([])
  })
})

// ===========================================================================
// §2.D  ios/capacitor-server-url-shipped
// ===========================================================================

function ctxConfig(server: Record<string, unknown> | undefined, extra: Partial<ScanContext> = {}): ScanContext {
  const config = { appId: 'com.demo.app', appName: 'demo', webDir: 'dist', ...(server ? { server } : {}) } as ScanContext['config']
  return makeCtx({ projectDir: '/tmp', platform: 'ios', config, ...extra })
}

describe('ios/capacitor-server-url-shipped', () => {
  it('does not apply when server.url is absent or empty', () => {
    expect(serverUrlShipped.appliesTo?.(ctxConfig(undefined))).toBe(false)
    expect(serverUrlShipped.appliesTo?.(ctxConfig({ url: '' }))).toBe(false)
  })

  it('warns when a server.url is set without upload creds', async () => {
    const f = await serverUrlShipped.run(ctxConfig({ url: 'http://192.168.1.5:3000' }))
    expect(f[0]?.severity).toBe('warning')
  })

  it('errors when uploading to the App Store with a server.url set', async () => {
    const ctx = ctxConfig({ url: 'http://192.168.1.5:3000' }, { credentials: UPLOAD_CREDS })
    const f = await serverUrlShipped.run(ctx)
    expect(f[0]?.severity).toBe('error')
  })

  it('detail flags a dev target (RFC1918 / localhost / tunnel host)', async () => {
    const tunnel = await serverUrlShipped.run(ctxConfig({ url: 'https://abcd.ngrok.io' }))
    expect(tunnel[0]?.detail).toBeTruthy()
    const local = await serverUrlShipped.run(ctxConfig({ url: 'http://localhost:3000' }))
    expect(local[0]?.detail).toBeTruthy()
  })

  it('grounding config (no server) scans clean', async () => {
    expect(await serverUrlShipped.run(ctxConfig(undefined))).toEqual([])
  })
})

// ===========================================================================
// §2.D  ios/capacitor-server-cleartext
// ===========================================================================

describe('ios/capacitor-server-cleartext', () => {
  it('does not apply when cleartext is not true', () => {
    expect(serverCleartext.appliesTo?.(ctxConfig({ cleartext: false }))).toBe(false)
    expect(serverCleartext.appliesTo?.(ctxConfig(undefined))).toBe(false)
  })

  it('warns when cleartext is true', async () => {
    expect((await serverCleartext.run(ctxConfig({ cleartext: true })))[0]?.severity).toBe('warning')
  })

  it('escalates to error when a http:// server.url is also present', async () => {
    expect((await serverCleartext.run(ctxConfig({ cleartext: true, url: 'http://example.com' })))[0]?.severity).toBe('error')
  })
})

// ===========================================================================
// §2.D  ios/capacitor-allow-navigation-wildcard
// ===========================================================================

describe('ios/capacitor-allow-navigation-wildcard', () => {
  it('does not apply when allowNavigation is not an array', () => {
    expect(allowNavigationWildcard.appliesTo?.(ctxConfig(undefined))).toBe(false)
    expect(allowNavigationWildcard.appliesTo?.(ctxConfig({ allowNavigation: 'nope' }))).toBe(false)
  })

  it('does not apply when there are no wildcard-only entries', () => {
    expect(allowNavigationWildcard.appliesTo?.(ctxConfig({ allowNavigation: ['*.example.com', 'api.example.com'] }))).toBe(false)
  })

  it('warns on a blanket * entry', async () => {
    const f = await allowNavigationWildcard.run(ctxConfig({ allowNavigation: ['*'] }))
    expect(f[0]?.severity).toBe('warning')
  })

  it('warns on a public-suffix wildcard (*.com)', async () => {
    const f = await allowNavigationWildcard.run(ctxConfig({ allowNavigation: ['*.com'] }))
    expect(f[0]?.severity).toBe('warning')
    expect(f[0]?.detail ?? f[0]?.title).toContain('*.com')
  })

  it('does not flag a specific subdomain wildcard (*.example.com)', async () => {
    expect(await allowNavigationWildcard.run(ctxConfig({ allowNavigation: ['*.example.com'] }))).toEqual([])
  })
})
