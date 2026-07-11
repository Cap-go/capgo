import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(import.meta.dirname, '..')
const checkerScript = join(
  repoRoot,
  'scripts/check-read-replica-hyperdrive-schema.sh',
)
const execFileAsync = promisify(execFile)

async function writeMockWrangler(binDir: string) {
  const mockWrangler = join(binDir, 'wrangler')
  await writeFile(
    mockWrangler,
    `#!/usr/bin/env bash
set -euo pipefail
command="$1"
shift
name=''
secrets_file=''
if [[ "$command" == 'delete' ]]; then
  name="$1"
fi
previous=''
for argument in "$@"; do
  if [[ "$previous" == '--name' ]]; then
    name="$argument"
  fi
  if [[ "$previous" == '--secrets-file' ]]; then
    secrets_file="$argument"
  fi
  previous="$argument"
done
if [[ "$command" == 'deploy' ]]; then
  [[ -n "$name" ]]
  [[ -n "$secrets_file" ]]
  grep -Eq '"READ_REPLICA_SCHEMA_CHECK_TOKEN":"[0-9a-f]{64}"' "$secrets_file"
  printf 'deploy\\t%s\\twith-secrets\\n' "$name" >> "$MOCK_WRANGLER_LOG"
  printf 'Uploaded %s\\nhttps://%s.example.workers.dev\\n' "$name" "$name"
  exit 0
fi
printf '%s\\t%s\\n' "$command" "$name" >> "$MOCK_WRANGLER_LOG"
`,
  )
  await chmod(mockWrangler, 0o755)
}

async function runChecker(binDir: string, env: Record<string, string>) {
  return execFileAsync('bash', [checkerScript], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...env,
      PATH: `${binDir}:${process.env.PATH}`,
      READ_REPLICA_SCHEMA_SYNC_MAX_TIME: '31',
      READ_REPLICA_WRANGLER_CMD: join(binDir, 'wrangler'),
    },
  })
}

