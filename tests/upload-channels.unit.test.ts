import { describe, expect, it } from 'vitest'
import { formatUploadChannels, getChannelsToAssignByChecksum, parseUploadChannels } from '../cli/src/bundle/upload-channels'

describe('bundle upload channel parsing', () => {
  it.concurrent('parses comma-separated channels with trimming and dedupe', () => {
    expect(parseUploadChannels(' production, beta ,, production,staging ')).toEqual(['production', 'beta', 'staging'])
  })

  it.concurrent('returns an empty list for missing or blank channels', () => {
    expect(parseUploadChannels(undefined)).toEqual([])
    expect(parseUploadChannels(' , , ')).toEqual([])
  })

  it.concurrent('formats channel lists for logs', () => {
    expect(formatUploadChannels(['production', 'beta'])).toBe('production, beta')
  })

  it.concurrent('selects only channels that need the uploaded checksum', () => {
    const result = getChannelsToAssignByChecksum(
      ['production', 'beta', 'staging'],
      'new-checksum',
      new Map([
        ['production', 'old-checksum'],
        ['beta', 'new-checksum'],
        ['staging', null],
      ]),
    )

    expect(result).toEqual({
      channelsAlreadyCurrent: ['beta'],
      channelsToAssign: ['production', 'staging'],
    })
  })

  it.concurrent('returns no assignable channels when every target already has the checksum', () => {
    const result = getChannelsToAssignByChecksum(
      ['production', 'beta'],
      'new-checksum',
      new Map([
        ['production', 'new-checksum'],
        ['beta', 'new-checksum'],
      ]),
    )

    expect(result).toEqual({
      channelsAlreadyCurrent: ['production', 'beta'],
      channelsToAssign: [],
    })
  })
})
