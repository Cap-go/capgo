/**
 * One-time / refresh helper: copy the CF plugin value+type import closure into
 * supabase/functions/_backend/plugin_runtime/.
 *
 * Prefer editing plugin_runtime directly after the initial split. Dual-use
 * originals may remain under _backend/utils for the API worker.
 *
 * After running, also run: bun scripts/check_plugin_runtime_isolation.mjs
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const entry = resolve(root, 'cloudflare_workers/plugin/index.ts')
const destRoot = resolve(root, 'supabase/functions/_backend/plugin_runtime')
const backendRoot = resolve(root, 'supabase/functions/_backend')

const seen = new Set()
const queue = [entry]
const closure = []

function resolveImport(from, spec) {
  if (!spec.startsWith('.'))
    return null
  const base = resolve(dirname(from), spec)
  for (const cand of [base, `${base}.ts`, `${base}.js`, join(base, 'index.ts')]) {
    if (existsSync(cand) && cand.endsWith('.ts'))
      return cand
  }
  return null
}

while (queue.length) {
  const abs = queue.shift()
  if (seen.has(abs) || !existsSync(abs))
    continue
  seen.add(abs)
  closure.push(abs)
  const src = readFileSync(abs, 'utf8')
  const re = /(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g
  let m
  while ((m = re.exec(src))) {
    const resolved = resolveImport(abs, m[1])
    if (resolved && resolved.startsWith(backendRoot))
      queue.push(resolved)
  }
}

function destFor(abs) {
  const rel = relative(root, abs)
  if (rel === 'cloudflare_workers/plugin/index.ts')
    return null
  if (rel.startsWith('supabase/functions/_backend/plugin_runtime/'))
    return abs
  if (!rel.startsWith('supabase/functions/_backend/'))
    throw new Error(`Unexpected closure file outside _backend: ${rel}`)
  return resolve(destRoot, relative(backendRoot, abs))
}

if (existsSync(destRoot))
  rmSync(destRoot, { recursive: true, force: true })
mkdirSync(destRoot, { recursive: true })

const copied = []
for (const abs of closure) {
  const dest = destFor(abs)
  if (!dest || abs === dest)
    continue
  mkdirSync(dirname(dest), { recursive: true })
  cpSync(abs, dest)
  copied.push(relative(root, dest))
}

writeFileSync(join(destRoot, 'README.md'), `# Plugin runtime (isolated)

This tree is the **only** backend code the Cloudflare plugin worker and Deno
\`updates\` / \`stats\` / \`channel_self\` entries may import for request handling.

Do **not** import from \`../utils\`, \`../private\`, \`../public\`, or other
\`_backend\` siblings. API / triggers / files workers must not import from this tree.

Duplicates of formerly shared helpers are intentional so plugin perf work
cannot pull API-only dependencies back into the isolate.

Enforce with: \`bun scripts/check_plugin_runtime_isolation.mjs\`
`)

console.log(`Copied ${copied.length} files into plugin_runtime/`)
console.log(copied.sort().join('\n'))
