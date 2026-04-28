import { spawn, spawnSync } from 'node:child_process'

const defaultStarOwner = 'Cap-go'
export const defaultStarRepo = 'capacitor-updater'
const defaultStarTarget = `${defaultStarOwner}/${defaultStarRepo}`
const defaultStarPrefix = 'capacitor-'
const additionalDefaultStarRepositories = [`${defaultStarOwner}/CLI`, `${defaultStarOwner}/capgo`, `${defaultStarOwner}/capgo-skills`] as const
const fallbackStarRepositories = [defaultStarTarget, ...additionalDefaultStarRepositories] as const
const defaultMinStarDelayMs = 20
const defaultMaxStarDelayMs = 180
const defaultMaxStarConcurrency = 4
const starredRepoSessionCache = new Set<string>()

interface GhCommandResult {
  status: number
  stderr: string
  stdout: string
}

export type StarAllRepositoryStatus = 'starred' | 'already_starred' | 'skipped' | 'failed'

export interface StarAllRepositoryResult {
  repository: string
  alreadyStarred: boolean
  skipped: boolean
  error?: string
  status: StarAllRepositoryStatus
}

export interface StarAllRepositoriesOptions {
  repositories?: string[]
  minDelayMs?: number
  maxDelayMs?: number
  maxConcurrency?: number
  onProgress?: (result: StarAllRepositoryResult) => void
  onDiscovery?: (message: string) => void
  signal?: AbortSignal
}

export class StarAllRepositoriesAbortedError extends Error {
  results: StarAllRepositoryResult[]

  constructor(results: StarAllRepositoryResult[] = []) {
    super('Star-all interrupted by user.')
    this.name = 'StarAllRepositoriesAbortedError'
    this.results = results
  }
}

function normalizeRepositoryForCache(repository: string) {
  return repository.toLowerCase()
}

export function markRepoStarredInSession(repository: string) {
  starredRepoSessionCache.add(normalizeRepositoryForCache(repository))
}

export function isRepoStarredInSession(repositoryInput?: string): boolean {
  const repository = normalizeGithubRepo(repositoryInput)
  return starredRepoSessionCache.has(normalizeRepositoryForCache(repository))
}

function normalizeDelayMs(value: number | undefined, fallback: number) {
  if (typeof value !== 'number')
    return fallback

  if (!Number.isFinite(value))
    return fallback

  if (value < 0)
    return fallback

  return Math.floor(value)
}

function getDelayRange(minDelayMs?: number, maxDelayMs?: number) {
  const min = normalizeDelayMs(minDelayMs, defaultMinStarDelayMs)
  const max = normalizeDelayMs(maxDelayMs, defaultMaxStarDelayMs)
  if (min <= max)
    return { min, max }

  return { min: max, max: min }
}

function getRandomDelayMs(minDelayMs: number, maxDelayMs: number) {
  if (minDelayMs === maxDelayMs)
    return minDelayMs
  return Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1)) + minDelayMs
}

function normalizeConcurrency(value: number | undefined, fallback: number) {
  if (typeof value !== 'number')
    return fallback

  if (!Number.isFinite(value))
    return fallback

  if (value < 1)
    return fallback

  return Math.min(Math.floor(value), 16)
}

function createAbortedError(results: StarAllRepositoryResult[] = []) {
  return new StarAllRepositoriesAbortedError(results)
}

function throwIfAborted(signal?: AbortSignal, results: StarAllRepositoryResult[] = []): void {
  if (signal?.aborted)
    throw createAbortedError(results)
}

