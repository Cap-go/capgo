import { describe, expect, it } from 'vitest'
import { buildPreviewSubdomain, encodePreviewAppId, parsePreviewHostname } from '../shared/preview-subdomain.ts'

describe('preview subdomain encoding', () => {
  it.concurrent('round-trips app IDs with reserved hostname characters', () => {
    const appId = 'Com.Example_app-name'
    const versionId = 123456
    const subdomain = buildPreviewSubdomain(appId, versionId)

    expect(subdomain).not.toMatch(/[_.A-Z]/)
    expect(parsePreviewHostname(`${subdomain}.preview.capgo.app`)).toEqual({ appId, versionId })
  })

  it.concurrent('keeps dotted and double-underscore app IDs in separate preview namespaces', () => {
    const dottedAppId = 'com.pal0x.preview.cross.1774322988'
    const underscoredAppId = 'com.pal0x__preview.cross.1774322988'
    const dottedSubdomain = buildPreviewSubdomain(dottedAppId, 77014920)
    const underscoredSubdomain = buildPreviewSubdomain(underscoredAppId, 77015428)

    expect(dottedSubdomain).not.toBe(underscoredSubdomain)
    expect(parsePreviewHostname(`${dottedSubdomain}.preview.capgo.app`)).toEqual({
      appId: dottedAppId,
      versionId: 77014920,
    })
    expect(parsePreviewHostname(`${underscoredSubdomain}.preview.capgo.app`)).toEqual({
      appId: underscoredAppId,
      versionId: 77015428,
    })
  })

  it.concurrent('parses legacy preview hostnames for existing links', () => {
    expect(parsePreviewHostname('com__example__app-42.preview.capgo.app')).toEqual({
      appId: 'com.example.app',
      versionId: 42,
    })
  })

  it.concurrent('does not mistake legacy double-hyphen app IDs for the new separator', () => {
    expect(parsePreviewHostname('com--example__app-42.preview.capgo.app')).toEqual({
      appId: 'com--example.app',
      versionId: 42,
    })
  })

  it.concurrent('escapes underscores instead of collapsing them into dots', () => {
    expect(encodePreviewAppId('com.example_app')).toContain('-5f')
  })
})
