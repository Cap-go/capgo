import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getReleaseRangeBase, matchesComponent, resolveReleaseScope } from '../scripts/release-scope.ts'

describe('release scope matching', () => {
  it.concurrent('treats shared release infrastructure as affecting all components', () => {
    const files = [
      '.github/workflows/tests.yml',
      '.github/workflows/bump_version.yml',
      '.github/scripts/start-background-service.sh',
      'scripts/setup-bun.sh',
      'scripts/release-scope.ts',
      'scripts/sync-notifications-package-version.ts',
    ]

    expect(matchesComponent('capgo', files)).toBe(true)
    expect(matchesComponent('cli', files)).toBe(true)
    expect(matchesComponent('notifications', files)).toBe(true)
  })

  it.concurrent('treats capgo deploy workflow changes as capgo-only releases', () => {
    const files = ['.github/workflows/build_and_deploy.yml', 'scripts/deploy-scope.ts']

    expect(matchesComponent('capgo', files)).toBe(true)
    expect(matchesComponent('cli', files)).toBe(false)
  })

  it.concurrent('treats cli publish workflow changes as cli-only releases', () => {
    const files = ['.github/workflows/publish_cli.yml']

    expect(matchesComponent('capgo', files)).toBe(false)
    expect(matchesComponent('cli', files)).toBe(true)
    expect(matchesComponent('notifications', files)).toBe(false)
  })

  it.concurrent('treats notifications package changes as notifications-only releases', () => {
    const files = [
      'packages/capacitor-notifications/src/index.ts',
      '.github/workflows/publish_notifications.yml',
    ]

    expect(matchesComponent('capgo', files)).toBe(false)
    expect(matchesComponent('cli', files)).toBe(false)
    expect(matchesComponent('notifications', files)).toBe(true)
  })

  it.concurrent('publishes notifications as a public npm package', () => {
    const packageJson = JSON.parse(
      readFileSync('packages/capacitor-notifications/package.json', 'utf8'),
    ) as { publishConfig?: { access?: string } }
    const workflow = readFileSync('.github/workflows/publish_notifications.yml', 'utf8')

    expect(packageJson.publishConfig?.access).toBe('public')
    expect(workflow).toContain('--access public')
    expect(workflow).not.toContain('--access restricted')
  })

  it.concurrent('uses the released package in Discord release footers', () => {
    const workflow = readFileSync('.github/workflows/github-releases-to-discord.yml', 'utf8')
    const cliPackage = JSON.parse(readFileSync('cli/package.json', 'utf8')) as { name: string }
    const notificationsPackage = JSON.parse(
      readFileSync('packages/capacitor-notifications/package.json', 'utf8'),
    ) as { name: string }

    expect(workflow).toContain('id: release_metadata')
    expect(workflow).toContain(`cli-[0-9]*) footer_title="Release $(node -p 'require("./cli/package.json").name')"`)
    expect(workflow).toContain(
      `notifications-[0-9]*) footer_title="Release $(node -p 'require("./packages/capacitor-notifications/package.json").name')"`,
    )
    expect(workflow).not.toContain('cli-*) footer_title=')
    expect(workflow).toContain('footer_title: $' + '{{ steps.release_metadata.outputs.footer_title }}')
    expect(cliPackage.name).toBe('@capgo/cli')
    expect(notificationsPackage.name).toBe('@capgo/capacitor-notifications')
  })

  it.concurrent('keeps runtime code scoped to the matching component', () => {
    expect(matchesComponent('capgo', ['src/pages/index.vue'])).toBe(true)
    expect(matchesComponent('cli', ['src/pages/index.vue'])).toBe(false)
    expect(matchesComponent('notifications', ['src/pages/index.vue'])).toBe(false)
    expect(matchesComponent('capgo', ['cli/src/index.ts'])).toBe(false)
    expect(matchesComponent('cli', ['cli/src/index.ts'])).toBe(true)
    expect(matchesComponent('notifications', ['cli/src/index.ts'])).toBe(false)
  })

  it.concurrent('does not release on unrelated changes', () => {
    const files = ['README.md']

    expect(matchesComponent('capgo', files)).toBe(false)
    expect(matchesComponent('cli', files)).toBe(false)
    expect(matchesComponent('notifications', files)).toBe(false)
  })

  it.concurrent('uses the latest component tag instead of only the pushed range', () => {
    const run = (args: string[]) => {
      if (args[0] === 'describe') {
        expect(args).toEqual(['describe', '--tags', '--match', 'cli-[0-9]*', '--abbrev=0', 'HEAD'])
        return 'cli-7.95.15'
      }

      throw new Error(`Unexpected git call: ${args.join(' ')}`)
    }

    expect(getReleaseRangeBase('cli', 'previous-push-sha', 'HEAD', run)).toBe('cli-7.95.15')
  })

  it.concurrent('falls back to the pushed range when no component tag exists', () => {
    const run = (args: string[]) => {
      if (args[0] === 'describe') {
        throw Object.assign(new Error('git describe failed'), {
          stderr: 'fatal: No names found, cannot describe anything.',
        })
      }

      throw new Error(`Unexpected git call: ${args.join(' ')}`)
    }

    expect(getReleaseRangeBase('capgo', 'previous-push-sha', 'HEAD', run)).toBe('previous-push-sha')
  })

  it.concurrent('rethrows unexpected git describe failures', () => {
    const run = (args: string[]) => {
      if (args[0] === 'describe') {
        throw new Error('fatal: bad revision HEAD')
      }

      throw new Error(`Unexpected git call: ${args.join(' ')}`)
    }

    expect(() => getReleaseRangeBase('cli', 'previous-push-sha', 'HEAD', run)).toThrow('fatal: bad revision HEAD')
  })

  it.concurrent('keeps missed CLI changes releasable after a later Capgo-only push', () => {
    const run = (args: string[]) => {
      const key = args.join(' ')
      const responses: Record<string, string> = {
        'describe --tags --match cli-[0-9]* --abbrev=0 head-capgo-only': 'cli-7.95.15',
        'rev-list --reverse cli-7.95.15..head-capgo-only': 'cli-change\ncapgo-change',
        'show --format= --name-only cli-change': 'cli/src/posthog.ts',
        'show --format= --name-only capgo-change': 'src/pages/index.vue',
        'log -1 --format=%s cli-change': 'feat(cli): capture exceptions',
        'log -1 --format=%b cli-change': '',
      }

      if (key in responses) {
        return responses[key]
      }

      throw new Error(`Unexpected git call: ${key}`)
    }

    expect(resolveReleaseScope('cli', 'capgo-change-parent', 'head-capgo-only', run)).toEqual({
      shouldRelease: true,
      releaseAs: 'minor',
    })
  })
})