describe('read-replica ephemeral schema checker', () => {
  it.concurrent(
    'deploys the token with one Worker version and uses the authenticated primary catalog for readiness',
    async () => {
      const testDir = await mkdtemp(
        join(tmpdir(), 'capgo-read-replica-worker-'),
      )
      const binDir = join(testDir, 'bin')
      const wranglerLog = join(testDir, 'wrangler.log')
      const sourceCatalogCalls = join(testDir, 'source-catalog-calls')
      const mockCurl = join(binDir, 'curl')

      await mkdir(binDir)
      await writeMockWrangler(binDir)
      await writeFile(
        mockCurl,
        `#!/usr/bin/env bash
set -euo pipefail
output=''
authorization=''
previous=''
url=''
for argument in "$@"; do
  if [[ "$previous" == '-o' ]]; then
    output="$argument"
  fi
  if [[ "$previous" == '--header' && "$argument" == "authorization:"* ]]; then
    authorization="$argument"
  fi
  previous="$argument"
  url="$argument"
done
[[ "$authorization" == "authorization: Bearer "* ]]
token="\${authorization#authorization: Bearer }"
[[ "$token" =~ ^[0-9a-f]{64}$ ]]
case "$url" in
  */source-catalog)
    calls=0
    if [[ -f "$MOCK_SOURCE_CATALOG_CALLS" ]]; then
      calls="$(<"$MOCK_SOURCE_CATALOG_CALLS")"
    fi
    calls=$((calls + 1))
    printf '%s' "$calls" > "$MOCK_SOURCE_CATALOG_CALLS"
    [[ "$calls" == '1' ]]
    printf '{"version":1}' > "$output"
    printf '200'
    ;;
  */sync-from-master)
    printf '{"applied":[],"skipped":[],"issues":[]}' > "$output"
    printf '200'
    ;;
  *)
    exit 1
    ;;
esac
`,
      )
      await chmod(mockCurl, 0o755)

      const { stderr, stdout } = await runChecker(binDir, {
        GITHUB_RUN_ATTEMPT: '2',
        GITHUB_RUN_ID: '12345',
        MOCK_SOURCE_CATALOG_CALLS: sourceCatalogCalls,
        MOCK_WRANGLER_LOG: wranglerLog,
        READ_REPLICA_SCHEMA_CHECK_READY_ATTEMPTS: '1',
      })

      expect(stderr).toBe('')
      expect(stdout).toContain(
        'Read replica matches the live primary schema for the selected tables.',
      )
      expect(await readFile(sourceCatalogCalls, 'utf8')).toBe('1')

      const invocations = (await readFile(wranglerLog, 'utf8'))
        .trim()
        .split('\n')
      const deployedNames = invocations
        .filter(line => line.startsWith('deploy\t'))
        .map(line => line.split('\t')[1])
      const deletedNames = invocations
        .filter(line => line.startsWith('delete\t'))
        .map(line => line.split('\t')[1])

      expect(deployedNames).toEqual([
        expect.stringMatching(/^capgo-rr-[0-9a-f]{16}-12345-2$/),
      ])
      expect(deletedNames).toEqual(deployedNames)
      expect(invocations.some(line => line.startsWith('secret\t'))).toBe(
        false,
      )
      expect(invocations.some(line => line.startsWith('dev\t'))).toBe(false)
    },
    15_000,
  )

  it.concurrent(
    'prints the last readiness status and Worker response',
    async () => {
      const testDir = await mkdtemp(
        join(tmpdir(), 'capgo-read-replica-readiness-'),
      )
      const binDir = join(testDir, 'bin')
      const wranglerLog = join(testDir, 'wrangler.log')
      const mockCurl = join(binDir, 'curl')

      await mkdir(binDir)
      await writeMockWrangler(binDir)
      await writeFile(
        mockCurl,
        `#!/usr/bin/env bash
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
  */source-catalog)
    printf '{"error":"missing_master_hyperdrive_binding"}' > "$output"
    printf '503'
    ;;
  *)
    exit 1
    ;;
esac
`,
      )
      await chmod(mockCurl, 0o755)

      const failure = await runChecker(binDir, {
        GITHUB_RUN_ATTEMPT: '2',
        GITHUB_RUN_ID: '12345',
        MOCK_WRANGLER_LOG: wranglerLog,
        READ_REPLICA_SCHEMA_CHECK_READY_ATTEMPTS: '1',
      }).catch(error => error as { stdout: string, stderr: string })

      expect(failure.stdout).toContain('last HTTP status was 503')
      expect(failure.stdout).toContain('Last Worker response:')
      expect(failure.stdout).toContain(
        '{"error":"missing_master_hyperdrive_binding"}',
      )
      expect((await readFile(wranglerLog, 'utf8')).trim().split('\n')).toEqual(
        expect.arrayContaining([expect.stringMatching(/^delete\tcapgo-rr-/)]),
      )
    },
    15_000,
  )

  it.concurrent(
    'preflights the committed catalog before the primary migration',
    async () => {
      const testDir = await mkdtemp(
        join(tmpdir(), 'capgo-read-replica-catalog-preflight-'),
      )
      const binDir = join(testDir, 'bin')
      const wranglerLog = join(testDir, 'wrangler.log')
      const mockCurl = join(binDir, 'curl')

      await mkdir(binDir)
      await writeMockWrangler(binDir)
      await writeFile(
        mockCurl,
        `#!/usr/bin/env bash
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
  */catalog)
    printf '{"version":1}' > "$output"
    printf '200'
    ;;
  */sync-from-catalog)
    printf '{"applied":[],"skipped":[],"issues":[]}' > "$output"
    printf '200'
    ;;
  *)
    exit 1
    ;;
esac
`,
      )
      await chmod(mockCurl, 0o755)

      const { stdout } = await runChecker(binDir, {
        GITHUB_RUN_ATTEMPT: '2',
        GITHUB_RUN_ID: '12345',
        MOCK_WRANGLER_LOG: wranglerLog,
        READ_REPLICA_SCHEMA_CHECK_READY_ATTEMPTS: '1',
        READ_REPLICA_SCHEMA_SYNC_SOURCE: 'catalog',
      })

      expect(stdout).toContain(
        'Read replica preflight matches the committed selected-table catalog.',
      )
    },
    15_000,
  )

  it.concurrent('prints the sync transport error instead of only timing out', async () => {
    const testDir = await mkdtemp(
      join(tmpdir(), 'capgo-read-replica-sync-error-'),
    )
    const binDir = join(testDir, 'bin')
    const wranglerLog = join(testDir, 'wrangler.log')
    const mockCurl = join(binDir, 'curl')

    await mkdir(binDir)
    await writeMockWrangler(binDir)
    await writeFile(
      mockCurl,
      `#!/usr/bin/env bash
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
  */source-catalog)
    printf '{"version":1}' > "$output"
    printf '200'
    ;;
  */sync-from-master)
    printf 'curl: (28) Operation timed out after 31 milliseconds' >&2
    printf '000'
    exit 28
    ;;
  *)
    exit 1
    ;;
esac
`,
    )
    await chmod(mockCurl, 0o755)

    const failure = await runChecker(binDir, {
      GITHUB_RUN_ATTEMPT: '2',
      GITHUB_RUN_ID: '12345',
      MOCK_WRANGLER_LOG: wranglerLog,
      READ_REPLICA_SCHEMA_CHECK_READY_ATTEMPTS: '1',
    }).catch(error => error as { stdout: string, stderr: string })

    expect(failure.stdout).toContain('returned HTTP 000')
    expect(failure.stdout).toContain('Last curl error:')
    expect(failure.stdout).toContain('curl: (28) Operation timed out')
  }, 15_000)
})
