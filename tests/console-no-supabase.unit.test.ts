// Guard: the console only talks to Capgo through the Capgo API. No Supabase SDK,
// hosts, anon keys or REST/Storage URL layouts, so the backend can move off
// Supabase without a console change. Generated database types stay shared.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(import.meta.dirname, '..')

const forbidden: Array<{ pattern: RegExp, reason: string }> = [
  { pattern: /\b(?:from|import)\s*\(?['"]@supabase\//, reason: 'Supabase SDK import' },
  { pattern: /@capgo\/capacitor-supabase/, reason: 'Capacitor Supabase plugin' },
  { pattern: /VITE_SUPABASE_|\bSUPA_(?:URL|ANON)\b/, reason: 'Supabase build env' },
  { pattern: /\bsupa(?:Host|Key|ProxyPath)\b|\bsupbaseId\b/, reason: 'Supabase config field' },
  { pattern: /--supa-(?:host|anon)/, reason: 'removed CLI Supabase flags' },
  { pattern: /\/(?:rest|storage)\/v1\b/, reason: 'direct Supabase REST/Storage URL' },
  { pattern: /\bsb\.capgo\.app\b|\.supabase\.co\b/, reason: 'Supabase host' },
  { pattern: /configs\.json/, reason: 'configs.json carries Supabase keys and must not be bundled' },
]

function walk(dir: string, out: string[]) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      walk(path, out)
      continue
    }
    if (/\.(?:ts|mts|vue|js|mjs)$/.test(entry))
      out.push(path)
  }
  return out
}

describe('console never talks to Supabase', () => {
  it('keeps src/ free of Supabase SDK, hosts, keys and env', () => {
    const offenders: string[] = []
    for (const file of walk(join(root, 'src'), [])) {
      const source = readFileSync(file, 'utf8')
      for (const { pattern, reason } of forbidden) {
        if (pattern.test(source))
          offenders.push(`${relative(root, file)}: ${reason}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps package.json free of the Capacitor Supabase plugin', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as Record<string, Record<string, string>>
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies'])
      expect(Object.keys(pkg[field] ?? {})).not.toContain('@capgo/capacitor-supabase')
  })
})
