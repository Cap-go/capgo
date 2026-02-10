import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { getSupabaseWorktreeConfig } from './supabase-worktree-config'

type SupabaseCmd = { cmd: string, argsPrefix: string[] }

/**
 * Used to decide whether to call the globally installed `supabase` CLI or fall back to `bunx supabase`.
 */
function hasSupabaseCli(): boolean {
  const res = spawnSync('supabase', ['--version'], { stdio: 'ignore' })
  return res.status === 0
}

/**
 * Resolve the Supabase CLI invocation.
 *
 * Prefers the globally installed `supabase` binary (CI), otherwise falls back to `bunx supabase` (local dev).
 */
function getSupabaseCmd(): SupabaseCmd {
  // In CI we may have `supabase` installed; locally we usually rely on `bunx supabase`.
  if (hasSupabaseCli())
    return { cmd: 'supabase', argsPrefix: [] }
  return { cmd: 'bunx', argsPrefix: ['supabase'] }
}

/**
 * Ensure `linkPath` is a symlink pointing at `targetPath`.
 *
 * This is used to build a lightweight per-worktree Supabase workdir that reuses the repo's
 * functions/migrations/seed without copying.
 */
function ensureSymlink(linkPath: string, targetPath: string): void {
  try {
    if (existsSync(linkPath)) {
      // If it already exists and points to the right place, keep it; otherwise replace.
      const resolved = realpathSync(linkPath)
      const want = realpathSync(targetPath)
      if (resolved === want)
        return
      rmSync(linkPath, { force: true, recursive: true })
    }
  }
  catch {
    // Best effort: replace anything we can't validate.
    rmSync(linkPath, { force: true, recursive: true })
  }

  mkdirSync(dirname(linkPath), { recursive: true })
  symlinkSync(targetPath, linkPath)
}

/**
 * Rewrite `supabase/config.toml` to use a worktree-specific `project_id` and port set.
 *
 * The `project_id` affects Docker resource names (containers/volumes). Ports are shifted to
 * avoid collisions when multiple worktrees run Supabase concurrently.
 */
function rewriteConfigToml(raw: string, cfg: ReturnType<typeof getSupabaseWorktreeConfig>): string {
  const { projectId, ports } = cfg
  const lines = raw.split('\n')
  let section = ''
  const out: string[] = []

  const portBySection: Record<string, number> = {
    api: ports.api,
    db: ports.db,
    'db.pooler': ports.dbPooler,
    studio: ports.studio,
    inbucket: ports.inbucket,
    analytics: ports.analytics,
  }

  for (const line of lines) {
    const secMatch = line.match(/^\s*\[([^\]]+)\]\s*$/)
    if (secMatch)
      section = secMatch[1]

    if (line.match(/^\s*project_id\s*=/))
      out.push(`project_id = "${projectId}"`)
    else if (section === 'db' && line.match(/^\s*shadow_port\s*=\s*\d+\s*$/))
      out.push(`shadow_port = ${ports.dbShadow}`)
    else if (section === 'edge_runtime' && line.match(/^\s*inspector_port\s*=\s*\d+\s*$/))
      out.push(`inspector_port = ${ports.edgeInspector}`)
    else if (section in portBySection && line.match(/^\s*port\s*=\s*\d+\s*$/))
      out.push(`port = ${portBySection[section]}`)
    else
      out.push(line)
  }

  return out.join('\n')
}

/**
 * Create (or update) the per-worktree Supabase workdir under `.context/`.
 *
 * The resulting directory is suitable to pass to `supabase --workdir`, and contains a rewritten
 * `supabase/config.toml` plus symlinks to the project's Supabase assets.
 */
function ensureWorktreeSupabaseDir(repoRoot: string): { workdir: string, cfg: ReturnType<typeof getSupabaseWorktreeConfig> } {
  const cfg = getSupabaseWorktreeConfig(repoRoot)
  const workdir = resolve(cfg.repoRoot, '.context', 'supabase-worktrees', cfg.worktreeHash)
  const supaDir = resolve(workdir, 'supabase')

  mkdirSync(supaDir, { recursive: true })

  // Symlink everything except config.toml so we can safely rewrite ports + project_id per worktree.
  const repoSupaDir = resolve(cfg.repoRoot, 'supabase')
  for (const entry of ['functions', 'migrations', 'schemas', 'tests', 'seed.sql', 'migration_guide.md', '.gitignore']) {
    const src = resolve(repoSupaDir, entry)
    if (!existsSync(src))
      continue
    const dst = resolve(supaDir, entry)
    ensureSymlink(dst, src)
  }

  const baseConfig = readFileSync(resolve(repoSupaDir, 'config.toml'), 'utf8')
  const rewritten = rewriteConfigToml(baseConfig, cfg)
  writeFileSync(resolve(supaDir, 'config.toml'), rewritten)

  return { workdir, cfg }
}

/**
 * Parse `supabase status -o json` output, which may include non-JSON informational lines.
 */
function parseStatusJson(mixed: string): any {
  // `supabase status -o json` can print non-JSON lines like:
  // "Stopped services: [...]"
  const idx = mixed.indexOf('{')
  if (idx < 0)
    throw new Error('Failed to parse supabase status output (no JSON object found).')
  return JSON.parse(mixed.slice(idx))
}

/**
 * Get Supabase status as JSON, optionally for a specific `--workdir`.
 */
