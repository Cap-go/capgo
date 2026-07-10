import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(import.meta.dirname, '..')
const checkerScript = join(repoRoot, 'scripts/check-read-replica-hyperdrive-schema.sh')
const expectedCatalog = join(repoRoot, 'read_replicate/schema_replicate.catalog.json')
const execFileAsync = promisify(execFile)

describe('read-replica ephemeral schema checker', () => {
  it.concurrent('uses a unique deployed Worker per run and always deletes it', async () => {
    const testDir = await mkdtemp(join(tmpdir(), 'capgo-read-replica-worker-'))
    const binDir = join(testDir, 'bin')
    const wranglerLog = join(testDir, 'wrangler.log')
    const mockWrangler = join(binDir, 'wrangler')
    const mockCurl = join(binDir, 'curl')

    await mkdir(binDir)
    await writeFile(mockWrangler, `#!/usr/bin/env bash
set -euo pipefail
command="$1"
shift
name=''
if [[ "$command" == 'delete' ]]; then
  name="$1"
fi
previous=''
for argument in "$@"; do
  if [[ "$previous" == '--name' ]]; then
    name="$argument"
  fi
  previous="$argument"
done
if [[ "$command" == 'secret' ]]; then
  IFS= read -r token || true
  [[ "$(printf %s "$token" | wc -c)" -eq 64 ]]
fi
printf '%s\\t%s\\n' "$command" "$name" >> "$MOCK_WRANGLER_LOG"
if [[ "$command" == 'deploy' ]]; then
  printf 'Uploaded %s\\nhttps://%s.example.workers.dev\\n' "$name" "$name"
fi
`)
    await writeFile(mockCurl, `#!/usr/bin/env bash
set -euo pipefail
output=''
previous=''
url=''
for argument in "$@"; do
  if [[ "$previous" == '-o' ]]; then
    output="$argument"
  fi
  previous="$argument"
  url="$argument"
done
case "$url" in
  */ok)
    exit 0
    ;;
  */sync-additive)
    printf '{"applied":[]}' > "$output"
    printf '200'
    ;;
  */catalog)
    cp "$EXPECTED_SCHEMA_CATALOG" "$output"
    printf '200'
    ;;
  *)
    exit 1
    ;;
esac
`)
    await Promise.all([chmod(mockWrangler, 0o755), chmod(mockCurl, 0o755)])

    const runChecker = async () => {
      const { stderr, stdout } = await execFileAsync('bash', [checkerScript], {
        cwd: repoRoot,
        env: {
          ...process.env,
          EXPECTED_SCHEMA_CATALOG: expectedCatalog,
          GITHUB_RUN_ATTEMPT: '2',
          GITHUB_RUN_ID: '12345',
          MOCK_WRANGLER_LOG: wranglerLog,
          PATH: `${binDir}:${process.env.PATH}`,
          READ_REPLICA_SCHEMA_SYNC_MAX_TIME: '31',
          READ_REPLICA_WRANGLER_CMD: mockWrangler,
        },
      })
      expect(stderr).toBe('')
      expect(stdout).toContain('Read-replica schema is compatible with the committed snapshot.')
    }

    await Promise.all([runChecker(), runChecker()])

    const invocations = (await readFile(wranglerLog, 'utf8')).trim().split('\n')
    const deployedNames = invocations
      .filter(line => line.startsWith('deploy\t'))
      .map(line => line.split('\t')[1])
    const deletedNames = invocations
      .filter(line => line.startsWith('delete\t'))
      .map(line => line.split('\t')[1])

    expect(deployedNames).toHaveLength(2)
    expect(new Set(deployedNames).size).toBe(2)
    expect(deployedNames).toEqual(expect.arrayContaining([
      expect.stringMatching(/^capgo-rr-[0-9a-f]{16}-12345-2$/),
      expect.stringMatching(/^capgo-rr-[0-9a-f]{16}-12345-2$/),
    ]))
    expect(deletedNames.sort()).toEqual(deployedNames.sort())
    expect(invocations.some(line => line.startsWith('dev\t'))).toBe(false)
  })
})
