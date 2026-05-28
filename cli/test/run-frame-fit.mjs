// Discovers and runs every test/test-frame-fit-*.mjs as an isolated subprocess,
// aggregating exit codes. This lets each onboarding batch add its own
// `test-frame-fit-<batch>.mjs` file WITHOUT editing package.json — the master
// `test:frame-fit` script auto-picks it up. Subprocess isolation means each
// file can `process.exit()` on its own (like the rest of the CLI test suite).
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const files = readdirSync(dir)
  .filter(f => /^test-frame-fit-.*\.mjs$/.test(f))
  .sort()

if (files.length === 0) {
  console.log('No frame-fit test files found (test/test-frame-fit-*.mjs).')
  process.exit(0)
}

let failures = 0
for (const file of files) {
  console.log(`\n▶ ${file}`)
  const result = spawnSync('bun', [join(dir, file)], { stdio: 'inherit' })
  if (result.status !== 0)
    failures++
}

console.log(`\n${files.length - failures}/${files.length} frame-fit test files passed.`)
process.exit(failures > 0 ? 1 : 0)