function getStatusJson(supa: SupabaseCmd, workdir?: string): { ok: true, json: any } | { ok: false, status: number } {
  const args = [...supa.argsPrefix, 'status', '-o', 'json']
  if (workdir)
    args.push('--workdir', workdir)

  const res = spawnSync(supa.cmd, args, {
    encoding: 'utf8',
    env: process.env,
  })

  if ((res.status ?? 1) !== 0)
    return { ok: false, status: res.status ?? 1 }

  try {
    return { ok: true, json: parseStatusJson(res.stdout || '') }
  }
  catch {
    return { ok: false, status: 1 }
  }
}

/**
 * Map Supabase CLI status variables to the env vars used by the codebase/tests.
 */
function statusToEnv(status: any): Record<string, string> {
  const apiUrl = status.API_URL as string | undefined
  const dbUrl = status.DB_URL as string | undefined
  const anon = (status.ANON_KEY || status.PUBLISHABLE_KEY) as string | undefined
  const service = (status.SERVICE_ROLE_KEY || status.SECRET_KEY) as string | undefined

  const env: Record<string, string> = {}
  if (apiUrl)
    env.SUPABASE_URL = apiUrl
  if (dbUrl)
    env.SUPABASE_DB_URL = dbUrl
  if (anon)
    env.SUPABASE_ANON_KEY = anon
  if (service) {
    // Keep both names for backwards compatibility across scripts/tests.
    env.SUPABASE_SERVICE_ROLE_KEY = service
    env.SUPABASE_SERVICE_KEY = service
  }

  // Also forward the raw keys so existing scripts that expect them keep working.
  for (const [k, v] of Object.entries(status)) {
    if (typeof v === 'string')
      env[k] = v
  }
  return env
}

/**
 * Parse leading `KEY=VALUE` tokens into an env map.
 *
 * This allows `bun run supabase:with-env -- FOO=bar bunx vitest ...` without requiring `cross-env`.
 */
function parseInlineEnvAssignments(args: string[]): { env: Record<string, string>, rest: string[] } {
  // Allow leading KEY=VALUE tokens so callers don't need `cross-env` (works cross-platform).
  const env: Record<string, string> = {}
  let idx = 0
  for (; idx < args.length; idx++) {
    const token = args[idx]
    if (!token)
      break
    const eq = token.indexOf('=')
    if (eq <= 0)
      break
    const key = token.slice(0, eq)
    if (!/^[A-Z0-9_]+$/.test(key))
      break
    env[key] = token.slice(eq + 1)
  }
  return { env, rest: args.slice(idx) }
}

/**
 * Run a Supabase CLI command against the current worktree's generated `--workdir`.
 */
function runSupabase(args: string[], repoRoot: string): number {
  const { workdir } = ensureWorktreeSupabaseDir(repoRoot)
  const supa = getSupabaseCmd()
  const res = spawnSync(supa.cmd, [...supa.argsPrefix, ...args, '--workdir', workdir], {
    stdio: 'inherit',
    env: process.env,
  })
  return res.status ?? 1
}

/**
 * Run an arbitrary command with Supabase env (URL/keys) injected for the current worktree.
 *
 * This is used by the test scripts so parallel worktrees do not accidentally target the same
 * local Supabase stack.
 */
function runWithEnv(cmdArgs: string[], repoRoot: string): number {
  const { workdir } = ensureWorktreeSupabaseDir(repoRoot)
  const supa = getSupabaseCmd()

  const { env: inlineEnv, rest: commandArgs } = parseInlineEnvAssignments(cmdArgs)
  if (commandArgs.length === 0) {
    console.error('Usage: bun scripts/supabase-worktree.ts with-env <command...>')
    return 2
  }

  // Prefer the worktree-isolated stack, but fall back to legacy `supabase start`
  // (e.g. CI workflows or older developer habits) so tests keep working.
  const worktreeStatus = getStatusJson(supa, workdir)
  const legacyStatus = worktreeStatus.ok ? null : getStatusJson(supa, undefined)

  if (!worktreeStatus.ok && !legacyStatus?.ok) {
    console.error('Supabase is not running. Start it with `bun run supabase:start` (preferred) or `supabase start` (legacy).')
    return 1
  }

  if (!worktreeStatus.ok && legacyStatus?.ok)
    console.warn('Using legacy Supabase stack (no worktree isolation detected).')

  const status = (worktreeStatus.ok ? worktreeStatus.json : (legacyStatus as any).json) as any

  const childEnv = { ...process.env, ...statusToEnv(status), ...inlineEnv }
  const res = spawnSync(commandArgs[0], commandArgs.slice(1), {
    stdio: 'inherit',
    env: childEnv,
    // On Windows, many package binaries are `.cmd` shims and require `shell: true`.
    shell: process.platform === 'win32',
  })
  return res.status ?? 1
}

/**
 * CLI entrypoint. Supports:
 * - `bun scripts/supabase-worktree.ts <supabase-subcommand...>`
 * - `bun scripts/supabase-worktree.ts with-env <command...>`
 */
function main(): number {
  const repoRoot = process.cwd()
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.error('Usage: bun scripts/supabase-worktree.ts <supabase-subcommand...>\n       bun scripts/supabase-worktree.ts with-env <command...>')
    return 2
  }

  if (args[0] === 'with-env') {
    const cmdArgs = args.slice(1)
    if (cmdArgs.length === 0) {
      console.error('Usage: bun scripts/supabase-worktree.ts with-env <command...>')
      return 2
    }
    return runWithEnv(cmdArgs, repoRoot)
  }

  return runSupabase(args, repoRoot)
}

process.exitCode = main()
