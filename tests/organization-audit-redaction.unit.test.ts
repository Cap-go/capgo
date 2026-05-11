import { describe, expect, it } from 'vitest'
import { getAuditLogs } from '../supabase/functions/_backend/public/organization/audit.ts'

async function getRejectedCause(action: () => Promise<unknown>) {
  try {
    await action()
  }
  catch (error) {
    return (error as Error & { cause?: any }).cause
  }
  throw new Error('Expected action to throw')
}

describe('organization audit error redaction', () => {
  it('redacts raw schema values from invalid audit query errors', async () => {
    const cause = await getRejectedCause(() => getAuditLogs({} as any, {
      limit: 'abc123secret',
      orgId: '046a36ac-e03c-4590-9257-bd6c9dba9ee8',
    }))

    expect(cause.error).toBe('invalid_body')
    expect(cause.moreInfo.error.issueCount).toBe(1)
    expect(cause.moreInfo.error.issues).toHaveLength(1)
    expect(cause.moreInfo.error.issues[0].code).toEqual(expect.any(String))
    expect(cause.moreInfo.error.issues[0].path).toEqual(['limit'])
    expect(JSON.stringify(cause)).not.toContain('abc123secret')
    expect(JSON.stringify(cause)).not.toContain('was')
  })
})
