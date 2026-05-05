import { execFileSync } from 'node:child_process'

export type Component = 'capgo' | 'cli'
export type ReleaseAs = 'patch' | 'minor' | 'major'

const sharedMatchers = [
  /^\.github\/workflows\/bump_version\.yml$/,
  /^\.github\/workflows\/tests\.yml$/,
  /^\.github\/scripts\//,
  /^scripts\/release-scope\.ts$/,
  /^scripts\/setup-bun\.sh$/,
  /^scripts\/setup-bun\.ps1$/,
  /^package\.json$/,
  /^bun\.lock$/,
  /^\.npmrc$/,
  /^\.typos\.toml$/,
  /^bunfig\.toml$/,
  /^tsconfig\.json$/,
  /^vitest\.config\.ts$/,
  /^vitest\.config\.cloudflare\.ts$/,
  /^vitest\.config\.cloudflare-plugin\.ts$/,
]

export const componentMatchers: Record<Component, RegExp[]> = {
  capgo: [
    ...sharedMatchers,
    /^\.github\/workflows\/build_and_deploy\.yml$/,
    /^aliproxy\//,
    /^android\//,
    /^assets\//,
    /^cloudflare_workers\//,
    /^configs\.json$/,
    /^deno-env\.d\.ts$/,
    /^deno\.lock$/,
    /^formkit\.config\.ts$/,
    /^formkit\.theme\.ts$/,
    /^icons\//,
    /^index\.html$/,
    /^internal\//,
    /^ionic\.config\.json$/,
    /^ios\//,
    /^jean\.json$/,
    /^messages\//,
    /^public\//,
    /^read_replicate\//,
    /^scriptable\//,
    /^shared\//,
    /^sql\//,
    /^src\//,
    /^supabase\//,
    /^capacitor\.config\.ts$/,
    /^vite\.config\.mts$/,
    /^wrangler\.jsonc$/,
  ],
  cli: [
    ...sharedMatchers,
    /^\.github\/workflows\/publish_cli\.yml$/,
    /^cli\/src\//,
    /^cli\/skills\/[^/]+\/SKILL\.md$/,
    /^cli\/skills\/(?!.*\.(md|mdx)$)/,
    /^cli\/package\.json$/,
    /^cli\/build\.mjs$/,
    /^cli\/tsconfig\.json$/,
    /^cli\/\.npmrc$/,
  ],
}

function runGit(args: string[]): string {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function getCommitShas(before: string, after: string): string[] {
  const isZero = before === '' || /^0+$/.test(before)

  if (!isZero) {
    const commits = runGit(['rev-list', '--reverse', `${before}..${after}`])
    return commits ? commits.split('\n').filter(Boolean) : []
  }

  const parents = runGit(['rev-list', '--parents', '-n', '1', after]).split(' ')
  if (parents.length > 1) {
    const commits = runGit(['rev-list', '--reverse', `${after}^..${after}`])
    return commits ? commits.split('\n').filter(Boolean) : []
  }

  return [after]
}

function getChangedFiles(commit: string): string[] {
  const files = runGit(['show', '--format=', '--name-only', commit])
  return files ? files.split('\n').filter(Boolean) : []
}

function getCommitMessage(commit: string): { subject: string, body: string } {
  return {
    subject: runGit(['log', '-1', '--format=%s', commit]),
    body: runGit(['log', '-1', '--format=%b', commit]),
  }
}

export function matchesComponent(component: Component, files: string[]): boolean {
  return files.some(file => componentMatchers[component].some(pattern => pattern.test(file)))
}

export function getSeverity(subject: string, body: string): number {
  const conventionalMatch = subject.match(/^([a-z]+)(\([^)]+\))?(!)?:/)
  const hasBreakingChange = body.includes('BREAKING CHANGE:') || conventionalMatch?.[3] === '!'

  if (hasBreakingChange) {
    return 3
  }

  if (conventionalMatch?.[1] === 'feat') {
    return 2
  }

  return 1
}

export function toReleaseAs(severity: number): ReleaseAs {
  if (severity >= 3) {
    return 'major'
  }

  if (severity === 2) {
    return 'minor'
  }

  return 'patch'
}

export function resolveReleaseScope(component: Component, before: string, after: string) {
  const commits = getCommitShas(before, after)

  let shouldRelease = false
  let highestSeverity = 0

  for (const commit of commits) {
    const files = getChangedFiles(commit)
    if (!matchesComponent(component, files)) {
      continue
    }

    shouldRelease = true
    const message = getCommitMessage(commit)
    highestSeverity = Math.max(highestSeverity, getSeverity(message.subject, message.body))
  }

  return {
    shouldRelease,
    releaseAs: shouldRelease ? toReleaseAs(highestSeverity) : 'patch',
  }
}

if (import.meta.main) {
  const componentArg = process.argv[2]
  const before = process.argv[3] ?? ''
  const after = process.argv[4] ?? 'HEAD'

  if (componentArg !== 'capgo' && componentArg !== 'cli') {
    console.error('Usage: bun scripts/release-scope.ts <capgo|cli> [before] [after]')
    process.exit(1)
  }

  const scope = resolveReleaseScope(componentArg, before, after)

  console.log(`should_release=${scope.shouldRelease}`)
  console.log(`release_as=${scope.releaseAs}`)
}
