import { beforeAll, describe, expect, it } from 'vitest'
import { prepareCli, runCli } from './cliUtils'

const BASE_URL = new URL('http://localhost:54321/functions/v1')

describe('cLI Tests', () => {
  beforeAll(async () => {
    await prepareCli(BASE_URL)
  })

  it('should upload bundle successfully', async () => {
    const semver = `1.0.${Date.now()}`
    const output = await runCli(['bundle', 'upload', '-b', semver, '-c', 'production'], true)
    expect(output).toContain('Bundle Uploaded')
  })

  // Add more tests as needed
})
