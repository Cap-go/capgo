import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE_URL, getSupabaseClient, headers, resetAndSeedAppData, resetAppData, TEST_EMAIL, USER_ID } from './test-utils.ts'

const id = randomUUID()
const APPNAME = `com.bundle.semver.${id}`
let testOrgId: string

beforeAll(async () => {
  await resetAndSeedAppData(APPNAME)

  // Create test organization
  const { data: orgData, error: orgError } = await getSupabaseClient().from('orgs').insert({
    id: randomUUID(),
    name: `Test Bundle Semver Org ${id}`,
    management_email: TEST_EMAIL,
    created_by: USER_ID,
  }).select().single()

  if (orgError)
    throw orgError
  testOrgId = orgData.id

  // Create test app
  await getSupabaseClient().from('apps').insert({
    id: randomUUID(),
    app_id: APPNAME,
    name: `Test Bundle Semver App`,
    checksum: 'a1b2c3d4e5f6789abcdef123456789abcdef123456789abcdef123456789abcd',
    icon_url: 'https://example.com/icon.png',
    owner_org: testOrgId,
  })
})

afterAll(async () => {
  // Clean up all versions created during tests
  await getSupabaseClient()
    .from('app_versions')
    .delete()
    .eq('app_id', APPNAME)

  await resetAppData(APPNAME)
  await getSupabaseClient().from('orgs').delete().eq('id', testOrgId)
})

