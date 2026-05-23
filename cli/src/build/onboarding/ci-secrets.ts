import type { BuildCredentials } from '../../schemas/build.js'
import { Buffer } from 'node:buffer'
import { spawn, spawnSync } from 'node:child_process'

export type CiSecretProvider = 'github' | 'gitlab'

export interface CiSecretEntry {
  key: string
  value: string
  masked: boolean
}

export interface CiSecretTarget {
  provider: CiSecretProvider
  label: string
  cli: 'gh' | 'glab'
}

export interface CiSecretDiscovery {
  targets: CiSecretTarget[]
  setup: CiSecretSetupAdvice[]
  notes: string[]
}

export interface CiSecretSetupAdvice {
  target: CiSecretTarget
  reason: 'not-installed' | 'not-authenticated'
  message: string
  commands: string[]
}

interface CommandRunOptions {
  input?: string
}

export interface CommandRunResult {
  status: number | null
  stdout: string
  stderr: string
  error?: Error
}

export type CommandRunner = (
  command: string,
  args: string[],
  options?: CommandRunOptions,
) => CommandRunResult

/**
 * Async runner. Used by the wizard so spawned `gh` / `glab` calls don't block
 * the Node event loop — without this, `ink-spinner`'s animation freezes for
 * the entire duration of every shell-out, which feels like the wizard has hung.
 *
 * Tests can pass either a sync (CommandRunner) or async runner — every helper
 * that calls runner.* does so via `await` so a sync runner returning a plain
 * result still works (Promise.resolve coerces it).
 */
export type AsyncCommandRunner = (
  command: string,
  args: string[],
  options?: CommandRunOptions,
) => CommandRunResult | Promise<CommandRunResult>

const GITLAB_PAGE_SIZE = 100
const GITLAB_MAX_PAGES = 20

const MASKED_KEYS = new Set([
  'P12_PASSWORD',
  'APPLE_KEY_CONTENT',
  'BUILD_CERTIFICATE_BASE64',
  'BUILD_PROVISION_PROFILE_BASE64',
  'CAPGO_IOS_PROVISIONING_MAP',
  'CAPGO_IOS_PROVISIONING_MAP_BASE64',
  'KEYSTORE_KEY_PASSWORD',
  'KEYSTORE_STORE_PASSWORD',
  'ANDROID_KEYSTORE_FILE',
  'PLAY_CONFIG_JSON',
  // CAPGO_TOKEN is the Capgo API key the workflow uses to authenticate. It's
  // sensitive and must never be unmasked in GitLab variables.
  'CAPGO_TOKEN',
])

const GITHUB_TARGET: CiSecretTarget = {
  provider: 'github',
  label: 'GitHub Actions repository secrets',
  cli: 'gh',
}

const GITLAB_TARGET: CiSecretTarget = {
  provider: 'gitlab',
  label: 'GitLab CI/CD variables',
  cli: 'glab',
}

export function runCommand(command: string, args: string[], options: CommandRunOptions = {}): CommandRunResult {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    input: options.input,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error,
  }
}

/**
 * Non-blocking shell-out. Mirrors `runCommand`'s shape but uses `spawn` so
 * the Node event loop is free to tick spinners and process input while gh /
 * glab work. Default for any wizard-side helper that needs to render UI
 * during the call.
 */
export function runCommandAsync(command: string, args: string[], options: CommandRunOptions = {}): Promise<CommandRunResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []

    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk))

    child.on('error', (error) => {
      resolve({
        status: null,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        error,
      })
    })

    child.on('close', (code) => {
      resolve({
        status: code,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
      })
    })

    if (options.input)
      child.stdin.write(options.input)
    child.stdin.end()
  })
}

export function createCiSecretEntries(
  credentials: Partial<BuildCredentials>,
  apiKey?: string,
): CiSecretEntry[] {
  const entries: CiSecretEntry[] = []
  let hasProvisioningMapBase64 = false
  const provisioningMapRaw = credentials.CAPGO_IOS_PROVISIONING_MAP

  for (const [key, value] of Object.entries(credentials)) {
    if (typeof value !== 'string' || value.length === 0)
      continue
    if (key === 'CAPGO_IOS_PROVISIONING_MAP')
      continue
    if (key === 'CAPGO_IOS_PROVISIONING_MAP_BASE64')
      hasProvisioningMapBase64 = true
    entries.push({
      key,
      value,
      masked: MASKED_KEYS.has(key),
    })
  }

  if (provisioningMapRaw && !hasProvisioningMapBase64) {
    entries.push({
      key: 'CAPGO_IOS_PROVISIONING_MAP_BASE64',
      value: Buffer.from(provisioningMapRaw, 'utf8').toString('base64'),
      masked: true,
    })
  }

  // CAPGO_TOKEN: the Capgo API key. Pushed alongside build credentials so the
  // generated GitHub Actions workflow (and any user-authored workflow that
  // follows the same convention) can authenticate without the user having to
  // manually `gh secret set CAPGO_TOKEN` after the wizard finishes.
  const trimmedApiKey = apiKey?.trim()
  if (trimmedApiKey) {
    entries.push({
      key: 'CAPGO_TOKEN',
      value: trimmedApiKey,
      masked: true,
    })
  }

  return entries
}

