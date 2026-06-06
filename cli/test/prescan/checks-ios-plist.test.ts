// test/prescan/checks-ios-plist.test.ts
import { describe, expect, it } from 'bun:test'
import { infoplistSanity } from '../../src/build/prescan/checks/ios-plist'
import { makeCtx, makeProject } from './helpers'

const plist = (body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>${body}</dict></plist>`

const BASE = `<key>CFBundleVersion</key><string>1</string><key>CFBundleShortVersionString</key><string>1.0.0</string>`

function ctxFor(plistBody: string) {
  const dir = makeProject({ 'ios/App/App/Info.plist': plist(plistBody) })
  return makeCtx({ projectDir: dir, platform: 'ios' })
}

describe('ios/infoplist-sanity', () => {
  it('errors on URL scheme with an underscore (#2431 class)', async () => {
    const f = await infoplistSanity.run(ctxFor(`${BASE}
<key>CFBundleURLTypes</key><array><dict>
  <key>CFBundleURLSchemes</key><array><string>my_app</string></array>
</dict></array>`))
    expect(f.some(x => x.severity === 'error' && x.title.includes('URL scheme'))).toBe(true)
  })
  it('warns when CFBundleVersion is missing', async () => {
    const f = await infoplistSanity.run(ctxFor(`<key>CFBundleShortVersionString</key><string>1.0.0</string>`))
    expect(f.some(x => x.severity === 'warning' && x.title.includes('CFBundleVersion'))).toBe(true)
  })
  it('warns on placeholder purpose strings', async () => {
    const f = await infoplistSanity.run(ctxFor(`${BASE}
<key>NSCameraUsageDescription</key><string></string>`))
    expect(f.some(x => x.severity === 'warning' && x.title.includes('NSCameraUsageDescription'))).toBe(true)
  })
  it('passes a sane plist', async () => {
    const f = await infoplistSanity.run(ctxFor(`${BASE}
<key>CFBundleURLTypes</key><array><dict>
  <key>CFBundleURLSchemes</key><array><string>myapp</string></array>
</dict></array>
<key>NSCameraUsageDescription</key><string>To take profile pictures</string>`))
    expect(f).toEqual([])
  })
  it('is silent when Info.plist is absent (non-standard layout)', async () => {
    const dir = makeProject({})
    expect(await infoplistSanity.run(makeCtx({ projectDir: dir, platform: 'ios' }))).toEqual([])
  })
})

describe('ios/infoplist-sanity — version keys are presence-only by design', () => {
  it('accepts $(MARKETING_VERSION)/$(CURRENT_PROJECT_VERSION) build-setting references', async () => {
    const f = await infoplistSanity.run(ctxFor(`<key>CFBundleVersion</key><string>$(CURRENT_PROJECT_VERSION)</string>
<key>CFBundleShortVersionString</key><string>$(MARKETING_VERSION)</string>`))
    expect(f).toEqual([])
  })
  it('warns when CFBundleShortVersionString is missing', async () => {
    const f = await infoplistSanity.run(ctxFor(`<key>CFBundleVersion</key><string>1</string>`))
    expect(f.some(x => x.severity === 'warning' && x.title.includes('CFBundleShortVersionString'))).toBe(true)
  })
})
