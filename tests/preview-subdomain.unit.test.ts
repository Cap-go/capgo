import { describe, expect, it } from 'vitest'
import { buildPreviewSubdomain, encodePreviewAppId, parsePreviewHostname } from '../shared/preview-subdomain.ts'

describe('preview subdomain encoding', () => {
  it.concurrent('round-trips app IDs with reserved hostname characters', () => {
    const appId = 'Com.Example_app-name'
    const versionId = 123456
    const subdomain = buildPreviewSubdomain(appId, versionId)

    expect(subdomain).not.toMatch(/[.A-Z]/)
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

  it.concurrent('returns null for malformed hostnames', () => {
    expect(parsePreviewHostname('invalid.domain.com')).toBeNull()
    expect(parsePreviewHostname('')).toBeNull()
  })

  it.concurrent('supports version zero in the new reversible format', () => {
    const appId = 'com.example'
    const versionId = 0
    const subdomain = buildPreviewSubdomain(appId, versionId)

    expect(parsePreviewHostname(`${subdomain}.preview.capgo.app`)).toEqual({ appId, versionId })
  })

  it.concurrent('does not mistake legacy double-hyphen app IDs for the new separator', () => {
    expect(parsePreviewHostname('com--example__app-42.preview.capgo.app')).toEqual({
      appId: 'com--example.app',
      versionId: 42,
    })
  })

  it.concurrent('keeps long lowercase preview labels within the DNS label limit', () => {
    const appId = 'com.organizationname.myapplicationproductionreleasex'
    const versionId = 12345678
    const subdomain = buildPreviewSubdomain(appId, versionId)

    expect(subdomain.length).toBeLessThanOrEqual(63)
    expect(parsePreviewHostname(`${subdomain}.preview.capgo.app`)).toEqual({ appId, versionId })
  })

  it.concurrent('escapes underscores instead of collapsing them into dots', () => {
    expect(encodePreviewAppId('com.example_app')).toContain('_')
  })

  it.concurrent('rejects preview labels longer than the DNS label limit', () => {
    expect(() => buildPreviewSubdomain('ABCDEFGHIJKLMNOPQRSTUVWXYZABCDE', 1)).toThrow(
      'Preview subdomain exceeds DNS label limit: "1--a-b-c-d-e-f-g-h-i-j-k-l-m-n-o-p-q-r-s-t-u-v-w-x-y-z-a-b-c-d-e" (64 characters)',
    )
  })

  it.concurrent('rejects invalid preview version ids before building labels', () => {
    expect(() => buildPreviewSubdomain('com.example', -1)).toThrow('Invalid preview version id: -1')
    expect(() => buildPreviewSubdomain('com.example', 1.5)).toThrow('Invalid preview version id: 1.5')
    expect(() => buildPreviewSubdomain('com.example', Number.MAX_SAFE_INTEGER + 1)).toThrow(
      `Invalid preview version id: ${Number.MAX_SAFE_INTEGER + 1}`,
    )
  })

  it.concurrent('rejects preview hostnames whose version id exceeds the safe integer range', () => {
    expect(parsePreviewHostname('9007199254740992-com-0example.preview.capgo.app')).toBeNull()
  })
})