export function detectCiSecretTargets(runner: CommandRunner = runCommand): CiSecretDiscovery {
  const providers = detectGitRemoteProviders(runner)
  const targets: CiSecretTarget[] = []
  const setup: CiSecretSetupAdvice[] = []
  const notes: string[] = []

  if (providers.size === 0) {
    notes.push('No GitHub or GitLab git remote detected.')
    return { targets, setup, notes }
  }

  if (providers.has('github')) {
    const gh = getCliStatus('gh', runner)
    if (gh.ready)
      targets.push(GITHUB_TARGET)
    else
      setup.push(createSetupAdvice(GITHUB_TARGET, gh))
  }

  if (providers.has('gitlab')) {
    const glab = getCliStatus('glab', runner)
    if (glab.ready)
      targets.push(GITLAB_TARGET)
    else
      setup.push(createSetupAdvice(GITLAB_TARGET, glab))
  }

  return { targets, setup, notes }
}

export function getCiSecretTargetLabel(target: CiSecretTarget | null | undefined): string {
  return target?.label || 'your git hosting platform'
}

/**
 * Resolve the concrete `owner/repo` (GitHub) or `group/project` (GitLab) the
 * `gh` / `glab` CLI will target from the current working directory.
 *
 * Returns null when the CLI can't determine the repo (e.g. cwd is not a git
 * repo, multiple remotes with no `gh-resolved` config, auth scopes missing).
 *
 * The wizard MUST show this string to the user and require explicit
 * confirmation before any `gh secret set` / `glab variable set` runs — those
 * commands silently overwrite without backup, so the user has to know which
 * repo they're about to mutate.
 */
export function getCiSecretRepoLabel(
  target: CiSecretTarget,
  runner: CommandRunner = runCommand,
): string | null {
  if (target.provider === 'github') {
    // gh respects `gh-resolved` git config and handles multi-remote correctly,
    // so trust gh's view of the repo rather than parsing `git remote -v`.
    const result = runner('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'])
    if (result.status === 0) {
      const trimmed = result.stdout.trim()
      return trimmed.length > 0 ? trimmed : null
    }
    return null
  }
  // GitLab
  const result = runner('glab', ['repo', 'view', '-F', 'json'])
  if (result.status === 0) {
    try {
      const parsed = JSON.parse(result.stdout) as { path_with_namespace?: string, name?: string }
      return parsed.path_with_namespace ?? parsed.name ?? null
    }
    catch {
      return null
    }
  }
  return null
}

/**
 * Non-blocking variant of `getCiSecretRepoLabel`. Identical logic, but
 * `await`s the runner so the event loop can tick during the gh/glab call —
 * lets Ink spinners actually animate during the resolution.
 */
export async function getCiSecretRepoLabelAsync(
  target: CiSecretTarget,
  runner: AsyncCommandRunner = runCommandAsync,
): Promise<string | null> {
  if (target.provider === 'github') {
    const result = await runner('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'])
    if (result.status === 0) {
      const trimmed = result.stdout.trim()
      return trimmed.length > 0 ? trimmed : null
    }
    return null
  }
  const result = await runner('glab', ['repo', 'view', '-F', 'json'])
  if (result.status === 0) {
    try {
      const parsed = JSON.parse(result.stdout) as { path_with_namespace?: string, name?: string }
      return parsed.path_with_namespace ?? parsed.name ?? null
    }
    catch {
      return null
    }
  }
  return null
}

export function listExistingCiSecretKeys(
  target: CiSecretTarget,
  keys: string[],
  runner: CommandRunner = runCommand,
): string[] {
  const remoteKeys = target.provider === 'github'
    ? listGithubSecretKeys(runner)
    : listGitlabVariableKeys(runner)
  const remoteKeySet = new Set(remoteKeys)
  return keys.filter(key => remoteKeySet.has(key))
}

/** Non-blocking variant of `listExistingCiSecretKeys`. */
export async function listExistingCiSecretKeysAsync(
  target: CiSecretTarget,
  keys: string[],
  runner: AsyncCommandRunner = runCommandAsync,
): Promise<string[]> {
  const remoteKeys = target.provider === 'github'
    ? await listGithubSecretKeysAsync(runner)
    : await listGitlabVariableKeysAsync(runner)
  const remoteKeySet = new Set(remoteKeys)
  return keys.filter(key => remoteKeySet.has(key))
}

