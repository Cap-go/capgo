import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

type SupabaseCmd = { cmd: string, argsPrefix: string[] }

function hasSupabaseCli(): boolean {
  const res = spawnSync('supabase', ['--version'], { stdio: 'ignore' })
  return res.status === 0
}

function getLocalSupabaseCli(repoRoot: string): string | null {
  const binName = process.platform === 'win32' ? 'supabase.exe' : 'supabase'
  const localBin = resolve(repoRoot, 'node_modules', 'supabase', 'bin', binName)
  return existsSync(localBin) ? localBin : null
}

function getSupabaseCmd(repoRoot: string): SupabaseCmd {
  const localBin = getLocalSupabaseCli(repoRoot)
  if (localBin)
    return { cmd: localBin, argsPrefix: [] }

  if (existsSync(resolve(repoRoot, 'node_modules', 'supabase', 'package.json'))) {
    throw new Error('Supabase CLI is installed without its binary. Run `bun pm trust supabase && bun install` so Bun can execute the package postinstall.')
  }

  if (hasSupabaseCli())
    return { cmd: 'supabase', argsPrefix: [] }

  throw new Error('Supabase CLI not found. Run `bun install` or install the standalone `supabase` binary.')
}

function main() {
  const repoRoot = process.cwd()
  const supa = getSupabaseCmd(repoRoot)

  console.log('Stopping all local Supabase Docker stacks and removing their volumes...')

  const result = spawnSync(supa.cmd, [...supa.argsPrefix, 'stop', '--all', '--no-backup', '--yes'], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  })

  process.exit(result.status ?? 1)
}

main()
