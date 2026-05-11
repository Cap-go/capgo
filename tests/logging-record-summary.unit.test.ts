import { describe, expect, it } from 'vitest'
import { summarizePresenceForLog, summarizeRecordForLog } from '../supabase/functions/_backend/utils/logging.ts'

describe('summarizeRecordForLog', () => {
  it.concurrent('keeps field presence while redacting raw profile fields', () => {
    const summary = summarizeRecordForLog({
      app_metadata: { provider: 'github' },
      email: 'alice@example.com',
      id: 'user-123',
      image_url: 'users/user-123/avatar.png',
      raw_user_meta_data: { full_name: 'Alice Example' },
    }, {
      presenceFields: ['id', 'email', 'image_url', 'raw_user_meta_data'],
    })

    expect(summary).toEqual({
      fieldCount: 5,
      hasRecord: true,
      has_email: true,
      has_id: true,
      has_image_url: true,
      has_raw_user_meta_data: true,
    })
    expect(JSON.stringify(summary)).not.toContain('alice@example.com')
    expect(JSON.stringify(summary)).not.toContain('avatar.png')
    expect(JSON.stringify(summary)).not.toContain('Alice Example')
  })

  it.concurrent('handles missing records without leaking values', () => {
    expect(summarizeRecordForLog(undefined, {
      presenceFields: ['id', 'email'],
    })).toEqual({
      fieldCount: 0,
      hasRecord: false,
    })
  })

  it.concurrent('summarizes standalone identifiers without retaining raw values', () => {
    const summary = summarizePresenceForLog('user_id', 'user-123')

    expect(summary).toEqual({ has_user_id: true })
    expect(JSON.stringify(summary)).not.toContain('user-123')
  })
})
