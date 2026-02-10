import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { getSupabaseWorktreeConfig } from './supabase-worktree-config'

type SupabaseCmd = { cmd: string, argsPrefix: string[] }

function which(cmd: string): boolean {
  const res = spawnSync('command', ['-v', cmd], { shell: true, stdio: 'ignore' })
  return res.status === 0
}

function getSupabaseCmd(): SupabaseCmd {
  // In CI we may have `supabase` installed; locally we usually rely on `bunx supabase`.
  if (which('supabase'))
    return { cmd: 'supabase', argsPrefix: [] }
  return { cmd: 'bunx', argsPrefix: ['supabase'] }
}

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

function rewriteConfigToml(raw: string, cfg: ReturnType<typeof getSupabaseWorktreeConfig>): string {
  const { projectId, ports } = cfg
  const lines = raw.split('\n')
  let section = ''
  const out: string[] = []

  for (const line of lines) {
    const secMatch = line.match(/^\s*\[([^\]]+)\]\s*$/)
    if (secMatch)
      section = secMatch[1]

    if (line.match(/^\s*project_id\s*=/))
      out.push(`project_id = "${projectId}"`)
    else if (section === 'api' && line.match(/^\s*port\s*=\s*\d+\s*$/))
      out.push(`port = ${ports.api}`)
    else if (section === 'db' && line.match(/^\s*port\s*=\s*\d+\s*$/))
      out.push(`port = ${ports.db}`)
    else if (section === 'db' && line.match(/^\s*shadow_port\s*=\s*\d+\s*$/))
      out.push(`shadow_port = ${ports.dbShadow}`)
    else if (section === 'db.pooler' && line.match(/^\s*port\s*=\s*\d+\s*$/))
      out.push(`port = ${ports.dbPooler}`)
    else if (section === 'studio' && line.match(/^\s*port\s*=\s*\d+\s*$/))
      out.push(`port = ${ports.studio}`)
    else if (section === 'inbucket' && line.match(/^\s*port\s*=\s*\d+\s*$/))
      out.push(`port = ${ports.inbucket}`)
    else if (section === 'analytics' && line.match(/^\s*port\s*=\s*\d+\s*$/))
      out.push(`port = ${ports.analytics}`)
    else if (section === 'edge_runtime' && line.match(/^\s*inspector_port\s*=\s*\d+\s*$/))
      out.push(`inspector_port = ${ports.edgeInspector}`)
    else
      out.push(line)
  }

  return out.join('\n')
}

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

function parseStatusJson(mixed: string): any {
  // `supabase status -o json` can print non-JSON lines like:
  // "Stopped services: [...]"
  const idx = mixed.indexOf('{')
  if (idx < 0)
    throw new Error('Failed to parse supabase status output (no JSON object found).')
  return JSON.parse(mixed.slice(idx))
}

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
  if (service)
    env.SUPABASE_SERVICE_ROLE_KEY = service

  // Also forward the raw keys so existing scripts that expect them keep working.
  for (const [k, v] of Object.entries(status)) {
    if (typeof v === 'string')
      env[k] = v
  }
  return env
}

function runSupabase(args: string[], repoRoot: string): number {
  const { workdir } = ensureWorktreeSupabaseDir(repoRoot)
  const supa = getSupabaseCmd()
  const res = spawnSync(supa.cmd, [...supa.argsPrefix, ...args, '--workdir', workdir], {
    stdio: 'inherit',
    env: process.env,
  })
  return res.status ?? 1
}

function runWithEnv(cmdArgs: string[], repoRoot: string): number {
  const { workdir } = ensureWorktreeSupabaseDir(repoRoot)
  const supa = getSupabaseCmd()

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

  const childEnv = { ...process.env, ...statusToEnv(status) }
  const res = spawnSync(cmdArgs[0], cmdArgs.slice(1), {
    stdio: 'inherit',
    env: childEnv,
    shell: false,
  })
  return res.status ?? 1
}

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
