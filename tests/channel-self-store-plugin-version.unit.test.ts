import { describe, expect, it } from 'vitest'

import { shouldSyncChannelSelfOverrideForPluginVersion } from '../supabase/functions/_backend/utils/channelSelfStore.ts'

describe('channel_self override KV plugin version gate', () => {
  it.each([
    ['5.33.9', true],
    ['5.34.0', false],
    ['6.33.9', true],
    ['6.34.0', false],
    ['7.33.9', true],
    ['7.34.0', false],
    ['7.42.0', false],
    ['8.0.0', false],
    ['', false],
    [null, false],
    ['invalid', false],
  ])('returns %s for %s', (pluginVersion, expected) => {
    expect(shouldSyncChannelSelfOverrideForPluginVersion(pluginVersion)).toBe(expected)
  })
})
