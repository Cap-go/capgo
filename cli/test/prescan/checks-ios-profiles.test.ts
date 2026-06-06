// test/prescan/checks-ios-profiles.test.ts
import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'bun:test'
import {
  certProfilePairing,
  parseProvisioningMap,
  profileBundleMatch,
  profileExpiry,
  profileTypeVsMode,
  targetsCovered,
} from '../../src/build/prescan/checks/ios-profiles'
import { makeCtx, makeP12, makeProfileXml, makeProfileXmlWithCert, makeProject } from './helpers'

const b64 = (s: string) => Buffer.from(s).toString('base64')

// Real serialized shape of CAPGO_IOS_PROVISIONING_MAP, produced by buildProvisioningMap()
// in src/build/credentials-command.ts: { [bundleId]: { profile: base64, name: string } }
function mapWith(xml: string, bundleId = 'com.demo.app'): string {
  return JSON.stringify({ [bundleId]: { profile: b64(xml), name: 'Test Profile' } })
}

function ctxWith(creds: Record<string, string>, extra: object = {}) {
  return makeCtx({ projectDir: '/tmp', platform: 'ios', credentials: creds, distributionMode: 'app_store', ...extra })
}

describe('parseProvisioningMap', () => {
  it('parses the { bundleId: { profile, name } } shape produced by buildProvisioningMap', () => {
    const xml = makeProfileXml()
    const entries = parseProvisioningMap(ctxWith({ CAPGO_IOS_PROVISIONING_MAP: mapWith(xml) }))
    expect(entries).toEqual([{ bundleId: 'com.demo.app', base64: b64(xml), name: 'Test Profile' }])
  })
  it('returns [] when the map is absent or malformed', () => {
    expect(parseProvisioningMap(ctxWith({}))).toEqual([])
    expect(parseProvisioningMap(ctxWith({ CAPGO_IOS_PROVISIONING_MAP: 'not json' }))).toEqual([])
  })
})

describe('ios/profile-expiry', () => {
  it('errors on expired profile', async () => {
    const xml = makeProfileXml({ expiration: new Date(Date.now() - 86_400_000) })
    const f = await profileExpiry.run(ctxWith({ CAPGO_IOS_PROVISIONING_MAP: mapWith(xml) }))
    expect(f[0]?.severity).toBe('error')
  })
  it('warns within 30 days', async () => {
    const xml = makeProfileXml({ expiration: new Date(Date.now() + 5 * 86_400_000) })
    expect((await profileExpiry.run(ctxWith({ CAPGO_IOS_PROVISIONING_MAP: mapWith(xml) })))[0]?.severity).toBe('warning')
  })
  it('passes a far-future profile', async () => {
    const xml = makeProfileXml({ expiration: new Date(Date.now() + 90 * 86_400_000) })
    expect(await profileExpiry.run(ctxWith({ CAPGO_IOS_PROVISIONING_MAP: mapWith(xml) }))).toEqual([])
  })
})

describe('ios/profile-bundle-match', () => {
  it('errors when the profile bundle id mismatches the bundle id it is assigned to', async () => {
    const xml = makeProfileXml({ bundleId: 'com.other.app' })
    const f = await profileBundleMatch.run(ctxWith({ CAPGO_IOS_PROVISIONING_MAP: mapWith(xml) }))
    expect(f[0]?.severity).toBe('error')
    expect(f[0]?.detail).toContain('com.other.app')
  })
  it('accepts wildcard profiles', async () => {
    const xml = makeProfileXml({ bundleId: '*' })
    expect(await profileBundleMatch.run(ctxWith({ CAPGO_IOS_PROVISIONING_MAP: mapWith(xml) }))).toEqual([])
  })
  it('accepts prefix wildcard profiles', async () => {
    const xml = makeProfileXml({ bundleId: 'com.demo.*' })
    expect(await profileBundleMatch.run(ctxWith({ CAPGO_IOS_PROVISIONING_MAP: mapWith(xml) }))).toEqual([])
  })
  it('accepts exact match', async () => {
    const xml = makeProfileXml({ bundleId: 'com.demo.app' })
    expect(await profileBundleMatch.run(ctxWith({ CAPGO_IOS_PROVISIONING_MAP: mapWith(xml) }))).toEqual([])
  })
})

