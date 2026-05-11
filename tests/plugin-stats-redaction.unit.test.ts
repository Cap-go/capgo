import { describe, expect, it } from 'vitest'
import { getVersionNotFoundResult } from '../supabase/functions/_backend/plugins/stats.ts'

describe('plugin stats redaction', () => {
  it('returns missing version errors without app or version identifiers', () => {
    const result = getVersionNotFoundResult()

    expect(result).toEqual({
      success: false,
      error: 'version_not_found',
      message: 'Version not found',
    })
    expect(result.moreInfo).toBeUndefined()
    expect(JSON.stringify(result)).not.toContain('com.secret.app')
    expect(JSON.stringify(result)).not.toContain('1.2.3')
    expect(JSON.stringify(result)).not.toContain('secret-file.js')
  })
})
