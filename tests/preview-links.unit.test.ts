import { describe, expect, it } from 'vitest'
import {
  buildBundlePreviewDeepLink,
  buildChannelPreviewDeepLink,
  buildChannelPreviewLatestOptions,
  parseChannelPreviewDeepLink,
  parsePreviewDeepLink,
} from '../src/services/previewLinks.ts'

describe('channel preview deep links', () => {
  it.concurrent('generates payload-backed capgo channel preview links', () => {
    const previewUrl = buildChannelPreviewDeepLink({
      appId: 'com.example.other-user-app',
      channelId: 42,
      channelName: 'preview',
      payloadUrl: 'https://c42-com_u2eexample.preview.capgo.app/.capgo/preview.json',
    })

    expect(previewUrl).toBe('capgo://preview/channel?appId=com.example.other-user-app&channel=preview&channelId=42&url=https%3A%2F%2Fc42-com_u2eexample.preview.capgo.app%2F.capgo%2Fpreview.json')
    expect(parseChannelPreviewDeepLink(previewUrl)).toEqual({
      type: 'channel',
      appId: 'com.example.other-user-app',
      channelId: 42,
      channelName: 'preview',
      payloadUrl: 'https://c42-com_u2eexample.preview.capgo.app/.capgo/preview.json',
    })
  })

  it.concurrent('keeps legacy channel links usable as updater payload fallback', () => {
    const previewUrl = buildChannelPreviewDeepLink({
      appId: 'com.example.other-user-app',
      channelId: 42,
      channelName: 'preview',
      origin: 'https://web.capgo.app',
    })

    const previewLink = parseChannelPreviewDeepLink(previewUrl)
    if (!previewLink)
      throw new Error('Expected generated preview link to parse')

    expect(previewLink).toEqual({
      type: 'channel',
      appId: 'com.example.other-user-app',
      channelId: 42,
      channelName: 'preview',
      payloadUrl: undefined,
    })
    expect(buildChannelPreviewLatestOptions(previewLink)).toEqual({
      appId: 'com.example.other-user-app',
      channel: 'preview',
      preview: true,
    })
  })

  it.concurrent('only parses web preview routes from trusted Capgo or local hosts', () => {
    expect(parseChannelPreviewDeepLink('https://web.capgo.app/preview/channel?appId=com.example.other-user-app&channel=preview&channelId=42')).toEqual({
      type: 'channel',
      appId: 'com.example.other-user-app',
      channelId: 42,
      channelName: 'preview',
      payloadUrl: undefined,
    })
    expect(parseChannelPreviewDeepLink('http://localhost:5173/preview/channel?appId=com.example.other-user-app&channel=preview&channelId=42')).toEqual({
      type: 'channel',
      appId: 'com.example.other-user-app',
      channelId: 42,
      channelName: 'preview',
      payloadUrl: undefined,
    })
    expect(parseChannelPreviewDeepLink('https://evil.example/preview/channel?appId=com.example.other-user-app&channel=preview&channelId=42')).toBeNull()
    expect(parseChannelPreviewDeepLink('http://web.capgo.app/preview/channel?appId=com.example.other-user-app&channel=preview&channelId=42')).toBeNull()
  })

  it.concurrent('generates compact channel preview deep links for QR codes', () => {
    const previewUrl = buildChannelPreviewDeepLink({
      appId: 'com.example.other-user-app',
      channelId: 42,
      channelName: 'preview',
    })

    expect(previewUrl).toBe('capgo://preview/channel?appId=com.example.other-user-app&channel=preview&channelId=42')
    expect(parseChannelPreviewDeepLink(previewUrl)).toEqual({
      type: 'channel',
      appId: 'com.example.other-user-app',
      channelId: 42,
      channelName: 'preview',
      payloadUrl: undefined,
    })
  })

  it.concurrent('parses scanned native preview links robustly', () => {
    expect(parseChannelPreviewDeepLink(' capgo://preview/channel?appId=app.capgo.capacitor.navigation&channel=production&channelId=36706 ')).toEqual({
      type: 'channel',
      appId: 'app.capgo.capacitor.navigation',
      channelId: 36706,
      channelName: 'production',
      payloadUrl: undefined,
    })
    expect(parseChannelPreviewDeepLink('capgo:/preview/channel?appId=app.capgo.capacitor.navigation&channel=production&channelId=36706')).toEqual({
      type: 'channel',
      appId: 'app.capgo.capacitor.navigation',
      channelId: 36706,
      channelName: 'production',
      payloadUrl: undefined,
    })
  })

  it.concurrent('generates bundle preview deep links with a payload URL', () => {
    const previewUrl = buildBundlePreviewDeepLink({
      appId: 'com.example.other-user-app',
      payloadUrl: 'https://42-com_u2eexample.preview.capgo.app/.capgo/preview.json',
      versionId: 42,
    })

    expect(parsePreviewDeepLink(previewUrl)).toEqual({
      type: 'bundle',
      appId: 'com.example.other-user-app',
      payloadUrl: 'https://42-com_u2eexample.preview.capgo.app/.capgo/preview.json',
      versionId: 42,
    })
  })

  it.concurrent('generates compact bundle preview deep links for QR codes', () => {
    const previewUrl = buildBundlePreviewDeepLink({
      appId: 'com.example.other-user-app',
      versionId: 42,
    })

    expect(previewUrl).toBe('capgo://preview/bundle?appId=com.example.other-user-app&versionId=42')
    expect(parsePreviewDeepLink(previewUrl)).toEqual({
      type: 'bundle',
      appId: 'com.example.other-user-app',
      payloadUrl: undefined,
      versionId: 42,
    })
  })

  it.concurrent('rejects malformed bundle preview identifiers', () => {
    expect(parsePreviewDeepLink('capgo://preview/bundle?appId=com.example.other-user-app&versionId=1.5')).toBeNull()
    expect(parsePreviewDeepLink('capgo://preview/bundle?appId=com.example.other-user-app&versionId=-1')).toBeNull()
    expect(parsePreviewDeepLink(`capgo://preview/bundle?appId=com.example.other-user-app&versionId=${Number.MAX_SAFE_INTEGER + 1}`)).toBeNull()
  })
})