describe('ios/profile-type-vs-mode', () => {
  it('errors when ad_hoc profile is used for app_store distribution', async () => {
    const xml = makeProfileXml({ type: 'ad_hoc' })
    const f = await profileTypeVsMode.run(ctxWith({ CAPGO_IOS_PROVISIONING_MAP: mapWith(xml) }))
    expect(f[0]?.severity).toBe('error')
  })
  it('passes matching app_store profile', async () => {
    const xml = makeProfileXml({ type: 'app_store' })
    expect(await profileTypeVsMode.run(ctxWith({ CAPGO_IOS_PROVISIONING_MAP: mapWith(xml) }))).toEqual([])
  })
})

describe('ios/cert-profile-pairing', () => {
  it('errors when the P12 cert is not in DeveloperCertificates', async () => {
    const p12 = makeP12()
    const other = makeP12()
    const xml = makeProfileXmlWithCert(other) // profile carries a DIFFERENT cert
    const f = await certProfilePairing.run(ctxWith({
      BUILD_CERTIFICATE_BASE64: p12.base64,
      P12_PASSWORD: p12.password,
      CAPGO_IOS_PROVISIONING_MAP: mapWith(xml),
    }))
    expect(f[0]?.severity).toBe('error')
    expect(f[0]?.title).toContain('provisioning profile')
  })
  it('passes when the profile contains the P12 cert', async () => {
    const p12 = makeP12()
    const xml = makeProfileXmlWithCert(p12)
    expect(await certProfilePairing.run(ctxWith({
      BUILD_CERTIFICATE_BASE64: p12.base64,
      P12_PASSWORD: p12.password,
      CAPGO_IOS_PROVISIONING_MAP: mapWith(xml),
    }))).toEqual([])
  })
})

// Fixture format mirrors test/test-pbxproj-parser.mjs (verified against findSignableTargets).
const TWO_TARGET_PBXPROJ = `// !$*UTF8*$!
{
  archiveVersion = 1;
  objectVersion = 56;
  objects = {
    13B07F861A680F5B00A75B9A /* App */ = {
      isa = PBXNativeTarget;
      buildConfigurationList = 13B07F931A680F5B00A75B9A;
      name = App;
      productName = App;
      productType = "com.apple.product-type.application";
    };
    AA11BB22CC33DD44 /* Widget */ = {
      isa = PBXNativeTarget;
      buildConfigurationList = AA11BB22CC33DD55;
      name = Widget;
      productName = Widget;
      productType = "com.apple.product-type.app-extension";
    };
    13B07F931A680F5B00A75B9A /* Build configuration list for App */ = {
      isa = XCConfigurationList;
      buildConfigurations = (
        13B07F941A680F5B00A75B9A,
      );
    };
    13B07F941A680F5B00A75B9A /* Release */ = {
      isa = XCBuildConfiguration;
      buildSettings = {
        PRODUCT_BUNDLE_IDENTIFIER = com.demo.app;
      };
      name = Release;
    };
    AA11BB22CC33DD55 /* Build configuration list for Widget */ = {
      isa = XCConfigurationList;
      buildConfigurations = (
        AA11BB22CC33DD66,
      );
    };
    AA11BB22CC33DD66 /* Release */ = {
      isa = XCBuildConfiguration;
      buildSettings = {
        PRODUCT_BUNDLE_IDENTIFIER = com.demo.app.widget;
      };
      name = Release;
    };
  };
  rootObject = 089C1665FE841187C02AAC07;
}`

describe('ios/targets-covered', () => {
  it('errors when a signable target has no profile in the map', async () => {
    const dir = makeProject({ 'ios/App/App.xcodeproj/project.pbxproj': TWO_TARGET_PBXPROJ })
    const xml = makeProfileXml()
    const ctx = makeCtx({ projectDir: dir, platform: 'ios', credentials: { CAPGO_IOS_PROVISIONING_MAP: mapWith(xml) } })
    const f = await targetsCovered.run(ctx)
    expect(f[0]?.severity).toBe('error')
    expect(f[0]?.title).toContain('1 signable target')
    expect(f[0]?.detail).toContain('Widget')
  })
  it('passes when every signable target bundle id is covered', async () => {
    const dir = makeProject({ 'ios/App/App.xcodeproj/project.pbxproj': TWO_TARGET_PBXPROJ })
    const map = JSON.stringify({
      'com.demo.app': { profile: b64(makeProfileXml()), name: 'App Profile' },
      'com.demo.app.widget': { profile: b64(makeProfileXml({ bundleId: 'com.demo.app.widget' })), name: 'Widget Profile' },
    })
    const ctx = makeCtx({ projectDir: dir, platform: 'ios', credentials: { CAPGO_IOS_PROVISIONING_MAP: map } })
    expect(await targetsCovered.run(ctx)).toEqual([])
  })
})