export function uploadCiSecrets(
  target: CiSecretTarget,
  entries: CiSecretEntry[],
  existingKeys: string[] = [],
  runner: CommandRunner = runCommand,
): void {
  const existing = new Set(existingKeys)
  for (const entry of entries) {
    if (target.provider === 'github') {
      runOrThrow(target.cli, ['secret', 'set', entry.key], runner, entry.value)
      continue
    }

    const action = existing.has(entry.key) ? 'update' : 'set'
    const args = ['variable', action, entry.key, '--raw']
    if (entry.masked)
      args.push('--masked')
    runOrThrow(target.cli, args, runner, entry.value)
  }
}

/**
 * Non-blocking variant of `uploadCiSecrets`. Calls `onProgress(current, total,
 * keyName)` before every `gh secret set` / `glab variable set` so the wizard
 * can render "Pushing N of M: <KEY>…" instead of a frozen spinner.
 *
 * Pushes are still sequential — gh/glab don't have a bulk-set API, and
 * parallelising would risk rate limits + makes failure semantics ambiguous.
 */
export async function uploadCiSecretsAsync(
  target: CiSecretTarget,
  entries: CiSecretEntry[],
  existingKeys: string[] = [],
  runner: AsyncCommandRunner = runCommandAsync,
  onProgress?: (current: number, total: number, keyName: string) => void,
): Promise<void> {
  const existing = new Set(existingKeys)
  const total = entries.length
  let current = 0
  for (const entry of entries) {
    current += 1
    onProgress?.(current, total, entry.key)
    if (target.provider === 'github') {
      await runOrThrowAsync(target.cli, ['secret', 'set', entry.key], runner, entry.value)
      continue
    }
    const action = existing.has(entry.key) ? 'update' : 'set'
    const args = ['variable', action, entry.key, '--raw']
    if (entry.masked)
      args.push('--masked')
    await runOrThrowAsync(target.cli, args, runner, entry.value)
  }
}

function detectGitRemoteProviders(runner: CommandRunner): Set<CiSecretProvider> {
  const result = runner('git', ['remote', '-v'])
  const providers = new Set<CiSecretProvider>()
  if (result.status !== 0)
    return providers

  for (const line of result.stdout.split(/\r?\n/)) {
    const remoteUrl = line.trim().split(/\s+/)[1] || line.trim()
    const host = extractRemoteHost(remoteUrl)
    if (!host)
      continue
    if (host.includes('github'))
      providers.add('github')
    if (host.includes('gitlab'))
      providers.add('gitlab')
  }
  return providers
}

function extractRemoteHost(remoteUrl: string): string | null {
  if (!remoteUrl)
    return null

  try {
    const hostname = new URL(remoteUrl).hostname.toLowerCase()
    if (hostname)
      return hostname
  }
  catch {}

  const sshUrl = remoteUrl.match(/^ssh:\/\/(?:[^@]+@)?([^/:]+)/i)
  if (sshUrl?.[1])
    return sshUrl[1].toLowerCase()

  const scpLike = remoteUrl.match(/^(?:[^@]+@)?([^:]+):/)
  if (scpLike?.[1])
    return scpLike[1].toLowerCase()

  return null
}

function getCliStatus(command: 'gh' | 'glab', runner: CommandRunner): { ready: boolean, reason: string, kind?: CiSecretSetupAdvice['reason'] } {
  const version = runner(command, ['--version'])
  if (version.status !== 0)
    return { ready: false, reason: `${command} is not installed`, kind: 'not-installed' }

  const auth = runner(command, ['auth', 'status'])
  if (auth.status !== 0)
    return { ready: false, reason: `${command} is not authenticated`, kind: 'not-authenticated' }

  return { ready: true, reason: '' }
}

function createSetupAdvice(
  target: CiSecretTarget,
  status: { reason: string, kind?: CiSecretSetupAdvice['reason'] },
): CiSecretSetupAdvice {
  const reason = status.kind || 'not-authenticated'
  if (target.provider === 'github') {
    return {
      target,
      reason,
      message: reason === 'not-installed'
        ? 'GitHub CLI is needed to upload GitHub Actions secrets.'
        : 'GitHub CLI is installed but not logged in.',
      commands: reason === 'not-installed'
        ? ['Install GitHub CLI: https://cli.github.com/', 'gh auth login']
        : ['gh auth login'],
    }
  }

  return {
    target,
    reason,
    message: reason === 'not-installed'
      ? 'GitLab CLI is needed to upload GitLab CI/CD variables.'
      : 'GitLab CLI is installed but not logged in.',
    commands: reason === 'not-installed'
      ? ['Install GitLab CLI: https://gitlab.com/gitlab-org/cli#installation', 'glab auth login']
      : ['glab auth login'],
  }
}

