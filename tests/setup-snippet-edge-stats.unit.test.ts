import { describe, expect, it } from 'vitest'
import { logpushJobBody, logpushJobNeedsUpdate, parseEnvFile, resolveSetupEnv, STAT_HEADER, withStatHeaderField } from '../scripts/setup-snippet-edge-stats.ts'

describe('snippet-edge-stats:setup', () => {
  it('adds the stat header to the custom log fields without dropping existing ones', () => {
    expect(withStatHeaderField([])).toEqual([expect.objectContaining({ action: 'log_custom_field', expression: 'true', action_parameters: { response_fields: [{ name: STAT_HEADER }] } })])

    const existing = [{ id: 'r1', action: 'log_custom_field', expression: 'true', action_parameters: { request_fields: [{ name: 'user-agent' }], response_fields: [{ name: 'cf-cache-status' }] } }]
    expect(withStatHeaderField(existing)).toEqual([{ ...existing[0], action_parameters: { request_fields: [{ name: 'user-agent' }], response_fields: [{ name: 'cf-cache-status' }, { name: STAT_HEADER }] } }])

    const configured = withStatHeaderField(existing)
    expect(withStatHeaderField(configured)).toBe(configured)
  })

  it('pushes plugin calls with the response headers', () => {
    const job = logpushJobBody('r2://bucket/{DATE}')
    expect(job.dataset).toBe('http_requests')
    expect(job.output_options.field_names).toContain('ResponseHeaders')
    expect(JSON.parse(job.filter).where.or.map((condition: { value: string }) => condition.value)).toEqual(['/updates', '/stats', '/plugin/updates', '/plugin/stats'])
  })

  it('updates an existing Logpush job only when a setting differs', () => {
    const { destination_conf: _destination, ...current } = logpushJobBody('r2://bucket/{DATE}')
    expect(logpushJobNeedsUpdate({ id: 1, ...current })).toBe(false)
    expect(logpushJobNeedsUpdate({ id: 1, ...current, filter: null })).toBe(true)
    expect(logpushJobNeedsUpdate({ id: 1, ...current, output_options: { ...current.output_options, field_names: ['ResponseHeaders'] } })).toBe(true)
    expect(logpushJobNeedsUpdate({ id: 1, ...current, enabled: false })).toBe(true)
    expect(logpushJobNeedsUpdate({ id: 1, ...current, max_upload_records: 100_000 })).toBe(true)
  })

  it('reads unset values from the prod env file names', () => {
    const file = parseEnvFile('# comment\nCF_ACCOUNT_ANALYTICS_ID=acc\nexport CF_ANALYTICS_TOKEN="tok"\nS3_ENDPOINT=acc.r2.cloudflarestorage.com\nS3_ACCESS_KEY_ID=key # note\nS3_SECRET_ACCESS_KEY=\'secret\'\n')
    expect(resolveSetupEnv({}, file)).toEqual({ accountId: 'acc', apiToken: 'tok', r2AccessKeyId: 'key', r2SecretAccessKey: 'secret', zoneName: 'capgo.app' })
    expect(resolveSetupEnv({ CLOUDFLARE_ACCOUNT_ID: 'env', CLOUDFLARE_API_TOKEN: 'env-token' }, file)).toMatchObject({ accountId: 'env', apiToken: 'env-token', r2AccessKeyId: '' })
    expect(resolveSetupEnv({}, { ...file, S3_ENDPOINT: 'https://s3.amazonaws.com' })).toMatchObject({ r2AccessKeyId: '', r2SecretAccessKey: '' })
  })
})
