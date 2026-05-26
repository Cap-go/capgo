import { describe, expect, it } from 'vitest'
import {
  buildChannelPreviewDeepLink,
  buildChannelPreviewLatestOptions,
  parseChannelPreviewDeepLink,
} from '../src/services/previewLinks.ts'

describe('channel preview deep links', () => {
  it.concurrent('generates compact capgo channel preview links by default', () => {
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
    })
  })

  it.concurrent('requests updater preview mode for generated channel preview links', () => {
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
    })
    expect(buildChannelPreviewLatestOptions(previewLink)).toEqual({
      appId: 'com.example.other-user-app',
      channel: 'preview',
      preview: true,
    })
  })

  it.concurrent('parses scanned native preview links robustly', () => {
    expect(parseChannelPreviewDeepLink(' capgo://preview/channel?appId=app.capgo.capacitor.navigation&channel=production&channelId=36706 ')).toEqual({
      type: 'channel',
      appId: 'app.capgo.capacitor.navigation',
      channelId: 36706,
      channelName: 'production',
    })
    expect(parseChannelPreviewDeepLink('capgo:/preview/channel?appId=app.capgo.capacitor.navigation&channel=production&channelId=36706')).toEqual({
      type: 'channel',
      appId: 'app.capgo.capacitor.navigation',
      channelId: 36706,
      channelName: 'production',
    })
  })
})
