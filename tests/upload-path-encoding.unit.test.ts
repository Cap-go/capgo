import { describe, expect, it } from 'vitest'

import { encodeR2KeyForUploadLocation } from '../supabase/functions/_backend/files/util.ts'

describe('upload path encoding', () => {
  it.concurrent('encodes returned upload locations so literal percent signs are valid URLs', () => {
    const encoded = encodeR2KeyForUploadLocation('orgs/org-id/apps/app-id/test-%zz 100%.zip')

    expect(encoded).toBe('orgs/org-id/apps/app-id/test-%25zz%20100%25.zip')
  })
})
