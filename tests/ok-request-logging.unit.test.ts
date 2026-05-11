import { describe, expect, it } from 'vitest'
import { summarizeOkRequestBodyForLog } from '../supabase/functions/_backend/public/ok.ts'

describe('ok endpoint request logging', () => {
  it.concurrent('summarizes request bodies without retaining raw payload values', () => {
    const summary = summarizeOkRequestBodyForLog({
      nested: {
        token: 'secret-token',
      },
      password: 'super-secret',
      username: 'alice@example.com',
    })

    expect(summary).toEqual({
      bodyType: 'object',
      hasBody: true,
      keyCount: 3,
    })

    const serialized = JSON.stringify(summary)
    expect(serialized).not.toContain('secret-token')
    expect(serialized).not.toContain('super-secret')
    expect(serialized).not.toContain('alice@example.com')
    expect(serialized).not.toContain('password')
    expect(serialized).not.toContain('username')
  })

  it.concurrent('keeps array and empty body logs metadata-only', () => {
    expect(summarizeOkRequestBodyForLog(['secret-1', 'secret-2'])).toEqual({
      bodyType: 'array',
      hasBody: true,
      itemCount: 2,
    })

    expect(summarizeOkRequestBodyForLog(undefined)).toEqual({
      bodyType: 'undefined',
      hasBody: false,
    })
  })
})