async function sleep(ms: number, signal?: AbortSignal) {
  if (ms <= 0)
    return
  if (!signal)
    return new Promise(resolve => setTimeout(resolve, ms))
  if (signal.aborted)
    throw createAbortedError()

  return new Promise<void>((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout>

    const onAbort = () => {
      clearTimeout(timeout)
      signal.removeEventListener('abort', onAbort)
      reject(createAbortedError())
    }

    timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)

    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function dedupeRepositories(repositories: string[]) {
  const seen = new Set<string>()
  const result: string[] = []

  for (const repository of repositories) {
    const normalizedRepository = normalizeGithubRepo(repository)
    const cacheKey = normalizeRepositoryForCache(normalizedRepository)
    if (!seen.has(cacheKey)) {
      seen.add(cacheKey)
      result.push(normalizedRepository)
    }
  }

  return result
}

async function getDefaultCapgoStarRepositories(onDiscovery?: (message: string) => void, signal?: AbortSignal): Promise<string[]> {
  throwIfAborted(signal)
  onDiscovery?.(`Discovering repositories in the ${defaultStarOwner} organization.`)

  const apiResult = executeGhCommand([
    'api',
    '--paginate',
    `orgs/${defaultStarOwner}/repos`,
    '--jq',
    `map(select(.name | startswith("${defaultStarPrefix}")) | .nameWithOwner)[]`,
  ])

  if (apiResult.status === 0 && apiResult.stdout.trim().length > 0) {
    const repositories = apiResult.stdout
      .split('\n')
      .map(repo => repo.trim())
      .filter(repo => repo.length > 0)

    if (repositories.length > 0) {
      const mergedRepositories = dedupeRepositories([...repositories, ...additionalDefaultStarRepositories])
      onDiscovery?.(`Found ${mergedRepositories.length} matching repositories from the GitHub API.`)
      return mergedRepositories
    }

    onDiscovery?.('No matching repositories were returned from the paginated GitHub API. Trying a fallback request.')
  }
  else {
    onDiscovery?.('Paginated GitHub API request failed. Trying a fallback request.')
  }

  const fallbackResult = executeGhCommand(['api', `orgs/${defaultStarOwner}/repos?per_page=100`])
  if (fallbackResult.status !== 0) {
    onDiscovery?.('Fallback request failed. Using the default repository list instead.')
    return [...fallbackStarRepositories]
  }

  try {
    const parsed = JSON.parse(fallbackResult.stdout)
    if (!Array.isArray(parsed)) {
      onDiscovery?.('Fallback response format was invalid. Using the default repository list instead.')
      return [...fallbackStarRepositories]
    }

    const repositories = parsed
      .filter((repo): repo is { name?: string } => typeof repo === 'object' && repo !== null)
      .map(repo => repo.name)
      .filter((name): name is string => !!name && name.startsWith(defaultStarPrefix))
      .map(name => `${defaultStarOwner}/${name}`)

    if (repositories.length > 0) {
      const mergedRepositories = dedupeRepositories([...repositories, ...additionalDefaultStarRepositories])
      onDiscovery?.(`Found ${mergedRepositories.length} matching repositories from the fallback request.`)
      return mergedRepositories
    }
  }
  catch {
    onDiscovery?.('Fallback response could not be parsed. Using the default repository list instead.')
    return [...fallbackStarRepositories]
  }

  onDiscovery?.('No matching repositories were found. Using the default repository list instead.')
  return [...fallbackStarRepositories]
}

function executeGhCommandAsync(args: string[], signal?: AbortSignal): Promise<GhCommandResult> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    let child: ReturnType<typeof spawn> | undefined
    let onAbort = () => {}

    const finish = (result: GhCommandResult) => {
      if (settled)
        return
      settled = true
      signal?.removeEventListener('abort', onAbort)
      resolve(result)
    }

    onAbort = () => {
      child?.kill('SIGINT')
      finish({
        status: 130,
        stderr: 'GitHub command interrupted by user.',
        stdout,
      })
    }

    child = spawn('gh', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk) => {
      stdout += chunk
    })

    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk) => {
      stderr += chunk
    })

    child.on('error', () => {
      finish({ status: 1, stderr: '`gh` command is not available in PATH.', stdout: '' })
    })

    child.on('close', (status) => {
      finish({
        status: status ?? 1,
        stderr,
        stdout,
      })
    })

    if (signal) {
      if (signal.aborted) {
        onAbort()
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

function executeGhCommand(args: string[]): GhCommandResult {
  try {
    const result = spawnSync('gh', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    return {
      status: result.status ?? 1,
      stderr: result.stderr?.toString() ?? '',
      stdout: result.stdout?.toString() ?? '',
    }
  }
  catch {
    return { status: 1, stderr: '`gh` command is not available in PATH.', stdout: '' }
  }
}

function ensureGhReady() {
  if (!isGhInstalled())
    throw new Error('GitHub CLI (`gh`) is not installed. Install it from https://cli.github.com/')

  if (!isGhLoggedIn())
    throw new Error('GitHub CLI is not logged in. Run `gh auth login` first.')
}

async function getAlreadyStarredRepositories(
  repositories: string[],
  onDiscovery?: (message: string) => void,
  signal?: AbortSignal,
) {
  if (repositories.length === 0)
    return new Set<string>()

  const starredRepositories = new Set<string>()
  onDiscovery?.(`Checking ${repositories.length} target repositories against your GitHub stars.`)

  await processInParallel(
    repositories,
    Math.min(repositories.length, 8),
    signal,
    () => [],
    async (repository) => {
      const result = await executeGhCommandAsync(['api', '-X', 'GET', `/user/starred/${repository}`], signal)
      if (result.status === 0) {
        starredRepositories.add(normalizeRepositoryForCache(repository))
        return
      }

      if (result.status === 1) {
        return
      }

      if (result.status === 130 && signal?.aborted) {
        throw createAbortedError()
      }

      throw new Error(`Unable to check star status for ${repository}. ${result.stderr || result.stdout}`.trim())
    },
  )

  onDiscovery?.(`Found ${starredRepositories.size} repositories already starred.`)
  return starredRepositories
}

async function processInParallel<T>(
  items: T[],
  maxConcurrency: number,
  signal: AbortSignal | undefined,
  getResults: () => StarAllRepositoryResult[],
  handler: (item: T, index: number) => Promise<void>,
) {
  let nextIndex = 0

  async function worker() {
    while (true) {
      throwIfAborted(signal, getResults())
      const currentIndex = nextIndex
      nextIndex += 1

      if (currentIndex >= items.length)
        return

      await handler(items[currentIndex], currentIndex)
    }
  }

  const workerCount = Math.min(maxConcurrency, items.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
}

function createStartRateLimiter(minDelayMs: number, maxDelayMs: number, signal?: AbortSignal) {
  let scheduled = Promise.resolve()

  return async () => {
    throwIfAborted(signal)
    let release: (() => void) | undefined
    const previous = scheduled
    scheduled = new Promise<void>((resolve) => {
      release = resolve
    })

    await previous
    await sleep(getRandomDelayMs(minDelayMs, maxDelayMs), signal)
    release?.()
  }
}

function starRepositoryWithoutStatusChecks(repository: string) {
  const starResult = executeGhCommand(['api', '-X', 'PUT', `/user/starred/${repository}`])
  if (starResult.status !== 0) {
    const message = starResult.stderr || starResult.stdout || `GitHub returned status ${starResult.status}`
    throw new Error(`Failed to star ${repository}: ${message.trim()}`)
  }

  markRepoStarredInSession(repository)
  return { repository, alreadyStarred: false }
}

export interface RepoStarStatus {
  repository: string
  ghInstalled: boolean
  ghLoggedIn: boolean
  repositoryExists: boolean
  starred: boolean
}

export function normalizeGithubRepo(repository?: string): string {
  const rawRepository = repository?.trim() || defaultStarTarget

  const sanitized = rawRepository.replace(/\.git$/i, '')
  if (/^https?:\/\//.test(sanitized)) {
    try {
      const url = new URL(sanitized)
      if (url.hostname.endsWith('github.com')) {
        const [owner, name] = url.pathname
          .split('/')
          .filter(part => part.length > 0)
        if (owner && name)
          return `${owner}/${name}`
      }
    }
    catch {
      // Continue with generic normalization below
    }
  }

  if (sanitized.startsWith('git@github.com:')) {
    const [, path] = sanitized.split('git@github.com:')
    if (path) {
      const [owner, name] = path.split('/')
      if (owner && name)
        return `${owner}/${name}`
    }
  }

  if (sanitized.includes('/')) {
    const [owner, repoName] = sanitized.split('/')
    if (owner && repoName)
      return `${owner}/${repoName}`
  }

  return `${defaultStarOwner}/${sanitized}`
}

function repositoryExists(repository: string) {
  const result = executeGhCommand(['repo', 'view', repository, '--json', 'nameWithOwner'])
  return result.status === 0
}

function checkIfStarred(repository: string) {
  const result = executeGhCommand(['api', '-X', 'GET', `/user/starred/${repository}`])
  if (result.status === 0)
    return true
  if (result.status === 1)
    return false

  throw new Error(`Unable to check star status for ${repository}.`)
}

export function isGhInstalled() {
  return executeGhCommand(['--version']).status === 0
}

export function isGhLoggedIn() {
  return executeGhCommand(['auth', 'status']).status === 0
}

export function getRepoStarStatus(repositoryInput?: string): RepoStarStatus {
  const repository = normalizeGithubRepo(repositoryInput)

  if (!isGhInstalled()) {
    return {
      repository,
      ghInstalled: false,
      ghLoggedIn: false,
      repositoryExists: false,
      starred: false,
    }
  }

  if (!isGhLoggedIn()) {
    return {
      repository,
      ghInstalled: true,
      ghLoggedIn: false,
      repositoryExists: false,
      starred: false,
    }
  }

  const exists = repositoryExists(repository)
  if (!exists) {
    return {
      repository,
      ghInstalled: true,
      ghLoggedIn: true,
      repositoryExists: false,
      starred: false,
    }
  }

  return {
    repository,
    ghInstalled: true,
    ghLoggedIn: true,
    repositoryExists: true,
    starred: checkIfStarred(repository),
  }
}

export async function starAllRepositories(options: StarAllRepositoriesOptions = {}): Promise<StarAllRepositoryResult[]> {
  ensureGhReady()
  throwIfAborted(options.signal)

  const repositoriesToStar = options.repositories?.length
    ? options.repositories
    : await getDefaultCapgoStarRepositories(options.onDiscovery, options.signal)

  options.onDiscovery?.(`Prepared ${repositoriesToStar.length} repositories to process.`)

  const delayRange = getDelayRange(options.minDelayMs, options.maxDelayMs)
  const normalizedRepositories = dedupeRepositories(repositoriesToStar)
  const maxConcurrency = normalizeConcurrency(options.maxConcurrency, defaultMaxStarConcurrency)
  throwIfAborted(options.signal)
  const alreadyStarredRepositories = await getAlreadyStarredRepositories(normalizedRepositories, options.onDiscovery, options.signal)

  const results = Array.from({ length: normalizedRepositories.length })
  const getCompletedResults = () => results.filter((result): result is StarAllRepositoryResult => !!result)
  const repositoriesToProcess: Array<{ index: number, repository: string }> = []

  for (let i = 0; i < normalizedRepositories.length; i++) {
    throwIfAborted(options.signal, getCompletedResults())
    const repository = normalizedRepositories[i]
    const normalizedRepository = normalizeRepositoryForCache(repository)
    if (isRepoStarredInSession(repository)) {
      const result: StarAllRepositoryResult = {
        repository,
        alreadyStarred: true,
        skipped: true,
        status: 'already_starred',
      }
      options.onProgress?.(result)
      results[i] = result
      continue
    }

    if (alreadyStarredRepositories.has(normalizedRepository)) {
      markRepoStarredInSession(repository)
      const result: StarAllRepositoryResult = {
        repository,
        alreadyStarred: true,
        skipped: true,
        status: 'already_starred',
      }
      options.onProgress?.(result)
      results[i] = result
      continue
    }

    repositoriesToProcess.push({ index: i, repository })
  }

  const waitForNextStart = createStartRateLimiter(delayRange.min, delayRange.max, options.signal)
  await processInParallel(repositoriesToProcess, maxConcurrency, options.signal, getCompletedResults, async ({ index, repository }) => {
    await waitForNextStart()
    throwIfAborted(options.signal, getCompletedResults())

    try {
      const result = starRepositoryWithoutStatusChecks(repository)
      const starResult: StarAllRepositoryResult = {
        repository: result.repository,
        alreadyStarred: false,
        skipped: false,
        status: 'starred',
      }
      options.onProgress?.(starResult)
      results[index] = starResult
    }
    catch (error) {
      const failedResult: StarAllRepositoryResult = {
        repository,
        alreadyStarred: false,
        skipped: false,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      }
      options.onProgress?.(failedResult)
      results[index] = failedResult
    }
  })

  return getCompletedResults()
}

export function starRepository(repositoryInput?: string): { repository: string, alreadyStarred: boolean } {
  const repository = normalizeGithubRepo(repositoryInput)
  ensureGhReady()
  const status = getRepoStarStatus(repository)

  if (!status.repositoryExists)
    throw new Error(`Cannot star ${repository}: repository is not reachable or does not exist.`)

  if (status.starred) {
    markRepoStarredInSession(repository)
    return { repository, alreadyStarred: true }
  }

  return starRepositoryWithoutStatusChecks(repository)
}
