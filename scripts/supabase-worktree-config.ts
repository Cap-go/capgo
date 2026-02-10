import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'

export interface SupabaseWorktreePorts {
  api: number
  db: number
  dbShadow: number
  dbPooler: number
  studio: number
  inbucket: number
  analytics: number
  edgeInspector: number
}

export interface SupabaseWorktreeConfig {
  repoRoot: string
  worktreeHash: string
  projectId: string
  ports: SupabaseWorktreePorts
}

function getGitRepoRoot(cwd: string): string {
  const res = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
  })
  if (res.status === 0) {
    const out = (res.stdout || '').trim()
    if (out)
      return out
  }
  return cwd
}

export function getSupabaseWorktreeConfig(cwd: string = process.cwd()): SupabaseWorktreeConfig {
  const repoRootRaw = getGitRepoRoot(cwd)
  const repoRoot = realpathSync(resolve(repoRootRaw))

  // Hashing the full path gives stable IDs per worktree directory.
  const worktreeHash = createHash('sha256').update(repoRoot).digest('hex').slice(0, 8)
  const offset = (Number.parseInt(worktreeHash.slice(0, 6), 16) % 1000) * 10

  const base = {
    api: 54321,
    db: 54322,
    dbShadow: 54320,
    dbPooler: 54329,
    studio: 54323,
    inbucket: 54324,
    analytics: 54327,
    edgeInspector: 8083,
  } satisfies SupabaseWorktreePorts

  return {
    repoRoot,
    worktreeHash,
    projectId: `capgo-app-${worktreeHash}`,
    ports: {
      api: base.api + offset,
      db: base.db + offset,
      dbShadow: base.dbShadow + offset,
      dbPooler: base.dbPooler + offset,
      studio: base.studio + offset,
      inbucket: base.inbucket + offset,
      analytics: base.analytics + offset,
      edgeInspector: base.edgeInspector + (offset / 10),
    },
  }
}

