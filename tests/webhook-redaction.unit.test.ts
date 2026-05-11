import { describe, expect, it } from 'vitest'
import { getWebhookUrlMetadata, getWebhookValidationErrorMetadata } from '../supabase/functions/_backend/public/webhooks/redaction.ts'
import { createSchema, makeIssue, safeParseSchema } from '../supabase/functions/_backend/utils/ark_validation.ts'

describe('webhook error redaction', () => {
  it('summarizes validation errors without schema messages or paths', () => {
    const schema = createSchema(() => ({
      issues: [
        makeIssue('Webhook URL https://secret.example.com/hook?token=hidden is invalid', ['url'], 'predicate'),
        makeIssue('Webhook name secret-name is invalid', ['name'], 'minLength'),
      ],
    }))
    const result = safeParseSchema(schema, {})

    if (result.success)
      throw new Error('Expected schema validation to fail')

    const serialized = JSON.stringify(getWebhookValidationErrorMetadata(result.error))

    expect(serialized).toBe(JSON.stringify({
      success: false,
      issueCount: 2,
      issues: [
        { code: 'predicate' },
        { code: 'minLength' },
      ],
    }))
    expect(serialized).not.toMatch(/secret\.example\.com|token=hidden|secret-name|url/)
  })

  it('summarizes webhook urls without exposing hosts, paths, or query secrets', () => {
    const metadata = getWebhookUrlMetadata('https://secret.example.com/webhook/path?token=hidden#fragment')

    expect(metadata).toEqual({
      hasUrl: true,
      protocol: 'https:',
      hostnameLength: 'secret.example.com'.length,
      pathLength: '/webhook/path'.length,
      hasSearch: true,
      hasHash: true,
    })
    expect(JSON.stringify(metadata)).not.toMatch(/secret\.example\.com|\/webhook\/path|token=hidden|fragment/)
  })

  it('summarizes unparsable webhook urls by length only', () => {
    const metadata = getWebhookUrlMetadata('not a url with secret token')

    expect(metadata).toEqual({
      hasUrl: true,
      parseable: false,
      length: 'not a url with secret token'.length,
    })
    expect(JSON.stringify(metadata)).not.toContain('secret token')
  })
})