describe('[POST] /bundle - Semver Validation', () => {
  // Clean up any existing versions before running tests
  beforeAll(async () => {
    await getSupabaseClient()
      .from('app_versions')
      .delete()
      .eq('app_id', APPNAME)
  })

  describe('valid semver versions (strict semver, no leading v)', () => {
    const validVersions = [
      '1.0.0',
      '2.1.0',
      '3.2.1',
      '0.0.0',
      '10.20.30',
      '1.0.0-0',
      '1.0.0-123',
      '1.0.0-1.2.3',
      '1.0.0-1a',
      '1.0.0-a1',
      '1.0.0-alpha',
      '1.0.0-alpha.1',
      '1.0.0-alpha-1',
      '1.0.0-alpha-.-beta',
      '1.0.0+456',
      '1.0.0+build',
      '1.0.0+new-build',
      '1.0.0+build.1',
      '1.0.0+build.1a',
      '1.0.0+build.a1',
      '1.0.0+build.alpha',
      '1.0.0+build.alpha.beta',
      '1.0.0-alpha+build',
      '1.0.0-beta.2+build.123',
      '10.2.2',
      '1.1.2-prerelease+meta',
      '1.1.2+meta',
      '1.1.2+meta-valid',
      '1.0.0-alpha',
      '1.0.0-beta',
      '1.0.0-alpha.beta',
      '1.0.0-alpha.beta.1',
      '1.0.0-alpha.1',
      '1.0.0-alpha0.valid',
      '1.0.0-alpha.0valid',
      '1.0.0-alpha-a.b-c-somethinglong+build.1-aef.1-its-okay',
      '1.0.0-rc.1+build.1',
      '2.0.0-rc.1+build.123',
      '1.2.3-beta',
      '10.2.2-beta',
      '1.2.3-DEV-SNAPSHOT',
      '1.2.3-SNAPSHOT-123',
      '2.0.0',
      '1.1.7',
      '2.0.0+build.1848',
      '2.0.1-alpha.1227',
      '1.0.0-alpha+beta',
      '1.2.3----RC-SNAPSHOT.12.9.1--.12+788',
      '1.2.3----R-S.12.9.1--.12+meta',
      '1.2.3----RC-SNAPSHOT.12.9.1--.12',
      '1.0.0+0.build.1-rc.10000aaa-kk-0.1',
      '1.0.0-0A.is.legal',
    ]

    validVersions.forEach((version) => {
      it(`should accept valid semver: ${version}`, async () => {
        const response = await fetch(`${BASE_URL}/bundle`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            app_id: APPNAME,
            checksum: 'a1b2c3d4e5f6789abcdef123456789abcdef123456789abcdef123456789abcd',
            version,
            external_url: 'https://example.com/test.zip',
          }),
        })

        expect(response.status).toBe(200)
        const data = await response.json() as { status: string, bundle: any }
        expect(data.status).toBe('success')
        expect(data.bundle.name).toBe(version)

        // Cleanup: delete the created version for the next test
        await getSupabaseClient()
          .from('app_versions')
          .delete()
          .eq('app_id', APPNAME)
          .eq('name', version)
      })
    })
  })

  describe('invalid semver versions', () => {
    const invalidVersions = [
      // Leading 'v' or 'V' (npm-style versions not allowed)
      { version: 'v1.2.3', reason: 'leading v' },
      { version: 'V1.2.3', reason: 'leading V' },
      { version: 'v1.0.0', reason: 'leading v' },
      { version: 'V2.0.0', reason: 'leading V' },

      // Missing parts
      { version: '1', reason: 'missing minor and patch' },
      { version: '1.2', reason: 'missing patch' },
      { version: '1.2.', reason: 'incomplete version' },
      { version: '1..3', reason: 'missing minor' },

      // Invalid characters
      { version: 'hello, world', reason: 'non-numeric' },
      { version: 'xyz', reason: 'non-numeric' },
      { version: '1.2.3.4', reason: 'too many parts' },
      { version: 'a.b.c', reason: 'non-numeric parts' },

      // Leading zeros (not allowed in semver)
      { version: '01.0.0', reason: 'leading zero in major' },
      { version: '1.02.0', reason: 'leading zero in minor' },
      { version: '1.0.03', reason: 'leading zero in patch' },

      // Empty or whitespace - will be caught by missing_version check first
      { version: ' ', reason: 'whitespace' },
      { version: '  1.0.0', reason: 'leading whitespace' },
      { version: '1.0.0  ', reason: 'trailing whitespace' },
      { version: ' 1.0.0 ', reason: 'surrounding whitespace' },

      // Invalid prerelease formats
      { version: '1.0.0-', reason: 'empty prerelease' },
      { version: '1.0.0-..', reason: 'invalid prerelease' },
      { version: '1.0.0-01', reason: 'leading zero in numeric prerelease' },

      // Invalid build metadata
      { version: '1.0.0+', reason: 'empty build metadata' },
      { version: '1.0.0+_build', reason: 'underscore in build metadata' },

      // Negative numbers
      { version: '-1.0.0', reason: 'negative major' },
      { version: '1.-1.0', reason: 'negative minor' },
      { version: '1.0.-1', reason: 'negative patch' },

      // Special characters
      { version: '1.0.0!', reason: 'special character' },
      { version: '1.0.0@build', reason: 'at sign instead of plus' },
      { version: '1.0.0#alpha', reason: 'hash instead of dash' },

      // Ranges (not allowed)
      { version: '>=1.0.0', reason: 'semver range' },
      { version: '^1.0.0', reason: 'semver range' },
      { version: '~1.0.0', reason: 'semver range' },
      { version: '*', reason: 'wildcard' },
      { version: '1.x', reason: 'wildcard' },
      { version: '1.*.0', reason: 'wildcard' },

      // npm-specific formats (not allowed)
      { version: 'latest', reason: 'npm tag' },
      { version: 'next', reason: 'npm tag' },

      // Other edge cases
      { version: '1.0.0 - 2.0.0', reason: 'range' },
      { version: '1.0.0 || 2.0.0', reason: 'logical OR' },
    ]

    invalidVersions.forEach(({ version, reason }) => {
      it(`should reject invalid semver: "${version}" (${reason})`, async () => {
        const response = await fetch(`${BASE_URL}/bundle`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            app_id: APPNAME,
            checksum: 'a1b2c3d4e5f6789abcdef123456789abcdef123456789abcdef123456789abcd',
            version,
            external_url: 'https://example.com/test.zip',
          }),
        })

        expect(response.status).toBe(400)
        const data = await response.json() as { error: string }
        expect(data.error).toBe('invalid_version_format')
      })
    })
  })

  describe('edge cases', () => {
    it('should reject versions with null character', async () => {
      const response = await fetch(`${BASE_URL}/bundle`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          app_id: APPNAME,
          checksum: 'a1b2c3d4e5f6789abcdef123456789abcdef123456789abcdef123456789abcd',
          version: '1.0.0\x00',
          external_url: 'https://example.com/test.zip',
        }),
      })

      expect(response.status).toBe(400)
      const data = await response.json() as { error: string }
      expect(data.error).toBe('invalid_version_format')
    })

    it('should reject versions with newline', async () => {
      const response = await fetch(`${BASE_URL}/bundle`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          app_id: APPNAME,
          checksum: 'a1b2c3d4e5f6789abcdef123456789abcdef123456789abcdef123456789abcd',
          version: '1.0.0\n',
          external_url: 'https://example.com/test.zip',
        }),
      })

      expect(response.status).toBe(400)
      const data = await response.json() as { error: string }
      expect(data.error).toBe('invalid_version_format')
    })

    it('should handle very long but valid prerelease identifier', async () => {
      const longPrerelease = `alpha.${'a'.repeat(100)}`
      const version = `1.0.0-${longPrerelease}`

      const response = await fetch(`${BASE_URL}/bundle`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          app_id: APPNAME,
          checksum: 'a1b2c3d4e5f6789abcdef123456789abcdef123456789abcdef123456789abcd',
          version,
          external_url: 'https://example.com/test.zip',
        }),
      })

      expect(response.status).toBe(200)
      const data = await response.json() as { status: string }
      expect(data.status).toBe('success')

      // Cleanup
      await getSupabaseClient()
        .from('app_versions')
        .delete()
        .eq('app_id', APPNAME)
        .eq('name', version)
    })
  })
})
