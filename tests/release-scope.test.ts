import { describe, expect, it } from 'vitest'
import { matchesComponent } from '../scripts/release-scope.ts'

describe('release scope matching', () => {
  it('treats shared release infrastructure as affecting both components', () => {
    const files = [
      '.github/workflows/tests.yml',
      '.github/workflows/bump_version.yml',
      '.github/scripts/start-background-service.sh',
      'scripts/setup-bun.sh',
      'scripts/release-scope.ts',
    ]

    expect(matchesComponent('capgo', files)).toBe(true)
    expect(matchesComponent('cli', files)).toBe(true)
  })

  it('treats capgo deploy workflow changes as capgo-only releases', () => {
    const files = ['.github/workflows/build_and_deploy.yml']

    expect(matchesComponent('capgo', files)).toBe(true)
    expect(matchesComponent('cli', files)).toBe(false)
  })

  it('treats cli publish workflow changes as cli-only releases', () => {
    const files = ['.github/workflows/publish_cli.yml']

    expect(matchesComponent('capgo', files)).toBe(false)
    expect(matchesComponent('cli', files)).toBe(true)
  })

  it('keeps runtime code scoped to the matching component', () => {
    expect(matchesComponent('capgo', ['src/pages/index.vue'])).toBe(true)
    expect(matchesComponent('cli', ['src/pages/index.vue'])).toBe(false)
    expect(matchesComponent('capgo', ['cli/src/index.ts'])).toBe(false)
    expect(matchesComponent('cli', ['cli/src/index.ts'])).toBe(true)
  })

  it('does not release on unrelated changes', () => {
    const files = ['README.md']

    expect(matchesComponent('capgo', files)).toBe(false)
    expect(matchesComponent('cli', files)).toBe(false)
  })
})