function listGithubSecretKeys(runner: CommandRunner): string[] {
  const result = runner('gh', ['secret', 'list', '--json', 'name'])
  if (result.status !== 0)
    throw new Error(formatCommandFailure('gh', ['secret', 'list'], result))

  const parsed = parseJson(result.stdout, 'gh secret list')
  if (!Array.isArray(parsed))
    return []

  return parsed
    .map(item => typeof item?.name === 'string' ? item.name : null)
    .filter((name): name is string => !!name)
}

function listGitlabVariableKeys(runner: CommandRunner): string[] {
  const keys = new Set<string>()

  for (let page = 1; page <= GITLAB_MAX_PAGES; page += 1) {
    const result = runner('glab', [
      'variable',
      'list',
      '--output',
      'json',
      '--per-page',
      String(GITLAB_PAGE_SIZE),
      '--page',
      String(page),
    ])
    if (result.status !== 0)
      throw new Error(formatCommandFailure('glab', ['variable', 'list'], result))

    const parsed = parseJson(result.stdout, 'glab variable list')
    const pageItems = normalizeGitlabVariableList(parsed)
    for (const item of pageItems) {
      if (typeof item.key === 'string')
        keys.add(item.key)
      else if (typeof item.name === 'string')
        keys.add(item.name)
    }

    if (pageItems.length < GITLAB_PAGE_SIZE)
      break
  }

  return [...keys]
}

function normalizeGitlabVariableList(parsed: unknown): Array<{ key?: string, name?: string }> {
  if (Array.isArray(parsed))
    return parsed as Array<{ key?: string, name?: string }>
  if (parsed && typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>
    if (Array.isArray(record.variables))
      return record.variables as Array<{ key?: string, name?: string }>
    if (Array.isArray(record.data))
      return record.data as Array<{ key?: string, name?: string }>
  }
  return []
}

function runOrThrow(command: string, args: string[], runner: CommandRunner, input: string): void {
  const result = runner(command, args, { input })
  if (result.status !== 0)
    throw new Error(formatCommandFailure(command, args.slice(0, 3), result))
}

async function runOrThrowAsync(command: string, args: string[], runner: AsyncCommandRunner, input: string): Promise<void> {
  const result = await runner(command, args, { input })
  if (result.status !== 0)
    throw new Error(formatCommandFailure(command, args.slice(0, 3), result))
}

async function listGithubSecretKeysAsync(runner: AsyncCommandRunner): Promise<string[]> {
  const result = await runner('gh', ['secret', 'list', '--json', 'name'])
  if (result.status !== 0)
    throw new Error(formatCommandFailure('gh', ['secret', 'list'], result))

  const parsed = parseJson(result.stdout, 'gh secret list')
  if (!Array.isArray(parsed))
    return []

  return parsed
    .map(item => typeof item?.name === 'string' ? item.name : null)
    .filter((name): name is string => !!name)
}

async function listGitlabVariableKeysAsync(runner: AsyncCommandRunner): Promise<string[]> {
  const keys = new Set<string>()
  for (let page = 1; page <= GITLAB_MAX_PAGES; page += 1) {
    const result = await runner('glab', [
      'variable',
      'list',
      '--output',
      'json',
      '--per-page',
      String(GITLAB_PAGE_SIZE),
      '--page',
      String(page),
    ])
    if (result.status !== 0)
      throw new Error(formatCommandFailure('glab', ['variable', 'list'], result))

    const parsed = parseJson(result.stdout, 'glab variable list')
    const pageItems = normalizeGitlabVariableList(parsed)
    for (const item of pageItems) {
      if (typeof item.key === 'string')
        keys.add(item.key)
      else if (typeof item.name === 'string')
        keys.add(item.name)
    }
    if (pageItems.length < GITLAB_PAGE_SIZE)
      break
  }
  return [...keys]
}

function parseJson(stdout: string, label: string): unknown {
  try {
    return JSON.parse(stdout || '[]')
  }
  catch {
    throw new Error(`${label} returned invalid JSON`)
  }
}

function formatCommandFailure(command: string, args: string[], result: CommandRunResult): string {
  const detail = [result.stderr, result.stdout, result.error?.message]
    .filter(Boolean)
    .join('\n')
    .trim()
  const commandText = [command, ...args].join(' ')
  return detail ? `${commandText} failed: ${detail}` : `${commandText} failed`
}
